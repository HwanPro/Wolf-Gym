"use client";

import type { ReactNode } from "react";
import { ArrowLeft } from "lucide-react";

interface AuthShellProps {
  eyebrow: string;
  title: string;
  description: string;
  children: ReactNode;
  backLabel?: string;
  onBack: () => void;
  compact?: boolean;
}

export const wolfInputClass =
  "h-12 w-full border border-[#D6D4CE] bg-white px-3 text-sm text-[#0A0A0A] outline-none transition placeholder:text-[#A8A8A4] focus:border-[#FFC21A] focus:ring-2 focus:ring-[#FFC21A]/25";

export const wolfPrimaryButtonClass =
  "inline-flex h-12 w-full items-center justify-center gap-2 bg-[#FFC21A] px-4 text-sm font-black uppercase text-[#0A0A0A] transition hover:bg-[#E5A800] disabled:cursor-not-allowed disabled:opacity-60";

export const wolfSecondaryButtonClass =
  "inline-flex h-11 items-center justify-center gap-2 border border-[#0A0A0A]/20 bg-white px-4 text-sm font-bold text-[#0A0A0A] transition hover:border-[#FFC21A] hover:bg-[#FFF8E0]";

export function AuthShell({
  eyebrow,
  title,
  description,
  children,
  backLabel = "Volver al inicio",
  onBack,
  compact = false,
}: AuthShellProps) {
  const logoStyle = { backgroundImage: "url('/icons/icon-512.png')" };

  return (
    <main className="min-h-dvh bg-[#F5F5F4] text-[#0A0A0A] lg:grid lg:grid-cols-[42%_58%]">
      <aside className="relative hidden overflow-hidden bg-[#0A0A0A] p-12 text-white lg:flex lg:min-h-dvh lg:flex-col lg:justify-between">
        <div className="absolute inset-0 bg-[repeating-linear-gradient(135deg,rgba(255,194,26,0.05)_0_12px,transparent_12px_28px)]" />
        <div className="relative flex items-center gap-3">
          <div
            role="img"
            aria-label="Wolf Gym"
            className="h-12 w-12 bg-contain bg-center bg-no-repeat"
            style={logoStyle}
          />
          <div className="text-2xl font-black uppercase leading-none">
            Wolf <span className="text-[#FFC21A]">Gym</span>
          </div>
        </div>

        <div className="relative max-w-md">
          <p className="mb-4 text-xs font-black uppercase text-[#FFC21A]">
            App oficial
          </p>
          <div className="text-7xl font-black uppercase leading-[0.9] tracking-tight">
            Entrena
            <br />
            <span className="text-[#FFC21A]">como bestia.</span>
          </div>
          <p className="mt-5 text-sm leading-7 text-white/65">
            Acceso a tu plan, rutinas, progreso y operaciones de Wolf Gym Ica.
          </p>
        </div>

        <div className="relative flex gap-4 text-xs font-semibold text-white/55">
          <span>+115 atletas activos</span>
          <span>Ica, Peru</span>
        </div>
      </aside>

      <section className="grid min-h-dvh place-items-center px-5 py-8 sm:px-8 lg:px-12">
        <div className={`w-full ${compact ? "max-w-md" : "max-w-3xl"}`}>
          <button
            type="button"
            onClick={onBack}
            className="mb-8 inline-flex items-center gap-2 text-sm font-semibold text-[#6B6B68] transition hover:text-[#FF7A1A]"
          >
            <ArrowLeft className="h-4 w-4" />
            {backLabel}
          </button>

          <div className="border border-[#E7E5E1] bg-white p-6 shadow-sm sm:p-8">
            <div className="mb-7 flex items-center gap-4">
              <div
                role="img"
                aria-label="Wolf Gym"
                className="h-10 w-10 bg-contain bg-center bg-no-repeat"
                style={logoStyle}
              />
              <div className="h-9 w-px bg-[#E7E5E1]" />
              <div>
                <p className="text-xs font-black uppercase text-[#FF7A1A]">
                  {eyebrow}
                </p>
                <h1 className="text-4xl font-black uppercase leading-none text-[#0A0A0A] sm:text-5xl">
                  {title}
                </h1>
              </div>
            </div>
            <p className="mb-7 max-w-xl text-sm leading-6 text-[#6B6B68]">
              {description}
            </p>
            {children}
          </div>
        </div>
      </section>
    </main>
  );
}

export function AuthField({
  label,
  error,
  children,
}: {
  label: string;
  error?: string;
  children: ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-2 block text-xs font-black uppercase text-[#0A0A0A]">
        {label}
      </span>
      {children}
      {error && (
        <span className="mt-1 block text-xs text-[#E5484D]">{error}</span>
      )}
    </label>
  );
}
