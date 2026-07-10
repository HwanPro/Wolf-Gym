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

type CaptureResponse = { ok: boolean; template?: string | null; message?: string | null };

export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> } // <- params es Promise, hay que await
) {
  const authorization = await requireAdmin(req);
  if (!authorization.authorized) return authorization.response;

  try {
    const { id } = await ctx.params;

    if (!id || id.length < 10) {
      return NextResponse.json({ ok: false, message: "userId inválido" }, { status: 400 });
    }

    // Lee body y normaliza entradas
    const raw: unknown = await req.json().catch(() => ({} as unknown));
    type IncomingBody = { templates?: unknown; template?: unknown; fingerIndex?: unknown; finger_index?: unknown };
    const body = raw as IncomingBody;
    const rawFingerIndex = body.fingerIndex ?? body.finger_index ?? 0;
    const fingerIndex = Number.isInteger(Number(rawFingerIndex)) ? Number(rawFingerIndex) : 0;

    if (fingerIndex < 0 || fingerIndex > 9) {
      return NextResponse.json({ ok: false, message: "fingerIndex debe estar entre 0 y 9" }, { status: 400 });
    }

    const templatesBody = Array.isArray(body?.templates)
      ? (body.templates as unknown[])
          .filter((x) => typeof x === "string" && (x as string).length > 0)
          .map((x) => x as string)
      : null;

    const templateBody =
      typeof body?.template === "string" && (body.template as string).length > 0
        ? (body.template as string)
        : null;

    // Si no envías plantilla, capturar una muestra del dispositivo.
    const templates: string[] = [];
    if (templatesBody?.length) {
      templates.push(...templatesBody);
    } else if (templateBody) {
      templates.push(templateBody);
    } else {
      const capRes = await timeoutFetch(`${BIOMETRIC_BASE}/capture`, { method: "POST", cache: "no-store" });
      const cap = (await capRes.json().catch(() => ({ ok: false, template: null, message: "Respuesta inválida" }))) as CaptureResponse;
      if (!capRes.ok || !cap?.ok || !cap?.template) {
        return NextResponse.json(
          { ok: false, message: cap?.message || "No se pudo capturar la huella." },
          { status: 400 }
        );
      }
      templates.push(cap.template);
    }

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
    const ok = enrollRes.ok && enrollData?.ok !== false;

    return NextResponse.json(
      ok ? enrollData : { ok: false, message: enrollData?.message || "Error registrando" },
      { status: ok ? 200 : enrollRes.status || 500 }
    );
  } catch (err: unknown) {
    const aborted = (err as { name?: string } | undefined)?.name === "AbortError";
    return NextResponse.json(
      {
        ok: false,
        message: aborted
          ? "Tiempo de espera excedido comunicando con el servicio biométrico."
          : (err as Error | undefined)?.message || "Fallo inesperado",
        error: aborted ? "TIMEOUT" : String((err as Error | undefined)?.message || err),
      },
      { status: 504 }
    );
  }
}
