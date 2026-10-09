// src/types/next-auth.d.ts
import type { DefaultSession, DefaultUser } from "next-auth";
import type { JWT as JWTType } from "next-auth/jwt";

declare module "next-auth" {
  interface User extends DefaultUser {
    id: string;
    credentialVersion?: string;
    role?: string;
    phoneNumber?: string;
    firstName?: string;
    lastName?: string;
  }

  interface Session extends DefaultSession {
    user: {
      id: string;
      role?: string;
      phoneNumber?: string;
      firstName?: string;
      lastName?: string;
    } & DefaultSession["user"];
  }
}

declare module "next-auth/jwt" {
  interface JWT extends JWTType {
    id: string;
    role?: string;
    phoneNumber?: string;
    firstName?: string;
    lastName?: string;
  }
}
