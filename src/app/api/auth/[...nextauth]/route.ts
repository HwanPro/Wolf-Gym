import NextAuth, { AuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import { PrismaAdapter } from "@next-auth/prisma-adapter";
import prisma from "@/infrastructure/prisma/prisma";
import bcrypt from "bcryptjs";
import speakeasy from "speakeasy";
import { loginRateLimit } from "@/server/security/rate-limit";

const nextAuthUrl = process.env.NEXTAUTH_URL || "";
const useSecureCookies = nextAuthUrl.startsWith("https://");

export const authOptions: AuthOptions = {
  adapter: PrismaAdapter(prisma),
  providers: [
    CredentialsProvider({
      name: "Credentials",
      credentials: {
        username: { label: "Username or Phone", type: "text" },
        password: { label: "Password", type: "password" },
        otp: { label: "Código 2FA", type: "text" },
      },
      async authorize(credentials) {
        if (!credentials?.username || !credentials.password) {
          throw new Error("Credenciales inválidas");
        }
        const loginKey = credentials.username.trim().toLowerCase();
        const rateLimit = loginRateLimit.consume(
          loginKey,
          8,
          15 * 60 * 1_000,
        );
        if (!rateLimit.allowed) {
          throw new Error(
            `Demasiados intentos. Intenta nuevamente en ${rateLimit.retryAfterSeconds} segundos`,
          );
        }

        // Buscar al usuario
        const user = await prisma.user.findFirst({
          where: {
            OR: [
              { username: credentials.username },
              { phoneNumber: credentials.username },
            ],
          },
        });

        if (!user) {
          throw new Error("Credenciales inválidas");
        }

        // Comparar contraseña
        if (!user.password) {
          throw new Error("Credenciales inválidas");
        }
        const isMatch = await bcrypt.compare(
          credentials.password,
          user.password
        );
        if (!isMatch) {
          throw new Error("Credenciales inválidas");
        }

        if (user.twoFASecret) {
          const otp = credentials.otp?.trim() || "";
          const validOtp = /^\d{6}$/.test(otp) && speakeasy.totp.verify({
            secret: user.twoFASecret,
            encoding: "base32",
            token: otp,
            window: 1,
          });
          if (!validOtp) {
            throw new Error("Código 2FA requerido o inválido");
          }
        }

        loginRateLimit.reset(loginKey);

        // Regresamos un objeto "limpio" sin user.password
        return {
          id: user.id,
          username: user.username,
          phoneNumber: user.phoneNumber,
          role: user.role,
          firstName: user.firstName,
          lastName: user.lastName,
          image: user.image,
        };
      },
    }),
  ],
  session: {
    strategy: "jwt",
    maxAge: 30 * 24 * 60 * 60, // 30 días
  },
  callbacks: {
    async jwt({ token, user, trigger }) {
      // Si es la primera vez (login inicial), "user" no es undefined
      if (user) {
        token.id = user.id;
        token.role = user.role;
        token.username = (user as { username?: string }).username || "";
        token.phoneNumber = user.phoneNumber;
        // añadimos los nuevos campos
        token.firstName = (user as { firstName?: string }).firstName || "";
        token.lastName = (user as { lastName?: string }).lastName || "";
        token.image = (user as { image?: string }).image || null;
      }
      
      // Si se actualiza la sesión, refrescar datos del usuario
      if (trigger === "update") {
        const updatedUser = await prisma.user.findUnique({
          where: { id: token.id as string },
          select: {
            firstName: true,
            lastName: true,
            image: true,
            phoneNumber: true,
            username: true,
          },
        });
        
        if (updatedUser) {
          token.firstName = updatedUser.firstName || "";
          token.lastName = updatedUser.lastName || "";
          token.image = updatedUser.image || null;
          token.phoneNumber = updatedUser.phoneNumber || "";
          token.username = updatedUser.username || "";
        }
      }
      
      return token;
    },
    async session({ session, token }) {
      // Copiamos del token a session.user
      if (token && session.user) {
        session.user.id = token.id as string;
        session.user.role = token.role as string;
        session.user.phoneNumber = token.phoneNumber as string;
        session.user = {
          name: token.username as string,
          ...session.user,
          ...((token as { firstName?: string }).firstName && {
            firstName: (token as { firstName?: string }).firstName as string,
          }),
        };
        session.user = {
          ...session.user,
          ...((token as { lastName?: string }).lastName && {
            lastName: (token as { lastName?: string }).lastName as string,
          }),
        };
        session.user.image = (token as { image?: string }).image || null;
      }
      return session;
    },
    async signIn({ user }) {
      if (user.role === "client") {
        const existingProfile = await prisma.clientProfile.findUnique({
          where: { user_id: user.id },
        });
        if (!existingProfile) {
          await prisma.clientProfile.create({
            data: {
              profile_first_name:
                (user as { firstName?: string; name?: string }).firstName ||
                (user as { name?: string }).name ||
                "Sin nombre",
              profile_last_name:
                (user as { lastName?: string }).lastName || "Sin apellido",
              profile_plan: "Básico",
              profile_start_date: new Date(),
              profile_end_date: new Date(),
              profile_phone: user.phoneNumber || "",
              user_id: user.id,
            },
          });
        }
      }
      return true;
    },
  },
  pages: {
    signIn: "/auth/login",
  },
  secret: process.env.NEXTAUTH_SECRET,
  cookies: {
    sessionToken: {
      name: useSecureCookies
        ? "__Secure-next-auth.session-token"
        : "next-auth.session-token",
      options: {
        httpOnly: true,
        sameSite: "lax",
        path: "/",
        secure: useSecureCookies,
      },
    },
  },
};

const handler = NextAuth(authOptions);

export { handler as GET, handler as POST };
