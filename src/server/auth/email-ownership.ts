import prisma from "@/infrastructure/prisma/prisma";

export async function canUseEmailUsername(userId: string, username: string) {
  if (!username.includes("@")) return true;
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { username: true },
  });
  if (user?.username.toLowerCase() === username.toLowerCase()) return true;
  const verification = await prisma.emailVerification.findUnique({
    where: { userId },
    select: { email: true, verified: true },
  });
  return (
    verification?.verified === true &&
    verification.email.toLowerCase() === username.toLowerCase()
  );
}
