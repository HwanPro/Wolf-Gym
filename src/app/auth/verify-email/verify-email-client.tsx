// app/auth/verify-email/verify-email-client.tsx
"use client";

import { useState, useEffect, useCallback, useRef, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { Button } from "@/ui/button";
import { toast } from "react-toastify";
import { CheckCircle, AlertCircle, Mail, ArrowLeft } from "lucide-react";

function VerifyEmailContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const [isVerifying, setIsVerifying] = useState(false);
  const [isVerified, setIsVerified] = useState(false);
  const [error, setError] = useState("");

  const token = searchParams.get("token");
  const submittedToken = useRef<string | null>(null);

  const verifyEmailToken = useCallback(async () => {
    if (!token) {
      setError("Falta el token de verificación.");
      return;
    }
    if (submittedToken.current === token) return;
    submittedToken.current = token;
    setIsVerifying(true);
    try {
      const response = await fetch("/api/auth/verify-email", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
        cache: "no-store",
      });

      const data = await response.json().catch(() => ({}));

      if (response.ok) {
        setIsVerified(true);
        if (data?.message) toast.success(data.message);
        setTimeout(() => router.push("/auth/login"), 3000);
      } else {
        setError(data?.error || "Error al verificar el email");
      }
    } catch {
      setError("Error al verificar el email");
    } finally {
      setIsVerifying(false);
    }
  }, [token, router]);

  useEffect(() => {
    verifyEmailToken();
  }, [verifyEmailToken]);

  return (
    <div className="grid min-h-screen place-items-center bg-[#F5F5F4] px-4 py-12 text-[#0A0A0A] sm:px-6 lg:px-8">
      <div className="w-full max-w-md">
        <button
          type="button"
          onClick={() => router.push("/auth/login")}
          className="mb-6 inline-flex items-center gap-2 text-sm font-semibold text-[#6B6B68] hover:text-[#FF7A1A]"
        >
          <ArrowLeft className="h-4 w-4" />
          Volver al login
        </button>
        <div className="text-center">
          <div className="mx-auto grid h-16 w-16 place-items-center bg-[#0A0A0A]">
            <Mail className="h-8 w-8 text-[#FFC21A]" />
          </div>
          <p className="mt-6 text-xs font-black uppercase text-[#FF7A1A]">
            Seguridad
          </p>
          <h2 className="mt-2 text-4xl font-black uppercase text-[#0A0A0A]">
            Verificación de email
          </h2>
        </div>

        <div className="mt-8 border border-[#E7E5E1] bg-white p-6 shadow-sm">
          {isVerifying && (
            <div className="text-center">
              <div className="mx-auto mb-4 h-8 w-8 animate-spin rounded-full border-b-2 border-[#FFC21A]" />
              <p className="text-[#6B6B68]">Verificando tu email...</p>
            </div>
          )}

          {isVerified && !isVerifying && (
            <div className="text-center">
              <CheckCircle className="mx-auto mb-4 h-16 w-16 text-[#2EBD75]" />
              <h3 className="mb-2 text-lg font-black uppercase text-[#0A0A0A]">
                Email verificado
              </h3>
              <p className="mb-4 text-[#6B6B68]">
                Tu email ha sido verificado exitosamente. Tu nombre de usuario
                ha sido actualizado.
              </p>
              <p className="text-sm text-[#6B6B68]">
                Serás redirigido al inicio de sesión en unos segundos...
              </p>
            </div>
          )}

          {!isVerified && !isVerifying && error && (
            <div className="text-center">
              <AlertCircle className="mx-auto mb-4 h-16 w-16 text-[#E5484D]" />
              <h3 className="mb-2 text-lg font-black uppercase text-[#0A0A0A]">
                Error de verificación
              </h3>
              <p className="mb-4 text-[#B42318]">{error}</p>
              <Button
                onClick={() => router.push("/profile/security")}
                className="bg-[#FFC21A] font-bold text-[#0A0A0A] hover:bg-[#E5A800]"
              >
                Intentar de nuevo
              </Button>
            </div>
          )}

          {!token && !isVerifying && !isVerified && !error && (
            <div className="text-center">
              <AlertCircle className="mx-auto mb-4 h-16 w-16 text-[#FFC21A]" />
              <h3 className="mb-2 text-lg font-black uppercase text-[#0A0A0A]">
                Token requerido
              </h3>
              <p className="mb-4 text-[#6B6B68]">
                No se encontró un token de verificación válido en la URL.
              </p>
              <Button
                onClick={() => router.push("/profile/security")}
                className="bg-[#FFC21A] font-bold text-[#0A0A0A] hover:bg-[#E5A800]"
              >
                Ir a Configuración de Seguridad
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default function VerifyEmailClient() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-[#F5F5F4]">
          <div className="text-center">
            <div className="mx-auto mb-4 h-8 w-8 animate-spin rounded-full border-b-2 border-[#FFC21A]" />
            <p className="text-[#6B6B68]">Cargando verificación...</p>
          </div>
        </div>
      }
    >
      <VerifyEmailContent />
    </Suspense>
  );
}
