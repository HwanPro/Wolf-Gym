import type { Prisma } from "@prisma/client";
import { DEFAULT_MEMBERSHIP_PLANS, inferPlanDurationDays } from "@/lib/membershipPlans";

export async function resolveOnlinePlan(store: Pick<Prisma.TransactionClient, "plan">, id: string) {
  const plan = await store.plan.findFirst({ where: { OR: [{ id }, { slug: id }] } });
  if (plan) return { name: plan.name, price: plan.price, durationDays: inferPlanDurationDays(plan) };
  // Match the public catalogue's explicit defaults only while no plans exist.
  if (await store.plan.count() !== 0) return null;
  const fallback = DEFAULT_MEMBERSHIP_PLANS.find(candidate => candidate.slug === id);
  return fallback ? { name: fallback.name, price: fallback.price, durationDays: fallback.durationDays } : null;
}
