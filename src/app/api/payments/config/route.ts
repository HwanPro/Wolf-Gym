import { NextResponse } from "next/server";
import { culqiConfiguration } from "@/server/payments/culqi-policy";

export const dynamic = "force-dynamic";
export function GET() {
  const config = culqiConfiguration();
  return NextResponse.json({ enabled: config.enabled, membershipsEnabled: config.membershipsEnabled, mode: config.enabled ? config.mode : null, publicKey: config.enabled ? config.publicKey : null }, { headers: { "Cache-Control": "no-store" } });
}
