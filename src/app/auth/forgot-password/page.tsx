"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight } from "lucide-react";
import {
  AuthField,
  AuthShell,
  wolfInputClass,
  wolfPrimaryButtonClass,
} from "../auth-shell";

export default function ForgotPasswordPage() {
  const router = useRouter();
  const [identifier, setIdentifier] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cooldown, setCooldown] = useState<number>(0);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    let timer: NodeJS.Timeout;
    if (cooldown > 0) {
      timer = setInterval(() => {
        setCooldown((prev) => {
          if (prev <= 1) {
            clearInterval(timer);
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    }
    return () => clearInterval(timer);
  }, [cooldown]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (cooldown > 0) return; // Evita nuevos envíos mientras esté en cooldown

    try {
      setIsLoading(true);
      setError(null);
      setMessage(null);

      const res = await fetch("/api/auth/reset-password", {
        method: "POST",
        body: JSON.stringify({ identifier }),
        headers: { "Content-Type": "application/json" },
      });

      const data = await res.json();
      if (res.ok) {
        setMessage(data.message);
        setError(null);
        // Inicia el cooldown, por ejemplo, 60 segundos
        setCooldown(60);
      } else {
        setError(data.message);
        setMessage(null);
      }
    } catch (err) {
      console.error("Error en solicitud:", err);
      setError("Hubo un error, intenta nuevamente.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <AuthShell
      compact
      eyebrow="Seguridad"
      title="Recuperar clave"
      description="Ingresa tu usuario o correo. La recuperación requiere un correo verificado."
      backLabel="Volver al login"
      onBack={() => router.push("/auth/login")}
    >
      <form onSubmit={handleSubmit} className="space-y-5">
        {message && (
          <p role="status" className="border border-[#2EBD75]/30 bg-[#2EBD75]/10 px-3 py-2 text-sm font-semibold text-[#146C43]">
            {message}
          </p>
        )}
        {error && (
          <p role="alert" className="border border-[#E5484D]/30 bg-[#E5484D]/10 px-3 py-2 text-sm font-semibold text-[#B42318]">
            {error}
          </p>
        )}
        <AuthField label="Usuario o correo">
          <input
            type="text"
            placeholder="Usuario o correo electrónico"
            className={wolfInputClass}
            value={identifier}
            onChange={(e) => setIdentifier(e.target.value)}
            autoComplete="username"
            required
          />
        </AuthField>
        <button
          type="submit"
          disabled={cooldown > 0 || isLoading}
          className={wolfPrimaryButtonClass}
        >
          {isLoading
            ? "Enviando..."
            : cooldown > 0
              ? `Espera ${cooldown} segundos`
              : "Enviar enlace"}
          {!isLoading && cooldown === 0 && <ArrowRight className="h-4 w-4" />}
        </button>
      </form>
    </AuthShell>
  );
}
