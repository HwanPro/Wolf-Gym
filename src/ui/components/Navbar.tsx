// src/components/Navbar.tsx
"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut } from "next-auth/react";

const navLinks = [
  { href: "/client/dashboard", label: "Panel" },
  { href: "/admin/dashboard", label: "Admin" },
  { href: "/check-in", label: "Recepción" },
];

export function Navbar() {
  const pathname = usePathname();

  return (
    <nav
      style={{
        background: "#0A0A0A",
        height: 64,
        borderBottom: "1px solid rgba(255,194,26,0.15)",
        display: "flex",
        alignItems: "center",
        padding: "0 24px",
        gap: 24,
        fontFamily: "'Inter', system-ui, sans-serif",
        position: "sticky",
        top: 0,
        zIndex: 40,
      }}
    >
      {/* Logo */}
      <Link
        href="/"
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          textDecoration: "none",
          flexShrink: 0,
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
            fontSize: 14,
            fontWeight: 700,
            color: "#0A0A0A",
          }}
        >
          WG
        </div>
        <span
          style={{
            fontFamily: "'Bebas Neue', 'Arial Narrow', sans-serif",
            fontSize: 18,
            letterSpacing: "0.08em",
            color: "#fff",
          }}
        >
          WOLF <span style={{ color: "#FFC21A" }}>GYM</span>
        </span>
      </Link>

      {/* Nav links */}
      <div style={{ display: "flex", alignItems: "center", gap: 4, flex: 1 }}>
        {navLinks.map((link) => {
          const isActive = pathname === link.href || pathname.startsWith(link.href + "/");
          return (
            <Link
              key={link.href}
              href={link.href}
              style={{
                padding: "6px 12px",
                borderRadius: 8,
                textDecoration: "none",
                fontSize: 13,
                fontWeight: 500,
                color: isActive ? "#FFC21A" : "rgba(255,255,255,0.55)",
                background: isActive ? "rgba(255,194,26,0.08)" : "transparent",
                transition: "color 0.12s, background 0.12s",
              }}
            >
              {link.label}
            </Link>
          );
        })}
      </div>

      {/* Right: avatar + logout */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginLeft: "auto" }}>
        <div
          style={{
            width: 34,
            height: 34,
            borderRadius: "50%",
            background: "#FFC21A",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontFamily: "'Bebas Neue', 'Arial Narrow', sans-serif",
            fontSize: 14,
            color: "#0A0A0A",
            fontWeight: 700,
          }}
        >
          WG
        </div>
        <button
          type="button"
          onClick={() => signOut()}
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            height: 36,
            padding: "0 14px",
            background: "transparent",
            border: "1px solid rgba(255,194,26,0.35)",
            borderRadius: 10,
            color: "rgba(255,255,255,0.8)",
            fontSize: 13,
            fontWeight: 600,
            cursor: "pointer",
            fontFamily: "'Inter', system-ui, sans-serif",
            transition: "background 0.15s",
          }}
          onMouseEnter={(e) => {
            (e.currentTarget as HTMLButtonElement).style.background = "rgba(255,255,255,0.06)";
          }}
          onMouseLeave={(e) => {
            (e.currentTarget as HTMLButtonElement).style.background = "transparent";
          }}
        >
          Cerrar sesión
        </button>
      </div>
    </nav>
  );
}
