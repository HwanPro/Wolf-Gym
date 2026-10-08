// src/app/api/biometric/register/[id]/route.ts
import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/server/auth/authorization";

export const dynamic = "force-dynamic";

// Solo usar el servicio C# biometric-service (puerto local 8001)
const BIOMETRIC_BASE = process.env.BIOMETRIC_CAPTURE_BASE || "http://127.0.0.1:8001";
const TIMEOUT_MS = 15_000;

function timeoutFetch(input: RequestInfo | URL, init?: RequestInit, ms = TIMEOUT_MS) {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), ms);
  const merged = { ...init, signal: controller.signal } as RequestInit;
  return fetch(input, merged).finally(() => clearTimeout(id));
}

export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> } // <- params es Promise, hay que await
) {
  const authorization = await requireAdmin(req);
  if (!authorization.authorized) return authorization.response;

  try {
    const { id } = await ctx.params;

    if (!id || id.length < 10) {
      return NextResponse.json({ ok: false, message: "El cliente seleccionado no es válido." }, { status: 400 });
    }

    // Lee body y normaliza entradas
    const raw: unknown = await req.json().catch(() => ({} as unknown));
    type IncomingBody = { templates?: unknown; template?: unknown; fingerIndex?: unknown; finger_index?: unknown };
    const body = raw as IncomingBody;
    const rawFingerIndex = body.fingerIndex ?? body.finger_index ?? 0;
    const fingerIndex = Number(rawFingerIndex);

    if (!Number.isInteger(fingerIndex) || fingerIndex < 0 || fingerIndex > 9) {
      return NextResponse.json({ ok: false, message: "El dedo seleccionado no es válido." }, { status: 400 });
    }

    const templatesBody = Array.isArray(body?.templates)
      ? (body.templates as unknown[])
          .filter((x) => typeof x === "string" && (x as string).length > 0)
          .map((x) => x as string)
      : null;

    if (templatesBody?.length !== 3 || templatesBody.some(template =>
      template.length > 2732 || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(template) ||
      Buffer.from(template, "base64").length > 2048
    )) {
      return NextResponse.json(
        {
          ok: false,
          message: "Se requieren tres muestras consecutivas del mismo dedo.",
        },
        { status: 400 },
      );
    }
    const templates = templatesBody;

    // Registrar usando el endpoint /enroll del servicio C# biometric-service
    const enrollPayload = {
      userId: id,
      fingerIndex,
      samplesB64: templates
    };

    const enrollRes = await timeoutFetch(`${BIOMETRIC_BASE}/enroll`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(enrollPayload),
      cache: "no-store",
    });

    const enrollData = (await enrollRes.json().catch(() => ({}))) as { ok?: boolean; message?: string };
    const ok = enrollRes.ok && enrollData?.ok === true;
    const duplicate = enrollRes.status === 409 && enrollData.message === "FINGERPRINT_ALREADY_REGISTERED";
    const mismatchedSamples = enrollData.ok === false && (
      enrollData.message === "SAMPLES_DO_NOT_MATCH" ||
      enrollData.message === "Please press the same finger 3 times for the enrollment"
    );
    const message = duplicate
      ? "Esta huella ya está registrada en otro cliente. Usa un dedo diferente."
      : mismatchedSamples
        ? "Las muestras no corresponden al mismo dedo. Repite las tres muestras usando un solo dedo."
        : "No se pudo registrar la huella.";
    const reason = duplicate ? "FINGERPRINT_ALREADY_REGISTERED" : mismatchedSamples ? "SAMPLES_DO_NOT_MATCH" : undefined;

    return NextResponse.json(
      ok
        ? { ok: true, message: "Huella registrada correctamente." }
        : { ok: false, message, ...(reason ? { reason } : {}) },
      { status: ok ? 200 : mismatchedSamples ? 400 : enrollRes.ok ? 502 : enrollRes.status }
    );
  } catch (err: unknown) {
    const aborted = (err as { name?: string } | undefined)?.name === "AbortError";
    return NextResponse.json(
      {
        ok: false,
        message: aborted
          ? "Tiempo de espera excedido comunicando con el servicio biométrico."
          : "No se pudo completar el registro biométrico.",
      },
      { status: 504 }
    );
  }
}
