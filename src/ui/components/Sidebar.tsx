// src/components/Sidebar.tsx
"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut } from "next-auth/react";

const navSections = [
  {
    eyebrow: "Principal",
    items: [
      { href: "/admin/dashboard", icon: "🏠", label: "Panel" },
      { href: "/admin/clients", icon: "👥", label: "Clientes" },
      { href: "/admin/attendence", icon: "📅", label: "Asistencia" },
    ],
  },
  {
    eyebrow: "Tienda",
    items: [
      { href: "/admin/products", icon: "🛒", label: "Productos" },
      { href: "/admin/sales", icon: "💳", label: "Ventas" },
      { href: "/admin/payments", icon: "💳", label: "Pagos online" },
    ],
  },
  {
    eyebrow: "Contenido",
    items: [
      { href: "/admin/routines", icon: "🏋️", label: "Rutinas" },
      { href: "/admin/images", icon: "🖼️", label: "Imágenes" },
      { href: "/admin/Edit", icon: "✏️", label: "Contenido" },
    ],
  },
  {
    eyebrow: "Admin",
    items: [
      { href: "/admin/reportes", icon: "📊", label: "Reportes" },
      { href: "/admin/profile", icon: "👤", label: "Perfil" },
      { href: "/check-in", icon: "📍", label: "Recepción" },
    ],
  },
];

export default function Sidebar() {
  const pathname = usePathname();

  return (
    <aside
      style={{
        width: 240,
        minHeight: "100vh",
        background: "#0A0A0A",
        borderRight: "1px solid rgba(255,194,26,0.15)",
        display: "flex",
        flexDirection: "column",
        fontFamily: "'Inter', system-ui, sans-serif",
        flexShrink: 0,
      }}
    >
      {/* Logo */}
      <div
        style={{
          padding: "20px 20px 16px",
          borderBottom: "1px solid rgba(255,194,26,0.10)",
          display: "flex",
          alignItems: "center",
          gap: 12,
        }}
      >
        <div
          style={{
            width: 32,
            height: 32,
            background: "#FFC21A",
            borderRadius: 8,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontFamily: "'Bebas Neue', 'Arial Narrow', sans-serif",
            fontSize: 16,
            fontWeight: 700,
            color: "#0A0A0A",
            letterSpacing: "0.04em",
            flexShrink: 0,
          }}
        >
          WG
        </div>
        <span
          style={{
            fontFamily: "'Bebas Neue', 'Arial Narrow', sans-serif",
            fontSize: 20,
            letterSpacing: "0.08em",
            color: "#fff",
          }}
        >
          WOLF <span style={{ color: "#FFC21A" }}>GYM</span>
        </span>
      </div>

      {/* Navigation */}
      <nav style={{ flex: 1, padding: "12px 12px 0", overflowY: "auto" }}>
        {navSections.map((section) => (
          <div key={section.eyebrow} style={{ marginBottom: 20 }}>
            <p
              style={{
                fontFamily: "'Inter', system-ui, sans-serif",
                fontSize: 11,
                fontWeight: 700,
                letterSpacing: "0.12em",
                textTransform: "uppercase",
                color: "rgba(255,194,26,0.5)",
                padding: "0 8px",
                marginBottom: 6,
              }}
            >
              {section.eyebrow}
            </p>
            <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 2 }}>
              {section.items.map((item) => {
                const isActive = pathname === item.href || pathname.startsWith(item.href + "/");
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 10,
                        padding: "8px 10px",
                        borderRadius: 8,
                        textDecoration: "none",
                        fontSize: 14,
                        fontWeight: isActive ? 600 : 400,
                        color: isActive ? "#FFC21A" : "rgba(255,255,255,0.55)",
                        background: isActive ? "rgba(255,194,26,0.10)" : "transparent",
                        transition: "background 0.12s, color 0.12s",
                      }}
                      onMouseEnter={(e) => {
                        if (!isActive) {
                          (e.currentTarget as HTMLAnchorElement).style.background = "rgba(255,194,26,0.08)";
                          (e.currentTarget as HTMLAnchorElement).style.color = "#FFC21A";
                        }
                      }}
                      onMouseLeave={(e) => {
                        if (!isActive) {
                          (e.currentTarget as HTMLAnchorElement).style.background = "transparent";
                          (e.currentTarget as HTMLAnchorElement).style.color = "rgba(255,255,255,0.55)";
                        }
                      }}
                    >
                      <span style={{ fontSize: 16, lineHeight: 1 }}>{item.icon}</span>
                      <span>{item.label}</span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>

      {/* Bottom: user info + logout */}
      <div
        style={{
          padding: "12px 12px 20px",
          borderTop: "1px solid rgba(255,194,26,0.10)",
        }}
      >
        <button
          type="button"
          onClick={() => signOut()}
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 8,
            width: "100%",
            height: 40,
            padding: "0 16px",
            background: "transparent",
            border: "1px solid rgba(255,194,26,0.35)",
            borderRadius: 10,
            color: "rgba(255,255,255,0.8)",
            fontFamily: "'Inter', system-ui, sans-serif",
            fontSize: 13,
            fontWeight: 600,
            cursor: "pointer",
            transition: "background 0.15s",
          }}
          onMouseEnter={(e) => {
            (e.currentTarget as HTMLButtonElement).style.background = "rgba(255,255,255,0.06)";
          }}
          onMouseLeave={(e) => {
            (e.currentTarget as HTMLButtonElement).style.background = "transparent";
          }}
        >
          🚪 Cerrar sesión
        </button>
      </div>
    </aside>
  );
}
