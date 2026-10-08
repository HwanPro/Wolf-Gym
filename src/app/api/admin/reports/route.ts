import { NextRequest, NextResponse } from "next/server";
import { requestToken } from "@/server/auth/authorization";
import prisma from "@/infrastructure/prisma/prisma";
import { getLimaDayRange, limaDateParts } from "@/domain/attendance/attendance-policy";

type Severity = "high" | "medium" | "low";

type Inconsistency = {
  id: string;
  title: string;
  severity: Severity;
  count: number;
  description: string;
  samples: string[];
};

function toMonthKey(date: Date) {
  const parts = limaDateParts(date);
  return `${parts.year}-${String(parts.month).padStart(2, "0")}`;
}

function toDayKey(date: Date) {
  const parts = limaDateParts(date);
  return `${parts.year}-${String(parts.month).padStart(2, "0")}-${String(parts.day).padStart(2, "0")}`;
}

function toNumber(value: unknown) {
  return Number(value ?? 0);
}

function profileLabel(profile: {
  profile_id: string;
  profile_first_name: string | null;
  profile_last_name: string | null;
  user?: { username?: string | null } | null;
}) {
  const fullName = `${profile.profile_first_name ?? ""} ${profile.profile_last_name ?? ""}`.trim();
  return fullName || profile.user?.username || `Perfil ${profile.profile_id.slice(0, 8)}`;
}

function shortDate(value: Date | null) {
  return value ? value.toISOString().slice(0, 10) : "sin fecha";
}

function pushIssue(
  issues: Inconsistency[],
  issue: Omit<Inconsistency, "samples"> & { samples?: string[] }
) {
  if (issue.count <= 0) return;
  issues.push({
    ...issue,
    samples: (issue.samples ?? []).slice(0, 5),
  });
}

export async function GET(request: NextRequest) {
  const token = await requestToken(request);

  if (!token) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }
  if (token.role !== "admin") {
    return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  }

  try {
    const now = new Date();
    const { start: todayStart, end: todayEnd } = getLimaDayRange(now);
    const local = limaDateParts(now);
    const sixMonthsAgo = new Date(Date.UTC(local.year, local.month - 6, 1, 5));
    const fourteenDaysAgo = new Date(todayStart.getTime() - 13 * 86400000);

    const thirtyDaysAgo = new Date(now);
    thirtyDaysAgo.setDate(now.getDate() - 30);

    const [
      totalIncomeAgg,
      productSalesAgg,
      newClients,
      todayAttendance,
      activeMemberships,
      paymentRecords,
      purchaseRecords,
      attendanceRecords,
      profiles,
      products,
      dailyDebtsCount,
      debtHistoryCount,
    ] = await Promise.all([
      prisma.paymentRecord.aggregate({ where: { payment_status: "COMPLETED" },
        _sum: { payment_amount: true },
      }),
      prisma.purchase.aggregate({ where: { OR: [{ cashSaleId: null }, { cashSale: { is: { status: { not: "VOIDED" } } } }] },
        _sum: { purchase_total: true },
      }),
      prisma.user.count({
        where: { role: "client", createdAt: { gte: thirtyDaysAgo } },
      }),
      prisma.attendance.count({
        where: { checkInTime: { gte: todayStart, lte: todayEnd } },
      }),
      prisma.clientProfile.count({
        where: {
          user: { is: { role: "client" } },
          profile_end_date: { gte: new Date(Date.UTC(local.year, local.month - 1, local.day)) },
        },
      }),
      prisma.paymentRecord.findMany({
        where: { payment_status: "COMPLETED", payment_date: { gte: sixMonthsAgo } },
        select: { payment_amount: true, payment_date: true },
      }),
      prisma.purchase.findMany({
        where: { OR: [{ cashSaleId: null }, { cashSale: { is: { status: { not: "VOIDED" } } } }], purchase_date: { gte: sixMonthsAgo } },
        select: {
          purchase_total: true,
          purchase_quantity: true,
          purchase_date: true,
          productId: true,
          product: {
            select: { item_name: true },
          },
        },
      }),
      prisma.attendance.findMany({
        where: { checkInTime: { gte: fourteenDaysAgo } },
        select: { checkInTime: true },
      }),
      prisma.clientProfile.findMany({
        select: {
          profile_id: true,
          profile_first_name: true,
          profile_last_name: true,
          profile_plan: true,
          profile_start_date: true,
          profile_end_date: true,
          profile_phone: true,
          debt: true,
          user: {
            select: { role: true, username: true },
          },
        },
      }),
      prisma.inventoryItem.findMany({
        select: {
          item_id: true,
          item_name: true,
          item_stock: true,
          item_price: true,
          item_image_url: true,
          item_category: true,
        },
      }),
      prisma.dailyDebt.count(),
      prisma.debtHistory.count(),
    ]);

    const clientProfiles = profiles.filter((p) => p.user?.role === "client");

    const monthKeys: string[] = [];
    for (let i = 5; i >= 0; i--) {
      const date = new Date(Date.UTC(local.year, local.month - 1 - i, 1, 5));
      monthKeys.push(toMonthKey(date));
    }

    const monthlyIncomeMap = new Map<string, number>(
      monthKeys.map((key) => [key, 0])
    );

    for (const payment of paymentRecords) {
      const key = toMonthKey(new Date(payment.payment_date));
      if (!monthlyIncomeMap.has(key)) continue;
      monthlyIncomeMap.set(
        key,
        (monthlyIncomeMap.get(key) ?? 0) + toNumber(payment.payment_amount)
      );
    }

    const incomeTrend = monthKeys.map((key) => ({
      period: key,
      total: Number((monthlyIncomeMap.get(key) ?? 0).toFixed(2)),
    }));

    const dayKeys: string[] = [];
    for (let i = 13; i >= 0; i--) {
      const date = new Date(todayStart.getTime() - i * 86400000);
      dayKeys.push(toDayKey(date));
    }

    const dailyAttendanceMap = new Map<string, number>(
      dayKeys.map((key) => [key, 0])
    );

    for (const attendance of attendanceRecords) {
      const key = toDayKey(new Date(attendance.checkInTime));
      if (!dailyAttendanceMap.has(key)) continue;
      dailyAttendanceMap.set(key, (dailyAttendanceMap.get(key) ?? 0) + 1);
    }

    const attendanceTrend = dayKeys.map((day) => ({
      day,
      count: dailyAttendanceMap.get(day) ?? 0,
    }));

    const topProductsMap = new Map<
      string,
      { productId: string; name: string; revenue: number; quantity: number }
    >();

    for (const purchase of purchaseRecords) {
      const productId = purchase.productId;
      const existing = topProductsMap.get(productId);
      const name = purchase.product?.item_name ?? "Producto eliminado";
      const revenue = toNumber(purchase.purchase_total);
      const quantity = purchase.purchase_quantity ?? 0;

      if (!existing) {
        topProductsMap.set(productId, { productId, name, revenue, quantity });
        continue;
      }

      existing.revenue += revenue;
      existing.quantity += quantity;
      topProductsMap.set(productId, existing);
    }

    const topProducts = [...topProductsMap.values()]
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 8)
      .map((row) => ({
        ...row,
        revenue: Number(row.revenue.toFixed(2)),
      }));

    const planDistributionMap = new Map<string, number>();
    for (const profile of clientProfiles) {
      const plan = profile.profile_plan?.trim() || "Sin plan";
      planDistributionMap.set(plan, (planDistributionMap.get(plan) ?? 0) + 1);
    }

    const planDistribution = [...planDistributionMap.entries()]
      .map(([plan, count]) => ({ plan, count }))
      .sort((a, b) => b.count - a.count);

    const totalDebt = clientProfiles.reduce(
      (acc, profile) => acc + toNumber(profile.debt),
      0
    );
    const clientsWithDebt = clientProfiles.filter((p) => toNumber(p.debt) > 0)
      .length;

    const productsLowStock = products.filter(
      (product) => product.item_stock <= 10
    ).length;
    const productsOutOfStock = products.filter(
      (product) => product.item_stock === 0
    ).length;

    const issues: Inconsistency[] = [];

    const clientsWithoutPlan = clientProfiles.filter(
      (profile) => !profile.profile_plan || !profile.profile_plan.trim()
    );
    pushIssue(issues, {
      id: "clients_without_plan",
      title: "Clientes sin plan asignado",
      severity: "high",
      count: clientsWithoutPlan.length,
      description:
        "Clientes con perfil creado pero sin plan de membresía definido.",
      samples: clientsWithoutPlan.map((profile) => profileLabel(profile)),
    });

    const clientsWithInvalidRange = clientProfiles.filter((profile) => {
      if (!profile.profile_start_date || !profile.profile_end_date) return false;
      return profile.profile_start_date > profile.profile_end_date;
    });
    pushIssue(issues, {
      id: "invalid_membership_dates",
      title: "Rango de membresía inválido",
      severity: "high",
      count: clientsWithInvalidRange.length,
      description:
        "La fecha de inicio es posterior a la fecha fin en el perfil del cliente.",
      samples: clientsWithInvalidRange.map(
        (profile) =>
          `${profileLabel(profile)}: ${shortDate(profile.profile_start_date)} > ${shortDate(profile.profile_end_date)}`,
      ),
    });

    const clientsWithPartialDates = clientProfiles.filter((profile) =>
      Boolean(profile.profile_start_date) !== Boolean(profile.profile_end_date)
    );
    pushIssue(issues, {
      id: "partial_membership_dates",
      title: "Fechas de membresía incompletas",
      severity: "medium",
      count: clientsWithPartialDates.length,
      description:
        "Perfiles con solo fecha de inicio o solo fecha de fin, lo que afecta reportes y vencimientos.",
      samples: clientsWithPartialDates.map((profile) => {
        const missing = profile.profile_start_date ? "falta fecha de fin" : "falta fecha de inicio";
        return `${profileLabel(profile)}: ${missing}`;
      }),
    });

    const clientsWithoutIdentity = clientProfiles.filter(
      (profile) =>
        !profile.profile_first_name?.trim() || !profile.profile_last_name?.trim()
    );
    pushIssue(issues, {
      id: "missing_client_identity",
      title: "Perfiles sin nombre completo",
      severity: "medium",
      count: clientsWithoutIdentity.length,
      description:
        "Perfiles de cliente con nombre o apellido vacío.",
      samples: clientsWithoutIdentity.map((profile) => profileLabel(profile)),
    });

    const productsNegativeStock = products.filter(
      (product) => product.item_stock < 0
    );
    pushIssue(issues, {
      id: "negative_stock",
      title: "Productos con stock negativo",
      severity: "high",
      count: productsNegativeStock.length,
      description:
        "Productos con inventario negativo detectados. Revisar ventas/salidas manuales.",
      samples: productsNegativeStock.map((product) => product.item_name),
    });

    const productsWithoutImage = products.filter(
      (product) => !product.item_image_url?.trim()
    );
    pushIssue(issues, {
      id: "products_without_image",
      title: "Productos sin imagen",
      severity: "low",
      count: productsWithoutImage.length,
      description:
        "Productos sin imagen visible para panel y catálogo.",
      samples: productsWithoutImage.map((product) => product.item_name),
    });

    const productsInvalidPrice = products.filter(
      (product) => toNumber(product.item_price) <= 0
    );
    pushIssue(issues, {
      id: "invalid_product_price",
      title: "Productos con precio inválido",
      severity: "high",
      count: productsInvalidPrice.length,
      description:
        "Productos con precio menor o igual a 0.",
      samples: productsInvalidPrice.map((product) => product.item_name),
    });

    const duplicatedPhonesMap = new Map<string, string[]>();
    for (const profile of clientProfiles) {
      const phone = profile.profile_phone?.trim();
      if (!phone) continue;
      const ids = duplicatedPhonesMap.get(phone) ?? [];
      ids.push(profile.profile_id);
      duplicatedPhonesMap.set(phone, ids);
    }
    const duplicatedPhones = [...duplicatedPhonesMap.entries()].filter(
      ([, ids]) => ids.length > 1
    );
    pushIssue(issues, {
      id: "duplicated_phone",
      title: "Teléfonos duplicados",
      severity: "medium",
      count: duplicatedPhones.length,
      description:
        "Hay más de un cliente asociado al mismo teléfono en perfiles.",
      samples: duplicatedPhones.map(([phone]) => phone),
    });

    const weightedPenalty = issues.reduce((acc, issue) => {
      const weight = issue.severity === "high" ? 5 : issue.severity === "medium" ? 3 : 1;
      return acc + issue.count * weight;
    }, 0);
    const dataQualityScore = Math.max(0, Math.min(100, 100 - weightedPenalty));

    return NextResponse.json({
      generatedAt: new Date().toISOString(),
      overview: {
        totalIncome: toNumber(totalIncomeAgg._sum.payment_amount),
        productSales: toNumber(productSalesAgg._sum.purchase_total),
        newClients,
        todayAttendance,
        activeMemberships,
      },
      trends: {
        incomeTrend,
        attendanceTrend,
      },
      inventory: {
        totalProducts: products.length,
        lowStockProducts: productsLowStock,
        outOfStockProducts: productsOutOfStock,
      },
      debts: {
        clientsWithDebt,
        totalDebt: Number(totalDebt.toFixed(2)),
        dailyDebtsCount,
        debtHistoryCount,
      },
      distributions: {
        planDistribution,
        topProducts,
      },
      dataQuality: {
        score: dataQualityScore,
        issueCount: issues.reduce((acc, issue) => acc + issue.count, 0),
        inconsistencies: issues.sort((a, b) => {
          const severityRank: Record<Severity, number> = {
            high: 3,
            medium: 2,
            low: 1,
          };
          if (severityRank[b.severity] !== severityRank[a.severity]) {
            return severityRank[b.severity] - severityRank[a.severity];
          }
          return b.count - a.count;
        }),
      },
    });
  } catch (error) {
    console.error("Error generando reportes admin:", error);
    return NextResponse.json(
      { error: "Error interno del servidor" },
      { status: 500 }
    );
  }
}
