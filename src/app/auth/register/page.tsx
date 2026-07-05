"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { useRouter } from "next/navigation";
import { ArrowRight, Eye, EyeOff } from "lucide-react";
import {
  AuthField,
  AuthShell,
  wolfInputClass,
  wolfPrimaryButtonClass,
} from "../auth-shell";

type RegisterData = {
  firstname: string;
  username: string;
  lastname: string;
  email?: string;
  password: string;
  confirmPassword: string;
  phone: string;
  emergencyPhone?: string;
};

function RegisterPage() {
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<RegisterData>();
  const router = useRouter();
  const [error, setError] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  const onSubmit = handleSubmit(async (data) => {
    setError("");

    if (data.password !== data.confirmPassword) {
      setError("Las contraseñas no coinciden");
      return;
    }

    try {
      const response = await fetch("/api/auth/register", {
        method: "POST",
        body: JSON.stringify({
          firstname: data.firstname,
          username: data.username,
          lastname: data.lastname,
          email: data.email,
          password: data.password,
          phone: data.phone,
          emergencyPhone: data.emergencyPhone,
        }),
        headers: { "Content-Type": "application/json" },
      });

      const result = await response.json();

      if (response.status === 400 && result.message?.includes("registrado")) {
        setError(result.message);
        return;
      }

      if (response.status === 201) {
        router.push("/auth/login");
        return;
      }

      setError(result.message || "Error en el registro. Inténtalo de nuevo.");
    } catch {
      setError("Error en el registro, por favor inténtalo de nuevo.");
    }
  });

  return (
    <AuthShell
      eyebrow="Nueva cuenta"
      title="Crear cuenta"
      description="Regístrate para administrar tu acceso, tus datos y tu historial. Puedes agregar un email para activar recuperación segura."
      onBack={() => router.push("/")}
    >
      <form method="post" onSubmit={onSubmit} className="space-y-4">
        {error && (
          <p className="border border-[#E5484D]/30 bg-[#E5484D]/10 px-3 py-2 text-sm font-semibold text-[#B42318]">
            {error}
          </p>
        )}

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <AuthField label="Nombre" error={errors.firstname?.message}>
            <input
              type="text"
              placeholder="Nombre"
              {...register("firstname", {
                required: "El nombre es obligatorio",
              })}
              className={wolfInputClass}
            />
          </AuthField>

          <AuthField label="Apellido" error={errors.lastname?.message}>
            <input
              type="text"
              placeholder="Apellido"
              {...register("lastname", {
                required: "El apellido es obligatorio",
              })}
              className={wolfInputClass}
            />
          </AuthField>
        </div>

        <AuthField label="Usuario" error={errors.username?.message}>
          <input
            type="text"
            placeholder="nombre_usuario"
            {...register("username", { required: "El usuario es obligatorio" })}
            className={wolfInputClass}
          />
        </AuthField>

        <AuthField label="Email de recuperación" error={errors.email?.message}>
          <input
            type="email"
            placeholder="correo@ejemplo.com"
            autoComplete="email"
            {...register("email", {
              pattern: {
                value: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
                message: "Ingresa un email válido",
              },
            })}
            className={wolfInputClass}
          />
        </AuthField>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <AuthField label="Teléfono" error={errors.phone?.message}>
            <input
              type="tel"
              placeholder="987654321"
              {...register("phone", {
                required: "Teléfono obligatorio",
                minLength: {
                  value: 6,
                  message: "Ingresa un teléfono válido",
                },
              })}
              className={wolfInputClass}
            />
          </AuthField>

          <AuthField label="Emergencia">
            <input
              type="tel"
              placeholder="Opcional"
              {...register("emergencyPhone")}
              className={wolfInputClass}
            />
          </AuthField>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <AuthField label="Contraseña" error={errors.password?.message}>
            <div className="relative">
              <input
                type={showPassword ? "text" : "password"}
                placeholder="Contraseña"
                {...register("password", {
                  required: "Contraseña obligatoria",
                  minLength: {
                    value: 8,
                    message: "Mínimo 8 caracteres",
                  },
                })}
                className={`${wolfInputClass} pr-11`}
              />
              <button
                type="button"
                onClick={() => setShowPassword((value) => !value)}
                className="absolute inset-y-0 right-3 grid place-items-center text-[#6B6B68] hover:text-[#0A0A0A]"
                aria-label={
                  showPassword ? "Ocultar contraseña" : "Mostrar contraseña"
                }
              >
                {showPassword ? (
                  <EyeOff className="h-5 w-5" />
                ) : (
                  <Eye className="h-5 w-5" />
                )}
              </button>
            </div>
          </AuthField>

          <AuthField
            label="Confirmar contraseña"
            error={errors.confirmPassword?.message}
          >
            <div className="relative">
              <input
                type={showConfirmPassword ? "text" : "password"}
                placeholder="Confirmar contraseña"
                {...register("confirmPassword", {
                  required: "Confirmación obligatoria",
                })}
                className={`${wolfInputClass} pr-11`}
              />
              <button
                type="button"
                onClick={() => setShowConfirmPassword((value) => !value)}
                className="absolute inset-y-0 right-3 grid place-items-center text-[#6B6B68] hover:text-[#0A0A0A]"
                aria-label={
                  showConfirmPassword
                    ? "Ocultar confirmación"
                    : "Mostrar confirmación"
                }
              >
                {showConfirmPassword ? (
                  <EyeOff className="h-5 w-5" />
                ) : (
                  <Eye className="h-5 w-5" />
                )}
              </button>
            </div>
          </AuthField>
        </div>

        <button className={wolfPrimaryButtonClass}>
          Crear cuenta
          <ArrowRight className="h-4 w-4" />
        </button>

        <div className="text-center text-sm text-[#6B6B68]">
          <button
            type="button"
            onClick={() => router.push("/auth/login")}
            className="font-semibold text-[#0A0A0A] hover:text-[#FF7A1A]"
          >
            ¿Ya tienes cuenta? Inicia sesión
          </button>
        </div>
      </form>
    </AuthShell>
  );
}

export default RegisterPage;
