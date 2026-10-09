import { requireAdmin } from "@/server/auth/authorization";
// src/app/api/check-in/stream/route.ts
import { NextRequest } from "next/server";
import { addConnection, removeConnection } from "@/lib/stream-manager";
import { validateSessionToken } from "@/server/auth/session-validity";

export async function GET(request: NextRequest) {
  const authorization = await requireAdmin(request);
  if (!authorization.authorized) return authorization.response;

  const { searchParams } = new URL(request.url);
  const room = (searchParams.get("room") || "default").slice(0, 100);
  const encoder = new TextEncoder();
  let cleanup = () => {};

  const stream = new ReadableStream({
    start(controller) {
      // Agregar conexión al gestor centralizado
      addConnection(room, controller);

      // Enviar evento inicial
      controller.enqueue(
        `data: ${JSON.stringify({ type: "connected", room })}\n\n`,
      );

      // Cleanup cuando se cierra la conexión
      const keepAlive = setInterval(() => controller.enqueue(":\n\n"), 15000);
      cleanup = () => {
        clearInterval(keepAlive);
        removeConnection(room, controller);
        request.signal.removeEventListener("abort", cleanup);
      };

      // Detectar cuando se cierra la conexión
      request.signal.addEventListener("abort", cleanup);
    },
    cancel() {
      cleanup();
    },
  });

  const protectedStream = stream.pipeThrough(
    new TransformStream({
      async transform(chunk, controller) {
        if (!(await validateSessionToken(authorization.token))) {
          controller.terminate();
          return;
        }
        controller.enqueue(encoder.encode(chunk));
      },
    }),
  );
  return new Response(protectedStream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
