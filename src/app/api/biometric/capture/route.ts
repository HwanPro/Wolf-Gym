// src/app/api/biometric/capture/route.ts
import { NextResponse } from "next/server";

// Forzar base del servicio C# (captura). No usar BIOMETRIC_BASE para evitar colisiones con Python.
const BASE = process.env.BIOMETRIC_CAPTURE_BASE || "http://127.0.0.1:8001";
export const dynamic = "force-dynamic";

function captureMessage(message?: string) {
  const normalized = message?.toLowerCase() || "";
  if (normalized.includes("timeout") || normalized.includes("no finger")) {
    return "No se detectó un dedo en el lector. Inténtalo nuevamente.";
  }
  if (normalized.includes("not open") || normalized.includes("device")) {
    return "No se pudo acceder al lector biométrico.";
  }
  return "No se pudo capturar la huella.";
}

async function call(path: string, body?: Record<string, unknown>) {
  return fetch(`${BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
    cache: "no-store",
  });
}

export async function POST() {
  try {
    let lastMessage: string | undefined;
    for (let attempt = 0; attempt < 3; attempt++) {
      let opened = false;
      let openMessage: string | undefined;
      for (let openAttempt = 0; openAttempt < 2 && !opened; openAttempt++) {
        const response = await call("/device/open");
        const result = (await response.json().catch(() => ({}))) as {
          ok?: boolean;
          alreadyOpen?: boolean;
          code?: number;
          message?: string;
        };
        opened = response.ok && (
          result.ok === true || result.alreadyOpen === true || result.code === 1
        );
        openMessage = result.message;
        if (!opened) await new Promise((resolve) => setTimeout(resolve, 200));
      }

      if (!opened) {
        lastMessage = openMessage;
        break;
      }

      const response = await call("/capture");
      const result = (await response.json().catch(() => ({}))) as {
      ok?: boolean;
      template?: string;
      image?: string;
      message?: string;
      };

      if (response.ok && result.ok && result.template) {
        return NextResponse.json({
          ok: true,
          template: result.template,
          image: result.image,
        });
      }

      lastMessage = result.message;
      const retryable = /timeout|no finger/i.test(result.message || "");
      if (!retryable) break;
    }

    return NextResponse.json(
      { ok: false, message: captureMessage(lastMessage) },
      { status: 400 },
    );
  } catch {
    console.error("El servicio biométrico no respondió durante la captura.");
    return NextResponse.json(
      { ok: false, message: "El servicio de captura no respondió" },
      { status: 500 }
    );
  }
}
