import { createHash } from "node:crypto";
import type { JWT } from "next-auth/jwt";

import prisma from "@/infrastructure/prisma/prisma";

type Credentials = {
  password: string | null;
  twoFASecret: string | null;
  role: string;
  securityVersion?: number;
};

// Only a digest enters the encrypted JWT; credentials never enter session responses.
export function credentialVersion(user: Credentials) {
  return createHash("sha256")
    .update(JSON.stringify([user.password, user.twoFASecret, user.role, user.securityVersion ?? 0]))
    .digest("hex");
}

export async function validateSessionToken(
  token: JWT | null,
): Promise<JWT | null> {
  if (!token?.id || typeof token.credentialVersion !== "string") return null;
  const user = await prisma.user.findUnique({
    where: { id: String(token.id) },
    select: { password: true, twoFASecret: true, role: true, securityVersion: true },
  });
  if (!user || token.credentialVersion !== credentialVersion(user)) return null;
  return { ...token, role: user.role };
}
