import { requireAdmin } from "@/server/auth/authorization";
import { NextRequest } from "next/server";
import { rt, RTEvent } from "@/lib/realtime";
import { validateSessionToken } from "@/server/auth/session-validity";

export const runtime = "nodejs"; // importante para mantener la conexión

export async function GET(req: NextRequest) {
  const authorization = await requireAdmin(req);
  if (!authorization.authorized) return authorization.response;

  const encoder = new TextEncoder();
  let cleanup = () => {};

  const stream = new ReadableStream({
    start(controller) {
      const send = (data: RTEvent) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
      };

      const keepAlive = setInterval(() => {
        controller.enqueue(encoder.encode(`:\n\n`));
      }, 15000);

      const listener = (evt: RTEvent) => send(evt);
      rt.on("realtime", listener);

      cleanup = () => {
        clearInterval(keepAlive);
        rt.off("realtime", listener);
        req.signal.removeEventListener("abort", cleanup);
      };
      req.signal.addEventListener("abort", cleanup);
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
        controller.enqueue(chunk);
      },
    }),
  );
  return new Response(protectedStream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
