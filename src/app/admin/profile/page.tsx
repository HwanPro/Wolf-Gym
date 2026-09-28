"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import ProfileModal from "@/ui/components/ProfileModal";
import { toast, ToastContainer } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";

type AdminMe = {
  id: string;
  username: string;
  firstName: string;
  lastName: string;
  phoneNumber: string;
  image?: string | null;
  role: string;
  profile?: {
    profile_emergency_phone?: string | null;
  } | null;
};

const sty = {
  card: {
    background: "#141414",
    border: "1px solid rgba(255,194,26,0.15)",
    borderRadius: 14,
  } as React.CSSProperties,
  eyebrow: {
    fontSize: 11,
    fontWeight: 700,
    letterSpacing: "0.14em",
    textTransform: "uppercase" as const,
    color: "#FF7A1A",
    margin: "0 0 14px",
  } as React.CSSProperties,
  fieldLabel: {
    fontSize: 11,
    fontWeight: 700,
    letterSpacing: "0.10em",
    textTransform: "uppercase" as const,
    color: "rgba(255,255,255,0.45)",
    margin: "0 0 6px",
  } as React.CSSProperties,
};

export default function AdminProfilePage() {
  const router = useRouter();
  const { data: session } = useSession();
  const isRedirecting = useRef(false);
  const [adminMe, setAdminMe] = useState<AdminMe | null>(null);
  const [loading, setLoading] = useState(true);
  const [showProfileModal, setShowProfileModal] = useState(false);

  const redirectToLogin = useCallback(() => {
    if (isRedirecting.current) return;
    isRedirecting.current = true;
    router.replace("/auth/login");
  }, [router]);

  const loadAdminProfile = useCallback(async () => {
    try {
      const response = await fetch("/api/admin/me", {
        credentials: "include",
        cache: "no-store",
      });

      if (response.status === 401) {
        redirectToLogin();
        return;
      }

      if (!response.ok) {
        throw new Error("No se pudo obtener el perfil de admin");
      }

      const data: AdminMe = await response.json();
      setAdminMe(data);
    } catch (error) {
      console.error("Error cargando perfil admin:", error);
      toast.error("No se pudo cargar el perfil de administrador.");
    } finally {
      setLoading(false);
    }
  }, [redirectToLogin]);

  useEffect(() => {
    loadAdminProfile();
  }, [loadAdminProfile]);

  const initials = adminMe
    ? `${adminMe.firstName?.[0] ?? ""}${adminMe.lastName?.[0] ?? ""}`.toUpperCase()
    : "—";

  const fields = adminMe
    ? [
        { label: "Usuario", value: adminMe.username },
        {
          label: "Nombre completo",
          value: `${adminMe.firstName} ${adminMe.lastName}`,
        },
        { label: "Teléfono", value: adminMe.phoneNumber || "No definido" },
        {
          label: "Emergencia",
          value: adminMe.profile?.profile_emergency_phone || "No definido",
        },
      ]
    : [];

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "#0A0A0A",
        fontFamily: "'Inter', system-ui, sans-serif",
        color: "#fff",
      }}
    >
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Bebas+Neue&family=Inter:wght@400;500;600;700;800&display=swap');

        .admin-profile-layout {
          grid-template-columns: 300px minmax(0, 1fr);
        }

        @media (max-width: 1023px) {
          .admin-profile-layout {
            grid-template-columns: 240px minmax(0, 1fr);
          }
        }

        @media (max-width: 767px) {
          .admin-profile-header {
            align-items: flex-start !important;
            flex-direction: column;
            gap: 16px;
            padding: 20px 16px !important;
          }

          .admin-profile-title {
            font-size: 30px !important;
          }

          .admin-profile-actions {
            flex-wrap: wrap;
            width: 100%;
          }

          .admin-profile-actions > * {
            flex: 1 1 140px;
            justify-content: center;
          }

          .admin-profile-body {
            padding: 20px 16px !important;
          }

          .admin-profile-layout,
          .admin-profile-fields {
            grid-template-columns: minmax(0, 1fr) !important;
          }

          .admin-profile-permissions {
            align-items: flex-start !important;
            flex-wrap: wrap;
          }

          .admin-profile-permissions-copy {
            margin-left: 0 !important;
            width: 100%;
          }
        }
      `}</style>
      <ToastContainer position="top-right" autoClose={3000} theme="dark" />

      {/* Page header */}
      <div
        className="admin-profile-header"
        style={{
          padding: "24px 32px 20px",
          borderBottom: "1px solid rgba(255,194,26,0.12)",
          display: "flex",
          alignItems: "flex-end",
          justifyContent: "space-between",
        }}
      >
        <div>
          <p
            style={{
              fontSize: 11,
              fontWeight: 700,
              letterSpacing: "0.14em",
              textTransform: "uppercase",
              color: "rgba(255,194,26,0.6)",
              margin: "0 0 4px",
            }}
          >
            Cuenta
          </p>
          <h1
            className="admin-profile-title"
            style={{
              fontFamily: "'Bebas Neue', 'Arial Narrow', sans-serif",
              fontSize: 36,
              letterSpacing: "0.02em",
              color: "#fff",
              margin: 0,
              lineHeight: 1,
            }}
          >
            PERFIL DE ADMINISTRADOR
          </h1>
        </div>
        <div
          className="admin-profile-actions"
          style={{ display: "flex", gap: 8 }}
        >
          <a
            href="/admin/dashboard"
            style={{
              display: "inline-flex",
              alignItems: "center",
              height: 40,
              padding: "0 16px",
              background: "transparent",
              border: "1px solid rgba(255,255,255,0.15)",
              borderRadius: 10,
              color: "rgba(255,255,255,0.7)",
              fontSize: 13,
              fontWeight: 600,
              textDecoration: "none",
            }}
          >
            ← Dashboard
          </a>
          {!loading && adminMe && (
            <button
              type="button"
              onClick={() => setShowProfileModal(true)}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 8,
                height: 40,
                padding: "0 20px",
                background: "#FFC21A",
                color: "#0A0A0A",
                border: "1px solid #FFC21A",
                borderRadius: 10,
                fontFamily: "'Inter', system-ui, sans-serif",
                fontSize: 13,
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
              ✎ Editar perfil
            </button>
          )}
        </div>
      </div>

      {/* Body */}
      <div className="admin-profile-body" style={{ padding: "28px 32px" }}>
        {loading && (
          <div
            style={{
              ...sty.card,
              padding: "20px 24px",
              color: "rgba(255,255,255,0.5)",
              fontSize: 14,
            }}
          >
            Cargando perfil...
          </div>
        )}

        {!loading && adminMe && (
          <div
            className="admin-profile-layout"
            style={{ display: "grid", gap: 18, alignItems: "start" }}
          >
            {/* Identity card */}
            <div
              style={{ ...sty.card, overflow: "hidden", textAlign: "center" }}
            >
              {/* Stripe strip */}
              <div
                style={{
                  height: 80,
                  background: "#0A0A0A",
                  backgroundImage:
                    "repeating-linear-gradient(135deg, rgba(255,194,26,0.08) 0px, rgba(255,194,26,0.08) 12px, transparent 12px, transparent 28px)",
                  position: "relative",
                }}
              />
              <div style={{ padding: "0 24px 28px", marginTop: -48 }}>
                {/* Avatar circle */}
                <div
                  style={{
                    width: 96,
                    height: 96,
                    borderRadius: 999,
                    background: "#FFC21A",
                    border: "4px solid #141414",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontFamily: "'Bebas Neue', 'Arial Narrow', sans-serif",
                    fontSize: 38,
                    color: "#0A0A0A",
                    margin: "0 auto",
                    letterSpacing: "0.04em",
                  }}
                >
                  {initials}
                </div>

                <div
                  style={{
                    fontFamily: "'Bebas Neue', 'Arial Narrow', sans-serif",
                    fontSize: 26,
                    letterSpacing: "0.02em",
                    color: "#fff",
                    marginTop: 12,
                    lineHeight: 1,
                  }}
                >
                  {adminMe.firstName.toUpperCase()}{" "}
                  {adminMe.lastName.toUpperCase()}
                </div>

                {/* Role badge */}
                <div
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 6,
                    padding: "4px 12px",
                    background: "rgba(255,194,26,0.12)",
                    border: "1px solid rgba(255,194,26,0.35)",
                    borderRadius: 999,
                    fontSize: 11,
                    fontWeight: 700,
                    letterSpacing: "0.08em",
                    textTransform: "uppercase",
                    color: "#FFC21A",
                    marginTop: 8,
                  }}
                >
                  ★ {adminMe.role}
                </div>

                {/* Username */}
                <p
                  style={{
                    fontSize: 13,
                    color: "rgba(255,255,255,0.45)",
                    marginTop: 8,
                    fontFamily: "monospace",
                  }}
                >
                  @{adminMe.username}
                </p>
              </div>
            </div>

            {/* Details panel */}
            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              <div style={{ ...sty.card, padding: 24 }}>
                <p style={sty.eyebrow}>Información personal</p>
                <div
                  className="admin-profile-fields"
                  style={{
                    display: "grid",
                    gridTemplateColumns: "1fr 1fr",
                    gap: 14,
                  }}
                >
                  {fields.map((field) => (
                    <div key={field.label}>
                      <p style={sty.fieldLabel}>{field.label}</p>
                      <div
                        style={{
                          padding: "11px 14px",
                          background: "#0A0A0A",
                          border: "1px solid rgba(255,194,26,0.12)",
                          borderRadius: 10,
                          fontSize: 14,
                          fontWeight: 500,
                          color:
                            field.value === "No definido"
                              ? "rgba(255,255,255,0.3)"
                              : "#fff",
                        }}
                      >
                        {field.value}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Role card */}
              <div style={{ ...sty.card, padding: 24 }}>
                <p style={sty.eyebrow}>Acceso y permisos</p>
                <div
                  className="admin-profile-permissions"
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 16,
                    padding: "14px 16px",
                    background: "rgba(255,194,26,0.05)",
                    border: "1px solid rgba(255,194,26,0.2)",
                    borderRadius: 10,
                  }}
                >
                  <div
                    style={{
                      width: 44,
                      height: 44,
                      borderRadius: 10,
                      background: "rgba(255,194,26,0.12)",
                      color: "#FFC21A",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontSize: 20,
                      flexShrink: 0,
                    }}
                  >
                    ★
                  </div>
                  <div>
                    <p
                      style={{
                        fontSize: 11,
                        fontWeight: 700,
                        letterSpacing: "0.1em",
                        textTransform: "uppercase",
                        color: "rgba(255,255,255,0.45)",
                        margin: 0,
                      }}
                    >
                      Rol del sistema
                    </p>
                    <p
                      style={{
                        fontFamily: "'Bebas Neue', 'Arial Narrow', sans-serif",
                        fontSize: 22,
                        color: "#FFC21A",
                        margin: "2px 0 0",
                        letterSpacing: "0.04em",
                        lineHeight: 1,
                      }}
                    >
                      {adminMe.role.toUpperCase()}
                    </p>
                  </div>
                  <p
                    className="admin-profile-permissions-copy"
                    style={{
                      marginLeft: "auto",
                      fontSize: 12,
                      color: "rgba(255,255,255,0.4)",
                    }}
                  >
                    Acceso completo al panel de administración
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {showProfileModal && (
        <ProfileModal
          isOpen={showProfileModal}
          onClose={() => setShowProfileModal(false)}
          onSuccess={async () => {
            await loadAdminProfile();
          }}
          userName={adminMe?.username ?? session?.user?.name ?? ""}
          firstName={adminMe?.firstName ?? session?.user?.firstName ?? ""}
          userLastName={adminMe?.lastName ?? session?.user?.lastName ?? ""}
          userPhone={adminMe?.phoneNumber ?? session?.user?.phoneNumber ?? ""}
          userEmergencyPhone={adminMe?.profile?.profile_emergency_phone ?? ""}
          userRole={adminMe?.role ?? session?.user?.role ?? "admin"}
          profileImage={adminMe?.image ?? session?.user?.image ?? ""}
        />
      )}
    </div>
  );
}
