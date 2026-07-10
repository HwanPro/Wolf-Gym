// src/app/api/commands/route.ts
import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/server/auth/authorization";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

type Sender = (chunk: string) => void;

// Un bus en memoria por "room"
const rooms = new Map<string, Set<Sender>>();
const enc = new TextEncoder();

function broadcast(room: string, payload: Record<string, unknown>) {
  const set = rooms.get(room);
  if (!set || set.size === 0) return;
  const data = `data: ${JSON.stringify(payload)}\n\n`;
  for (const send of set) send(data);
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const requestedRoom = searchParams.get("room") || "default";
  const room = /^[a-zA-Z0-9_-]{1,64}$/.test(requestedRoom)
    ? requestedRoom
    : "default";

  let currentSender: Sender | null = null;
  const stream = new ReadableStream({
    start(controller) {
      const send: Sender = (chunk: string) => controller.enqueue(enc.encode(chunk));
      currentSender = send;
      if (!rooms.has(room)) rooms.set(room, new Set());
      rooms.get(room)!.add(send);

      // saludo inicial (útil para probar conexión)
      send(`event: ping\ndata: "connected"\n\n`);
    },
    cancel() {
      const set = rooms.get(room);
      if (!set || !currentSender) return;
      set.delete(currentSender);
      if (set.size === 0) rooms.delete(room);
    },
  });

  return new Response(stream, {
    status: 200,
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}

export async function POST(req: NextRequest) {
  const authorization = await requireAdmin(req);
  if (!authorization.authorized) return authorization.response;

  const raw: unknown = await req.json().catch(() => null);
  const body = raw && typeof raw === "object" ? raw as Record<string, unknown> : null;
  if (!body || typeof body.action !== "string") {
    return NextResponse.json({ ok: false, message: "action requerida" }, { status: 400 });
  }
  if (!["scan", "checkout", "stop"].includes(body.action)) {
    return NextResponse.json({ ok: false, message: "action inválida" }, { status: 400 });
  }
  const requestedRoom =
    typeof body.room === "string" && body.room ? body.room : "default";
  const room = /^[a-zA-Z0-9_-]{1,64}$/.test(requestedRoom)
    ? requestedRoom
    : "default";
  broadcast(room, body);
  return NextResponse.json({ ok: true });
}

export function OPTIONS() {
  const origin = process.env.NEXTAUTH_URL || "https://wolf-gym.com";
  return new Response(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": origin,
      "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
      "Access-Control-Allow-Headers": "content-type",
      Vary: "Origin",
    },
  });
}
