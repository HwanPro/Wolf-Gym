"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useSession } from "next-auth/react";

type Checkout = { token?: { id: string }; error?: { user_message?: string }; culqi: () => void; open: () => void; close: () => void };
type Authentication3DS = { eci: string; xid: string; cavv: string; protocolVersion: string; directoryServerTransactionId?: string };
type Config = { enabled: boolean; membershipsEnabled: boolean; mode: "test" | "live" | null; publicKey: string | null };
type Purchase = { items?: { productId: string; quantity: number }[]; planId?: string; email: string; onConfirmed: () => void };
type Attempt = { state: string; ok: boolean; message: string; attemptId?: string; paymentId?: number; total?: number };
declare global {
  interface Window {
    CulqiCheckout?: new (key: string, config: object) => Checkout;
    Culqi3DS?: {
      publicKey: string; settings: object; options: object;
      generateDevice: () => Promise<string>;
      initAuthentication: (token: string) => void;
      reset: () => void;
    };
  }
}
const scripts = new Map<string, Promise<void>>();
function loadScript(url: string) {
  const existing = scripts.get(url);
  if (existing) return existing;
  const promise = new Promise<void>((resolve, reject) => {
    const script = document.createElement("script");
    script.src = url; script.async = true;
    script.onload = () => resolve();
    script.onerror = () => { scripts.delete(url); script.remove(); reject(new Error("No se pudo abrir la pasarela. Intenta de nuevo más tarde.")); };
    document.body.appendChild(script);
  });
  scripts.set(url, promise);
  return promise;
}
export function useCulqiPayment() {
  const { data: session } = useSession();
  const storageKey = session?.user?.id ? `wolf-online-payment-intent:${session.user.id}` : null;
  const storageRef = useRef(storageKey);
  storageRef.current = storageKey;
  const [config, setConfig] = useState<Config>({ enabled: false, membershipsEnabled: false, mode: null, publicKey: null });
  const [processing, setProcessing] = useState(false);
  const [attempt, setAttempt] = useState<Attempt | null>(null);
  const [message, setMessage] = useState("");
  const checkoutRef = useRef<Checkout | null>(null);
  const pendingRef = useRef(false);
  const activeRef = useRef<{ key: string; storageKey: string; purchase: Purchase; body: Record<string, unknown>; amountCents: number } | null>(null);
  const submitRef = useRef<(authentication?: Authentication3DS) => Promise<void>>(async () => {});

  useEffect(() => {
    let active = true;
    fetch("/api/payments/config", { cache: "no-store" }).then(response => response.json()).then(value => { if (active) setConfig(value); }).catch(() => {});
    return () => { active = false; checkoutRef.current?.close(); };
  }, []);

  useEffect(() => {
    activeRef.current = null; pendingRef.current = false; setAttempt(null); setMessage("");
    checkoutRef.current?.close();
    const key = storageKey ? sessionStorage.getItem(storageKey) : null;
    if (key) {
      pendingRef.current = true;
      setMessage("Existe un intento anterior. Consulta su estado antes de volver a pagar.");
    }
  }, [storageKey]);

  const checkStatus = useCallback(async () => {
    if (!storageKey) return;
    const key = sessionStorage.getItem(storageKey);
    if (!key) return;
    setProcessing(true);
    try {
      const response = await fetch(`/api/payments/attempts?key=${encodeURIComponent(key)}`, { cache: "no-store" });
      const value = await response.json();
      if (response.status === 404) {
        sessionStorage.removeItem(storageKey); pendingRef.current = false;
        setAttempt(null); setMessage("No se registró ningún intento. Puedes iniciar la compra.");
      } else if (response.ok) {
        setAttempt(value); setMessage(value.message);
        if (["COMPLETED", "FAILED"].includes(value.state)) {
          sessionStorage.removeItem(storageKey); pendingRef.current = false;
          if (value.state === "COMPLETED") activeRef.current?.purchase.onConfirmed();
        }
      } else setMessage(value.error || "No se pudo consultar el intento. No vuelvas a pagar todavía.");
    } catch { setMessage("No se pudo consultar el intento. No vuelvas a pagar todavía."); }
    finally { setProcessing(false); }
  }, [storageKey]);

  const cancelAuthentication = useCallback(async () => {
    if (!storageKey) return;
    const key = sessionStorage.getItem(storageKey);
    if (!key) return;
    setProcessing(true);
    try {
      const response = await fetch("/api/payments/attempts/cancel", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ key }) });
      const value = await response.json();
      if (response.ok && value.state === "FAILED") {
        window.Culqi3DS?.reset(); activeRef.current = null;
        sessionStorage.removeItem(storageKey); pendingRef.current = false;
        setAttempt(value); setMessage(value.message);
      } else setMessage(value.error || "No se pudo cancelar. Consulta el estado del pago.");
    } catch { setMessage("No se pudo cancelar. Consulta el estado del pago."); }
    finally { setProcessing(false); }
  }, [storageKey]);

  const submit = useCallback(async (authentication?: Authentication3DS) => {
    const active = activeRef.current;
    if (!active) return;
    setProcessing(true);
    try {
      const response = await fetch("/api/payments/culqi", { method: "POST", headers: { "Content-Type": "application/json", "Idempotency-Key": active.key }, body: JSON.stringify({ ...active.body, ...(authentication ? { authentication3DS: authentication } : {}) }) });
      const value = await response.json();
      if (storageRef.current !== active.storageKey) return;
      if (value.state) {
        setAttempt(value); setMessage(value.message);
        if (value.state === "COMPLETED") {
          sessionStorage.removeItem(active.storageKey); pendingRef.current = false;
          active.purchase.onConfirmed();
        } else if (value.state === "FAILED") {
          sessionStorage.removeItem(active.storageKey); pendingRef.current = false;
        } else if (value.state === "REQUIRES_3DS" && !authentication && window.Culqi3DS) {
          window.Culqi3DS.settings = { charge: { totalAmount: active.amountCents, returnUrl: window.location.origin + window.location.pathname, currency: "PEN" }, card: { email: active.purchase.email } };
          window.Culqi3DS.initAuthentication(String(active.body.token));
        }
      } else {
        // Even an HTTP error may follow a committed dispatch. Keep the intent
        // until a status read proves that no payment was submitted.
        setMessage(value.error || "Pago pendiente de confirmación. Consulta su estado antes de volver a pagar.");
      }
    } catch { setMessage("Se perdió la conexión. Consulta el estado del intento antes de volver a pagar."); }
    finally { setProcessing(false); }
  }, []);
  submitRef.current = submit;

  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      if (event.origin !== window.location.origin || !activeRef.current || !event.data || typeof event.data !== "object") return;
      if (event.data.parameters3DS) void submitRef.current(event.data.parameters3DS);
      else if (event.data.error) setMessage("La autenticación bancaria no se completó. Consulta el estado del intento.");
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, []);

  const openCheckout = useCallback(async (purchase: Purchase) => {
    if (!storageKey) { setMessage("Inicia sesión para continuar con el pago."); return; }
    if (!config.enabled || !config.publicKey || (purchase.planId && !config.membershipsEnabled)) { setMessage("La compra online no está disponible. Puedes pagar en recepción."); return; }
    if (pendingRef.current) { setMessage("Consulta el estado del intento anterior antes de volver a pagar."); return; }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(purchase.email)) { setMessage("Ingresa un correo válido para el comprobante."); return; }
    setProcessing(true); setMessage(""); setAttempt(null);
    try {
      const quoteResponse = await fetch("/api/payments/quote", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ items: purchase.items, planId: purchase.planId }) });
      const quote = await quoteResponse.json();
      if (!quoteResponse.ok) { setMessage(quote.error || "No se pudo preparar la compra."); return; }
      await Promise.all([loadScript("https://js.culqi.com/checkout-js"), loadScript("https://3ds.culqi.com")]);
      if (!window.CulqiCheckout || !window.Culqi3DS) throw new Error("Pasarela no disponible.");
      window.Culqi3DS.reset(); window.Culqi3DS.publicKey = config.publicKey;
      const deviceFingerprintId = await window.Culqi3DS.generateDevice();
      if (!deviceFingerprintId) throw new Error("No se pudo preparar la autenticación bancaria.");
      checkoutRef.current?.close();
      const checkout = new window.CulqiCheckout(config.publicKey, {
        settings: { title: "Wolf Gym", currency: "PEN", amount: quote.amountCents },
        client: { email: purchase.email },
        options: { lang: "es", installments: false, modal: true, paymentMethods: { tarjeta: true, yape: quote.amountCents <= 200000, bancaMovil: false, agente: false, billetera: false, cuotealo: false } },
      });
      checkoutRef.current = checkout;
      let sent = false;
      checkout.culqi = () => {
        if (storageRef.current !== storageKey) { checkout.close(); return; }
        if (sent || pendingRef.current) return;
        if (checkout.token?.id) {
          sent = true; checkout.close();
          const key = crypto.randomUUID();
          activeRef.current = { key, storageKey, purchase, amountCents: quote.amountCents, body: { token: checkout.token.id, email: purchase.email, items: purchase.items, planId: purchase.planId, deviceFingerprintId, expectedAmountCents: quote.amountCents } };
          sessionStorage.setItem(storageKey, key); pendingRef.current = true;
          void submitRef.current();
        } else setMessage(checkout.error?.user_message || "No se pudo preparar el pago. Revisa los datos o cancela la compra.");
      };
      checkout.open();
    } catch (error) { setMessage(error instanceof Error ? error.message : "No se pudo abrir la pasarela."); }
    finally { setProcessing(false); }
  }, [config, storageKey]);

  return { config, processing, attempt, message, openCheckout, checkStatus, cancelAuthentication, hasPendingAttempt: pendingRef.current };
}
