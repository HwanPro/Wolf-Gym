// app/api/biometric/verify/[id]/route.ts
import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/server/auth/authorization";

export const dynamic = "force-dynamic";

const BIOMETRIC_BASE =
  process.env.BIOMETRIC_CAPTURE_BASE ||
  process.env.BIOMETRIC_BASE ||
  process.env.NEXT_PUBLIC_BIOMETRIC_BASE ||
  "http://127.0.0.1:8001";
const TIMEOUT_MS = 15_000;

function timeoutFetch(input: RequestInfo | URL, init?: RequestInit, ms = TIMEOUT_MS) {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), ms);
  const mergedInit = { ...init, signal: controller.signal } as RequestInit;
  return fetch(input, mergedInit).finally(() => clearTimeout(id));
}

type CaptureResponse = {
  ok: boolean;
  template?: string | null;
  message?: string | null;
};

export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  const authorization = await requireAdmin(req);
  if (!authorization.authorized) return authorization.response;

  try {
    const { id: userId } = await ctx.params;
    const body = await req.json().catch(() => ({}));
    const rawFingerIndex = body.fingerIndex ?? body.finger_index ?? 0;
    const fingerIndex = Number.isInteger(Number(rawFingerIndex)) ? Number(rawFingerIndex) : 0;

    // Validación básica del id (cuid ~ 25 chars)
    if (!userId || userId.length < 10) {
      return NextResponse.json(
        { ok: false, message: "ID de usuario inválido." },
        { status: 400 }
      );
    }

    if (fingerIndex < 0 || fingerIndex > 9) {
      return NextResponse.json(
        { ok: false, message: "fingerIndex debe estar entre 0 y 9" },
        { status: 400 }
      );
    }

    let template: string;

    // Si viene template en el body (desde admin panel), usarlo
    if (body.template) {
      template = body.template;
    } else {
      // Si no viene template, capturar uno nuevo
      const capRes = await timeoutFetch(`${BIOMETRIC_BASE}/capture`, {
        method: "POST",
        cache: "no-store",
      });

      const capJson = (await capRes
        .json()
        .catch(() => ({ ok: false, template: null, message: "Respuesta inválida" }))) as CaptureResponse;

      if (!capRes.ok || !capJson?.ok || !capJson?.template) {
        return NextResponse.json(
          {
            ok: false,
            message: capJson?.message || "No se pudo capturar la huella para verificación.",
          },
          { status: 400 }
        );
      }

      template = capJson.template;
    }

    // Verificar la huella capturada contra el usuario específico usando el servicio C#
    const verifyRes = await timeoutFetch(`${BIOMETRIC_BASE}/verify`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ 
        userId: userId, 
        templateB64: template,
        fingerIndex
      }),
      cache: "no-store",
    });

    const verifyData = await verifyRes.json().catch(() => ({}));

    if (!verifyRes.ok) {
      return NextResponse.json(
        {
          ok: false,
          message: verifyData?.message || "Error en la verificación biométrica.",
        },
        { status: verifyRes.status || 500 }
      );
    }

    // Respuesta unificada
    return NextResponse.json(
      {
        ok: verifyData?.ok ?? false,
        match: verifyData?.match ?? false,
        score: verifyData?.score,
        threshold: verifyData?.threshold,
        message: verifyData?.message || (verifyData?.match ? "Huella verificada correctamente" : "La huella no coincide"),
      },
      { status: 200 }
    );

  } catch (err: unknown) {
    const aborted = (err as { name?: string } | undefined)?.name === "AbortError";
    return NextResponse.json(
      {
        ok: false,
        message: aborted
          ? "Tiempo de espera excedido comunicando con el servicio biométrico."
          : "Error interno en la verificación biométrica.",
        error: aborted ? "TIMEOUT" : String((err as Error | undefined)?.message || err),
      },
      { status: 504 }
    );
  }
}
