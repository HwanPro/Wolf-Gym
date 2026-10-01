export type AttendanceFeedRow = {
  checkOutTime?: string | null;
  checkInTime: string;
  profileId?: string;
  userId?: string;
  fullName?: string;
  plan?: string;
  daysLeft?: number | string;
  monthlyDebt?: number | string;
  dailyDebt?: number | string;
  totalDebt?: number | string;
  avatarUrl?: string;
  profile?: {
    id?: string;
    profileId?: string;
    fullName?: string;
    plan?: string;
    endDate?: string | null;
    monthlyDebt?: number | string;
    dailyDebt?: number | string;
    totalDebt?: number | string;
    image?: string;
  };
  user?: {
    id?: string;
    name?: string;
    username?: string;
    firstName?: string | null;
    lastName?: string | null;
    image?: string;
  };
};

export type ActiveGymMember = {
  profileId: string;
  userId?: string;
  fullName: string;
  plan?: string;
  daysLeft?: number;
  monthlyDebt: number;
  dailyDebt: number;
  totalDebt: number;
  checkInTime: number;
  avatarUrl?: string;
};

function toNumber(value: number | string | null | undefined) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function daysUntil(endDate: string | null | undefined, now: Date) {
  if (!endDate) return undefined;
  const end = new Date(endDate);
  if (Number.isNaN(end.getTime())) return undefined;
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const lastDay = new Date(end.getFullYear(), end.getMonth(), end.getDate());
  return Math.max(0, Math.ceil((lastDay.getTime() - today.getTime()) / 86_400_000));
}

export function mapActiveAttendanceRows(
  rows: AttendanceFeedRow[],
  now = new Date(),
): ActiveGymMember[] {
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  return rows
    .filter(
      (row) =>
        !row.checkOutTime && new Date(row.checkInTime).getTime() >= todayStart.getTime(),
    )
    .map((row) => {
      const profile = row.profile;
      const user = row.user;
      const monthlyDebt = toNumber(row.monthlyDebt ?? profile?.monthlyDebt);
      const dailyDebt = toNumber(row.dailyDebt ?? profile?.dailyDebt);
      const fullName =
        row.fullName ||
        profile?.fullName ||
        `${user?.firstName || ""} ${user?.lastName || ""}`.trim() ||
        user?.name ||
        user?.username ||
        "Cliente";

      return {
        profileId: row.profileId ?? profile?.profileId ?? profile?.id ?? "",
        userId: row.userId ?? user?.id,
        fullName,
        plan: row.plan ?? profile?.plan,
        daysLeft:
          row.daysLeft !== undefined
            ? toNumber(row.daysLeft)
            : daysUntil(profile?.endDate, now),
        monthlyDebt,
        dailyDebt,
        totalDebt: toNumber(
          row.totalDebt ?? profile?.totalDebt ?? monthlyDebt + dailyDebt,
        ),
        checkInTime: new Date(row.checkInTime).getTime(),
        avatarUrl: row.avatarUrl ?? profile?.image ?? user?.image,
      };
    })
    .sort((a, b) => b.checkInTime - a.checkInTime);
}
