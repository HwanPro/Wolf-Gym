import type { NextRequest } from "next/server";
import { requireAdmin } from "@/server/auth/authorization";
// app/api/biometric/identify/route.ts
import { NextResponse } from "next/server";
import prisma from "@/infrastructure/prisma/prisma";
import { getMembershipStatus } from "@/domain/attendance/attendance-policy";

// Captura e identificación usan el mismo servicio y catálogo de huellas.
const CAPTURE_BASE =
  process.env.BIOMETRIC_CAPTURE_BASE ||
  process.env.BIOMETRIC_BASE ||
  "http://127.0.0.1:8001";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const authorization = await requireAdmin(req);
  if (!authorization.authorized) return authorization.response;

  try {
    // 0) Leer body opcional con template (para clientes que ya capturan)
    type IdentifyBody = { template?: string | null; fingerprint?: string | null };
    const body = (await req.json().catch(() => ({}))) as IdentifyBody | undefined;

    if ([body?.template, body?.fingerprint].some(value => value != null && (typeof value !== "string" || value.length > 2732))) {
      return NextResponse.json({ ok: false, message: "Muestra de huella inválida" }, { status: 400 });
    }
    let templateBase64: string | null = null;
    if (typeof body?.template === "string" && body.template.length > 0) {
      templateBase64 = body.template;
    } else if (typeof body?.fingerprint === "string" && body.fingerprint.length > 0) {
      templateBase64 = body.fingerprint;
    }

    // 1) Si no recibimos template, capturar desde el servicio C#
    if (!templateBase64) {
      await fetch(`${CAPTURE_BASE}/device/open`, {
        method: "POST",
        cache: "no-store",
        signal: AbortSignal.timeout(15_000),
      }).catch(() => null);

      const cap = await fetch(`${CAPTURE_BASE}/capture`, {
        method: "POST",
        cache: "no-store",
        signal: AbortSignal.timeout(35_000),
      });
      const capData = (await cap.json().catch(() => ({}))) as {
        ok?: boolean;
        template?: string;
        message?: string;
        code?: number;
        reason?: string;
      };
      if (!cap.ok || !capData?.ok || !capData?.template) {
        // Si no se puede capturar (no hay dedo), retornar sin error
        if (capData?.code === -8 || capData?.reason === "NO_FINGER") {
          return NextResponse.json(
            { ok: true, match: false, message: "No hay dedo en el lector" },
            { status: 200 }
          );
        }
        return NextResponse.json(
          { ok: false, message: "No se pudo capturar la huella" },
          { status: 502 }
        );
      }
      templateBase64 = capData.template as string;

    }

    // El SDK acepta plantillas de hasta 2048 bytes, no imágenes ni texto arbitrario.
    if (!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(templateBase64) ||
        Buffer.from(templateBase64, "base64").length > 2048) {
      return NextResponse.json({ ok: false, match: false, message: "Muestra de huella inválida" }, { status: 400 });
    }

    // 2) Identificar en el servicio C# (1:N)
    const identifyResp = await fetch(`${CAPTURE_BASE}/identify`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ templateB64: templateBase64 }),
      cache: "no-store",
        signal: AbortSignal.timeout(15_000),
    });
    const identifyData = (await identifyResp.json().catch(() => ({}))) as {
      ok?: boolean;
      match?: boolean;
      userId?: string;
      user_id?: string;
      score?: number;
      threshold?: number;
      message?: string;
    };

    if (!identifyResp.ok || identifyData?.ok !== true) {
      const ambiguous = identifyData?.message === "Ambiguous match detected";
      return NextResponse.json(
        { ok: false, match: false,
          reason: ambiguous ? "AMBIGUOUS_MATCH" : "BIOMETRIC_UNAVAILABLE",
          message: ambiguous
            ? "La lectura es ambigua. Retira el dedo y vuelve a colocarlo."
            : "El servicio biométrico no pudo comparar las huellas. Revisa su conexión a la base de datos y al lector." },
        { status: ambiguous ? 409 : 503 }
      );
    }
    if (typeof identifyData.match !== "boolean") {
      return NextResponse.json({ ok: false, match: false, message: "Respuesta inválida del servicio biométrico" }, { status: 502 });
    }
    if (!identifyData.match) {
      return NextResponse.json(
        {
          ok: true,
          match: false,
          message: "La lectura no coincide con las huellas registradas. Prueba nuevamente con el dedo registrado.",
        },
        { status: 200 }
      );
    }

    const bestMatch = {
      userId: identifyData.userId || identifyData.user_id,
      score: identifyData.score,
      threshold: identifyData.threshold,
    };

    if (!bestMatch?.userId) {
      return NextResponse.json(
        {
          ok: false,
          match: false,
          message: "El servicio biométrico devolvió una identificación incompleta",
        },
        { status: 502 }
      );
    }

    // 3) Obtener información del usuario. La biometría solo decide identidad;
    //    vigencia/deuda se muestran en el flujo de check-in.
    const userId = bestMatch.userId as string;

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        username: true,
      },
    });

    if (!user) {
      return NextResponse.json(
        {
          ok: false,
          match: false,
          reason: "DATABASE_MISMATCH",
          message: "La huella corresponde a un usuario ausente en la base de datos de la aplicación. Revisa que ambos servicios usen la misma base.",
        },
        { status: 409 }
      );
    }

    const profile = await prisma.clientProfile.findUnique({
      where: { user_id: userId },
      select: {
        profile_id: true,
        profile_first_name: true,
        profile_last_name: true,
        profile_end_date: true,
      },
    });

    const fullName =
      `${profile?.profile_first_name || ""} ${profile?.profile_last_name || ""}`.trim() ||
      `${user.firstName} ${user.lastName}`.trim() ||
      user.username;
    const membership = getMembershipStatus(profile?.profile_end_date);
    const membershipExpired = membership.expired;

    return NextResponse.json(
      {
        ok: true,
        match: true,
        userId,
        user_id: userId, // compat
        fullName,
        name: fullName, // compat
        hasProfile: Boolean(profile),
        membershipExpired,
        profileEndDate: profile?.profile_end_date ?? null,
        message: membershipExpired
          ? membership.daysLeft === null
            ? "Usuario identificado sin membresía vigente; debe asignarse antes de ingresar"
            : "Usuario identificado con membresía expirada"
          : profile
            ? "Usuario identificado correctamente"
            : "Usuario identificado sin perfil de cliente",
      },
      { status: 200 }
    );
  } catch {
    console.error("No se pudo completar la identificación biométrica.");
    return NextResponse.json(
      { ok: false, match: false, message: "No se pudo completar la identificación biométrica. Comprueba que el servicio y la base de datos estén disponibles." },
      { status: 503 }
    );
  }
}
