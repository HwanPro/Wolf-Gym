"use client";

import { useForm, SubmitHandler } from "react-hook-form";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useState, useEffect } from "react";
import { ArrowLeft, ArrowRight, Eye, EyeOff } from "lucide-react";
import { useSession } from "next-auth/react";

type FormData = {
  username: string;
  password: string;
  otp?: string;
};

export default function AuthPage() {
  const router = useRouter();
  const { data: session, status } = useSession();
  const [error, setError] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState<boolean>(false);

  useEffect(() => {
    if (status === "authenticated") {
      const role = (session.user as { role?: string })?.role;
      if (role === "admin") router.push("/admin/dashboard");
      else router.push("/client/dashboard");
    }
  }, [session, status, router]);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<FormData>();

  const handleLogin: SubmitHandler<FormData> = async (data) => {
    setError(null);
    const res = await signIn("credentials", {
      redirect: false,
      username: data.username,
      password: data.password,
      otp: data.otp?.trim() || undefined,
      callbackUrl: "/",
    });
    if (res?.error) {
      setError(res.error);
    } else if (res?.ok) {
      router.refresh();
    }
  };

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Bebas+Neue&family=Inter:wght@400;500;600;700;800&display=swap');
        @media (max-width: 767px) {
          .login-shell {
            min-height: 100dvh !important;
            background: #F5F5F4 !important;
          }
          .login-aside {
            display: none !important;
          }
          .login-main {
            flex: none !important;
            width: 100% !important;
            min-height: 100dvh !important;
            align-items: flex-start !important;
            padding: 72px 20px 32px !important;
          }
          .login-panel {
            max-width: 380px !important;
            margin: 0 auto !important;
          }
          .login-back {
            margin: 0 auto 28px !important;
            max-width: 380px !important;
          }
          .login-title {
            font-size: 44px !important;
            margin-bottom: 28px !important;
          }
        }
      `}</style>
      <div
        className="login-shell"
        style={{
          display: "flex",
          minHeight: "100vh",
          fontFamily: "'Inter', system-ui, sans-serif",
        }}
      >
        {/* Left panel — dark with diagonal stripes */}
        <div
          className="login-aside"
          style={{
            width: "42%",
            background: "#0A0A0A",
            position: "relative",
            overflow: "hidden",
            display: "flex",
            flexDirection: "column",
            justifyContent: "space-between",
            padding: "56px 48px",
          }}
        >
          {/* Diagonal stripe texture */}
          <div
            style={{
              position: "absolute",
              inset: 0,
              backgroundImage:
                "repeating-linear-gradient(135deg, rgba(255,194,26,0.04) 0px, rgba(255,194,26,0.04) 1px, transparent 1px, transparent 40px)",
              pointerEvents: "none",
            }}
          />
          {/* Logo */}
          <div style={{ position: "relative", zIndex: 1 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <div
                style={{
                  width: 40,
                  height: 40,
                  background: "#FFC21A",
                  borderRadius: 10,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontFamily: "'Bebas Neue', 'Arial Narrow', sans-serif",
                  fontSize: 18,
                  color: "#0A0A0A",
                  letterSpacing: "0.04em",
                }}
              >
                WG
              </div>
              <span
                style={{
                  fontFamily: "'Bebas Neue', 'Arial Narrow', sans-serif",
                  fontSize: 22,
                  letterSpacing: "0.1em",
                  color: "#fff",
                }}
              >
                WOLF <span style={{ color: "#FFC21A" }}>GYM</span>
              </span>
            </div>
          </div>

          {/* Hero headline */}
          <div style={{ position: "relative", zIndex: 1 }}>
            <h1
              style={{
                fontFamily: "'Bebas Neue', 'Arial Narrow', sans-serif",
                fontSize: 80,
                lineHeight: 0.95,
                letterSpacing: "0.02em",
                color: "#fff",
                margin: 0,
              }}
            >
              ENTRENA
              <br />
              COMO
              <br />
              <span style={{ color: "#FFC21A" }}>BESTIA.</span>
            </h1>
            <p
              style={{
                marginTop: 24,
                fontSize: 16,
                color: "rgba(255,255,255,0.55)",
                lineHeight: 1.6,
                maxWidth: 320,
              }}
            >
              Tu gimnasio, tu rutina, tu progreso. Todo en un solo lugar.
            </p>
          </div>

          {/* Stats bar */}
          <div
            style={{
              position: "relative",
              zIndex: 1,
              display: "flex",
              gap: 32,
            }}
          >
            {[
              { value: "200+", label: "Miembros" },
              { value: "100%", label: "Resultados" },
            ].map((stat) => (
              <div key={stat.label}>
                <p
                  style={{
                    fontFamily: "'Bebas Neue', 'Arial Narrow', sans-serif",
                    fontSize: 28,
                    color: "#FFC21A",
                    margin: 0,
                    lineHeight: 1,
                  }}
                >
                  {stat.value}
                </p>
                <p
                  style={{
                    fontSize: 11,
                    fontWeight: 700,
                    letterSpacing: "0.14em",
                    textTransform: "uppercase",
                    color: "rgba(255,255,255,0.4)",
                    margin: "4px 0 0",
                  }}
                >
                  {stat.label}
                </p>
              </div>
            ))}
          </div>
        </div>

        {/* Right panel — light form */}
        <div
          className="login-main"
          style={{
            flex: 1,
            background: "#F5F5F4",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "40px 32px",
          }}
        >
          <div className="login-panel" style={{ width: "100%", maxWidth: 420 }}>
            <button
              type="button"
              className="login-back"
              onClick={() => router.push("/")}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 8,
                marginBottom: 32,
                background: "none",
                border: "none",
                padding: 0,
                color: "#6B6B68",
                cursor: "pointer",
                fontFamily: "'Inter', system-ui, sans-serif",
                fontSize: 14,
                fontWeight: 600,
              }}
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLButtonElement).style.color = "#FF7A1A";
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLButtonElement).style.color = "#6B6B68";
              }}
            >
              <ArrowLeft style={{ width: 16, height: 16 }} />
              Volver al inicio
            </button>

            {/* Eyebrow */}
            <p
              style={{
                fontFamily: "'Inter', system-ui, sans-serif",
                fontSize: 11,
                fontWeight: 700,
                letterSpacing: "0.18em",
                textTransform: "uppercase",
                color: "#FF7A1A",
                margin: "0 0 12px",
              }}
            >
              BIENVENIDO DE VUELTA
            </p>

            {/* Title */}
            <h1
              className="login-title"
              style={{
                fontFamily: "'Bebas Neue', 'Arial Narrow', sans-serif",
                fontSize: 52,
                color: "#0A0A0A",
                letterSpacing: "0.02em",
                margin: "0 0 32px",
                lineHeight: 1,
              }}
            >
              INICIA SESIÓN
            </h1>

            <form
              method="post"
              onSubmit={handleSubmit(handleLogin)}
              style={{ display: "flex", flexDirection: "column", gap: 20 }}
            >
              {error && (
                <div
                  style={{
                    border: "1px solid rgba(229,72,77,0.3)",
                    background: "rgba(229,72,77,0.08)",
                    padding: "10px 14px",
                    borderRadius: 10,
                    fontSize: 14,
                    fontWeight: 600,
                    color: "#B42318",
                  }}
                >
                  {error}
                </div>
              )}

              {/* Username field */}
              <div>
                <label
                  htmlFor="username"
                  style={{
                    display: "block",
                    fontSize: 11,
                    fontWeight: 700,
                    letterSpacing: "0.12em",
                    textTransform: "uppercase",
                    color: "#0A0A0A",
                    marginBottom: 6,
                  }}
                >
                  Usuario
                </label>
                <input
                  id="username"
                  type="text"
                  autoComplete="username"
                  {...register("username", {
                    required: {
                      value: true,
                      message: "El usuario es obligatorio",
                    },
                  })}
                  placeholder="tu_usuario"
                  style={{
                    width: "100%",
                    height: 42,
                    padding: "0 14px",
                    background: "#fff",
                    border: errors.username
                      ? "1px solid #E5484D"
                      : "1px solid #E7E5E1",
                    borderRadius: 10,
                    color: "#1A1A1A",
                    fontFamily: "'Inter', system-ui, sans-serif",
                    fontSize: 14,
                    outline: "none",
                    boxSizing: "border-box",
                  }}
                />
                {errors.username && (
                  <p style={{ marginTop: 4, fontSize: 12, color: "#E5484D" }}>
                    {errors.username.message}
                  </p>
                )}
              </div>

              {/* Password field */}
              <div>
                <label
                  htmlFor="password"
                  style={{
                    display: "block",
                    fontSize: 11,
                    fontWeight: 700,
                    letterSpacing: "0.12em",
                    textTransform: "uppercase",
                    color: "#0A0A0A",
                    marginBottom: 6,
                  }}
                >
                  Contraseña
                </label>
                <div style={{ position: "relative" }}>
                  <input
                    id="password"
                    type={showPassword ? "text" : "password"}
                    autoComplete="current-password"
                    {...register("password", {
                      required: {
                        value: true,
                        message: "Contraseña obligatoria",
                      },
                    })}
                    placeholder="********"
                    style={{
                      width: "100%",
                      height: 42,
                      padding: "0 44px 0 14px",
                      background: "#fff",
                      border: errors.password
                        ? "1px solid #E5484D"
                        : "1px solid #E7E5E1",
                      borderRadius: 10,
                      color: "#1A1A1A",
                      fontFamily: "'Inter', system-ui, sans-serif",
                      fontSize: 14,
                      outline: "none",
                      boxSizing: "border-box",
                    }}
                  />
                  <button
                    type="button"
                    style={{
                      position: "absolute",
                      right: 12,
                      top: "50%",
                      transform: "translateY(-50%)",
                      background: "none",
                      border: "none",
                      cursor: "pointer",
                      color: "#6B6B68",
                      display: "flex",
                      alignItems: "center",
                      padding: 0,
                    }}
                    onClick={() => setShowPassword((prev) => !prev)}
                    aria-label={
                      showPassword ? "Ocultar contraseña" : "Mostrar contraseña"
                    }
                  >
                    {showPassword ? (
                      <EyeOff style={{ width: 20, height: 20 }} />
                    ) : (
                      <Eye style={{ width: 20, height: 20 }} />
                    )}
                  </button>
                </div>
                {errors.password && (
                  <p style={{ marginTop: 4, fontSize: 12, color: "#E5484D" }}>
                    {errors.password.message}
                  </p>
                )}
              </div>

              {/* Forgot password */}
              <div>
                <label
                  htmlFor="otp"
                  style={{
                    display: "block",
                    fontSize: 11,
                    fontWeight: 700,
                    letterSpacing: "0.12em",
                    textTransform: "uppercase",
                    color: "#0A0A0A",
                    marginBottom: 6,
                  }}
                >
                  Código 2FA (si está habilitado)
                </label>
                <input
                  id="otp"
                  type="text"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  maxLength={6}
                  {...register("otp", {
                    pattern: {
                      value: /^\d{6}$/,
                      message: "El código 2FA debe tener 6 dígitos",
                    },
                  })}
                  placeholder="123456"
                  style={{
                    width: "100%",
                    height: 42,
                    padding: "0 14px",
                    background: "#fff",
                    border: errors.otp
                      ? "1px solid #E5484D"
                      : "1px solid #E7E5E1",
                    borderRadius: 10,
                    color: "#1A1A1A",
                    fontFamily: "'Inter', system-ui, sans-serif",
                    fontSize: 14,
                    outline: "none",
                    boxSizing: "border-box",
                  }}
                />
                {errors.otp && (
                  <p style={{ marginTop: 4, fontSize: 12, color: "#E5484D" }}>
                    {errors.otp.message}
                  </p>
                )}
              </div>

              {/* Forgot password */}
              <button
                type="button"
                onClick={() => router.push("/auth/forgot-password")}
                style={{
                  alignSelf: "flex-start",
                  background: "none",
                  border: "none",
                  padding: 0,
                  fontSize: 13,
                  fontWeight: 700,
                  color: "#FF7A1A",
                  cursor: "pointer",
                  textDecoration: "none",
                  marginTop: -8,
                }}
              >
                ¿Olvidaste tu contraseña?
              </button>

              {/* Submit */}
              <button
                type="submit"
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 8,
                  width: "100%",
                  height: 48,
                  background: "#FFC21A",
                  color: "#0A0A0A",
                  border: "1px solid #FFC21A",
                  borderRadius: 10,
                  fontFamily: "'Inter', system-ui, sans-serif",
                  fontSize: 15,
                  fontWeight: 700,
                  cursor: "pointer",
                  transition: "background 0.15s",
                }}
                onMouseEnter={(e) => {
                  (e.currentTarget as HTMLButtonElement).style.background =
                    "#FF7A1A";
                  (e.currentTarget as HTMLButtonElement).style.borderColor =
                    "#FF7A1A";
                }}
                onMouseLeave={(e) => {
                  (e.currentTarget as HTMLButtonElement).style.background =
                    "#FFC21A";
                  (e.currentTarget as HTMLButtonElement).style.borderColor =
                    "#FFC21A";
                }}
              >
                Iniciar sesión
                <ArrowRight style={{ width: 16, height: 16 }} />
              </button>

              {/* Register link */}
              <div
                style={{ textAlign: "center", fontSize: 13, color: "#6B6B68" }}
              >
                <button
                  onClick={() => router.push("/auth/register")}
                  type="button"
                  style={{
                    background: "none",
                    border: "none",
                    padding: 0,
                    fontSize: 13,
                    fontWeight: 600,
                    color: "#0A0A0A",
                    cursor: "pointer",
                    transition: "color 0.12s",
                  }}
                  onMouseEnter={(e) => {
                    (e.currentTarget as HTMLButtonElement).style.color =
                      "#FF7A1A";
                  }}
                  onMouseLeave={(e) => {
                    (e.currentTarget as HTMLButtonElement).style.color =
                      "#0A0A0A";
                  }}
                >
                  ¿No tienes cuenta? Regístrate
                </button>
              </div>
            </form>
          </div>
        </div>
      </div>
    </>
  );
}
