"use client";

import type { ReactNode } from "react";
import { useEffect, useMemo, useState } from "react";
import PhoneInput, { isValidPhoneNumber } from "react-phone-number-input";
import "react-phone-number-input/style.css";
import { Button } from "@/ui/button";
import MembershipSelection from "@/ui/components/MembershipSelection";
import type { ClientFormPayload, PendingCredential } from "../types";
import {
  dialogSurfaceClass,
  fieldClass,
  helperTextClass,
  labelClass,
  phoneInputClass,
  sectionClass,
} from "../lib/form-styles";

interface ClientProfile {
  user_id: string;
  [key: string]: unknown;
}

interface ClientResponse {
  tempPassword?: string;
  clientProfile?: ClientProfile;
  [key: string]: unknown;
}

export default function AddClientDialog({
  onSave,
  onCredentialsUpdate,
}: {
  onSave: (client: ClientFormPayload) => Promise<unknown> | void;
  onCredentialsUpdate?: (cred: PendingCredential) => void;
}) {
  // ---- estados base ----
  const [name, setName] = useState("");
  const [lastName, setLastName] = useState("");
  const [plan, setPlan] = useState<string | null>(null);
  const [membershipStart, setMembershipStart] = useState<string>("");
  const [membershipEnd, setMembershipEnd] = useState<string>("");

  const [address, setAddress] = useState("");
  const [social, setSocial] = useState("");
  const [documentNumber, setDocumentNumber] = useState("");

  const [manualDates, setManualDates] = useState<boolean>(false);
  const [usePromoAssistant, setUsePromoAssistant] = useState<boolean>(false);

  // presets para asistente
  type Preset = "30" | "90" | "180" | "365" | "custom";
  const [promoPreset, setPromoPreset] = useState<Preset>("30");
  const [customDays, setCustomDays] = useState<number>(30);
  const [usedDays, setUsedDays] = useState<number>(0);

  const [phone, setPhone] = useState<string | undefined>(undefined);
  const [emergencyPhone, setEmergencyPhone] = useState<string | undefined>(
    undefined,
  );

  const [debt, setDebt] = useState<string>(""); // como texto para input, convertimos al guardar

  const [errorMessage, setErrorMessage] = useState("");
  const [loading, setLoading] = useState(false);

  const [credentials, setCredentials] = useState<PendingCredential | null>(
    null,
  );
  const normalizePhone = (p?: string) => (p ? p.replace(/\D/g, "") : "");

  // ---- helpers ----
  function generateUsername(name: string): string {
    // usa nombre + apellido para más unicidad
    const base = (name + lastName)
      .trim()
      .toLowerCase()
      .replace(/\s+/g, "")
      .slice(0, 8);

    // Usar timestamp + random para garantizar unicidad
    const timestamp = Date.now().toString().slice(-4);
    const random = Math.floor(Math.random() * 100)
      .toString()
      .padStart(2, "0");

    return `${base}wg${timestamp}${random}`;
  }
  function generatePassword(): string {
    const part1 = Math.random().toString(36).substring(2, 6);
    const part2 = Math.random().toString(36).substring(2, 6);
    return `Cont-${part1}-${part2}`;
  }

  // ---- cálculo automático de fin con asistente ----
  const durationDays = useMemo(() => {
    const base = promoPreset === "custom" ? customDays : Number(promoPreset);
    return Math.max(
      0,
      (Number.isFinite(base) ? base : 0) -
        (Number.isFinite(usedDays) ? usedDays : 0),
    );
  }, [promoPreset, customDays, usedDays]);

  useEffect(() => {
    if (!manualDates || !usePromoAssistant || !membershipStart) return;
    const start = new Date(`${membershipStart}T00:00:00`);
    if (isNaN(start.getTime())) return;

    const end = new Date(start);
    end.setDate(end.getDate() + durationDays);
    const iso = end.toISOString().slice(0, 10);
    setMembershipEnd(iso);
  }, [manualDates, usePromoAssistant, membershipStart, durationDays]);

  // ---- guardar ----
  const handleSave = async () => {
    setErrorMessage("");
    const cleanDocumentNumber = documentNumber.replace(/\D/g, "");
    if (!name || !lastName || !phone) {
      setErrorMessage("Por favor, complete Nombres, Apellidos y Teléfono.");
      return;
    }
    if (cleanDocumentNumber && cleanDocumentNumber.length !== 8) {
      setErrorMessage("El DNI debe tener 8 dígitos.");
      return;
    }
    if (!isValidPhoneNumber(phone)) {
      setErrorMessage("El número de teléfono principal no es válido.");
      return;
    }
    if (emergencyPhone && !isValidPhoneNumber(emergencyPhone)) {
      setErrorMessage("El número de emergencia no es válido.");
      return;
    }
    if (membershipStart && membershipEnd) {
      const start = new Date(membershipStart);
      const end = new Date(membershipEnd);
      if (!(start < end)) {
        setErrorMessage(
          "La fecha de inicio debe ser anterior a la fecha de fin.",
        );
        return;
      }
    }

    const debtValue = Number(debt || 0);
    if (!Number.isFinite(debtValue) || debtValue < 0) {
      setErrorMessage("La deuda debe ser un número válido mayor o igual a 0.");
      return;
    }

    const username = generateUsername(name);
    const password = generatePassword();

    // 👇 payload EXACTO que espera el backend
    const payloadForApi = {
      firstName: name.trim(),
      lastName: lastName.trim(),
      username,
      phoneNumber: normalizePhone(phone),
      profile: {
        plan: plan || "Mensual",
        startDate: membershipStart || "",
        endDate: membershipEnd || "",
        emergencyPhone: normalizePhone(emergencyPhone) || "",
        address: address || "",
        social: social || "",
        documentNumber: cleanDocumentNumber,
        debt: debtValue,
      },
    };

    try {
      setLoading(true);

      // 👉 Llama UNA sola vez al padre; él hace el fetch a /api/clients
      const response = (await onSave(payloadForApi)) as ClientResponse;

      const tempPassword = response?.tempPassword || password;
      const message = `Wolf Gym - credenciales de acceso\n\nUsuario: ${username}\nContraseña: ${tempPassword}\n\nIngresa en: https://www.wolf-gym.com/auth/login\nPuedes cambiar tu contraseña desde tu perfil.`;
      const cred: PendingCredential = {
        username,
        password: tempPassword,
        phone: normalizePhone(phone),
        message,
        whatsappUrl: `https://wa.me/${normalizePhone(phone)}?text=${encodeURIComponent(message)}`,
      };

      const stored = localStorage.getItem("pendingCredentials");
      const list = stored ? JSON.parse(stored) : [];
      list.push(cred);
      localStorage.setItem("pendingCredentials", JSON.stringify(list));

      setCredentials(cred);
      onCredentialsUpdate?.(cred);
    } catch (err) {
      console.error("Error al guardar cliente:", err);
      setErrorMessage("No se pudo guardar el cliente. Intente nuevamente.");
    } finally {
      setLoading(false);
    }
  };

  // ---- UI ----
  return (
    <div className={dialogSurfaceClass}>
      <div className="mb-4">
        <p className="text-xs font-semibold uppercase text-yellow-400">
          Nuevo cliente
        </p>
        <h2 className="text-2xl font-bold text-white">Registro de membresía</h2>
      </div>
      {errorMessage && (
        <p className="mb-3 rounded-md border border-orange-400/30 bg-orange-400/10 px-3 py-2 text-sm font-medium text-orange-200">
          {errorMessage}
        </p>
      )}

      <section className={sectionClass}>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Nombres">
            <input
              className={fieldClass}
              placeholder="Nombres"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </Field>
          <Field label="Apellidos">
            <input
              className={fieldClass}
              placeholder="Apellidos"
              value={lastName}
              onChange={(e) => setLastName(e.target.value)}
            />
          </Field>
          <Field label="DNI">
            <input
              className={fieldClass}
              placeholder="8 dígitos"
              inputMode="numeric"
              maxLength={8}
              value={documentNumber}
              onChange={(e) =>
                setDocumentNumber(e.target.value.replace(/\D/g, "").slice(0, 8))
              }
            />
          </Field>
          <Field label="Red social">
            <input
              className={fieldClass}
              placeholder="@usuario o link"
              value={social}
              onChange={(e) => setSocial(e.target.value)}
            />
          </Field>
          <div className="sm:col-span-2">
            <Field label="Dirección">
              <input
                className={fieldClass}
                placeholder="Dirección opcional"
                value={address}
                onChange={(e) => setAddress(e.target.value)}
              />
            </Field>
          </div>
        </div>
      </section>

      {/* Selección de membresía automática (tu componente) */}
      <section className={`${sectionClass} mt-3`}>
        <MembershipSelection
          onPlanSelect={(selectedPlan, start, end) => {
            setPlan(selectedPlan);
            setMembershipStart(start);
            setMembershipEnd(end);
          }}
        />
      </section>

      {/* Fechas manuales */}
      <section className={`${sectionClass} mt-3 space-y-3`}>
        <label className="flex items-center gap-2 text-sm font-medium text-zinc-300">
          <input
            type="checkbox"
            checked={manualDates}
            onChange={() => setManualDates(!manualDates)}
          />
          Ajustar fechas manualmente
        </label>

        {manualDates && (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <div>
                <input
                  type="date"
                  className={fieldClass}
                  value={membershipStart}
                  onChange={(e) => setMembershipStart(e.target.value)}
                />
              </div>
              <div>
                <input
                  type="date"
                  className={fieldClass}
                  value={membershipEnd}
                  onChange={(e) => setMembershipEnd(e.target.value)}
                />
              </div>
            </div>

            {/* Asistente de promo */}
            <label className="mt-1 flex items-center gap-2 text-sm font-medium text-zinc-300">
              <input
                type="checkbox"
                checked={usePromoAssistant}
                onChange={() => setUsePromoAssistant(!usePromoAssistant)}
              />
              Usar asistente de promo (útil para migraciones)
            </label>

            {usePromoAssistant && (
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                <div>
                  <label className={labelClass}>Preset</label>
                  <select
                    value={promoPreset}
                    onChange={(e) => setPromoPreset(e.target.value as Preset)}
                    className={fieldClass}
                  >
                    <option value="30">Mensual (30 días)</option>
                    <option value="90">Trimestral (90 días)</option>
                    <option value="180">Semestral (180 días)</option>
                    <option value="365">Anual (365 días)</option>
                    <option value="custom">Personalizado</option>
                  </select>
                </div>

                <div>
                  <label className={labelClass}>
                    {promoPreset === "custom"
                      ? "Días (personalizado)"
                      : "Días (preset)"}
                  </label>
                  <input
                    type="number"
                    min={1}
                    className={fieldClass}
                    value={
                      promoPreset === "custom"
                        ? customDays
                        : Number(promoPreset)
                    }
                    onChange={(e) =>
                      setCustomDays(Math.max(1, Number(e.target.value || 1)))
                    }
                    disabled={promoPreset !== "custom"}
                  />
                </div>

                <div>
                  <label className={labelClass}>Días ya consumidos</label>
                  <input
                    type="number"
                    min={0}
                    className={fieldClass}
                    value={usedDays}
                    onChange={(e) =>
                      setUsedDays(Math.max(0, Number(e.target.value || 0)))
                    }
                  />
                </div>

                <div className="col-span-1 text-xs text-zinc-500 sm:col-span-3">
                  Duración efectiva: <b>{durationDays}</b> días
                  {membershipStart && usePromoAssistant ? (
                    <>
                      {" · "}Nuevo fin calculado:{" "}
                      <b>
                        {(() => {
                          if (!membershipEnd) return "—";
                          return new Date(membershipEnd).toLocaleDateString(
                            "es-PE",
                          );
                        })()}
                      </b>
                    </>
                  ) : null}
                </div>
              </div>
            )}
          </>
        )}
      </section>

      {/* Teléfonos */}
      <section className={`${sectionClass} mt-3 grid gap-3 sm:grid-cols-2`}>
        <Field label="Teléfono principal">
          <PhoneInput
            defaultCountry="PE"
            placeholder="987 654 321"
            value={phone}
            onChange={setPhone}
            className={phoneInputClass}
          />
        </Field>
        <Field label="Teléfono de emergencia">
          <PhoneInput
            defaultCountry="PE"
            placeholder="Opcional"
            value={emergencyPhone}
            onChange={setEmergencyPhone}
            className={phoneInputClass}
          />
        </Field>
      </section>

      {/* Deuda */}
      <section className={`${sectionClass} mt-3`}>
        <label className={labelClass}>Deuda (S/.)</label>
        <input
          type="number"
          min={0}
          step="0.01"
          className={fieldClass}
          placeholder="0.00"
          value={debt}
          onChange={(e) => setDebt(e.target.value)}
        />
        <p className={helperTextClass}>
          Si pagó parcial, coloca aquí lo que queda por pagar. Si está al día,
          déjalo en 0.
        </p>
      </section>

      {/* Guardar */}
      <Button
        className="mt-4 h-11 w-full rounded-lg bg-yellow-400 text-sm font-bold text-black shadow-md hover:bg-yellow-500"
        onClick={handleSave}
        disabled={loading}
      >
        {loading ? "Guardando..." : "Guardar Cliente"}
      </Button>

      {/* Modal de credenciales */}
      {credentials && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-lg border border-white/10 bg-zinc-950 p-5 text-zinc-100 shadow-2xl">
            <h2 className="text-center text-xl font-bold text-white">
              ¡Bienvenido a Wolf Gym!
            </h2>
            <p className="text-center text-sm text-zinc-500">
              El éxito es la suma de pequeños esfuerzos repetidos día tras día.
            </p>

            <textarea
              readOnly
              className="mt-4 h-44 w-full resize-none rounded-md border border-white/15 bg-zinc-900 p-4 text-sm text-zinc-100"
              value={credentials.message || ""}
            />

            <Button
              variant="outline"
              className="mt-3 w-full border-white/15 bg-zinc-900 text-sm text-zinc-100 hover:bg-zinc-800"
              onClick={() => {
                navigator.clipboard.writeText(credentials.message || "");
              }}
            >
              Copiar credenciales
            </Button>

            <Button
              className="mt-2 w-full border border-white/15 bg-zinc-900 text-white hover:bg-zinc-800"
              onClick={() =>
                window.open(
                  credentials.whatsappUrl ||
                    `https://wa.me/${credentials.phone}`,
                  "_blank",
                )
              }
            >
              Enviar vía WhatsApp
            </Button>

            <Button
              className="mt-2 w-full bg-yellow-400 text-black hover:bg-yellow-500"
              onClick={() => setCredentials(null)}
            >
              Cerrar
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className={labelClass}>{label}</span>
      {children}
    </label>
  );
}
