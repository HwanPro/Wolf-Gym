const LIMA_TIME_ZONE = "America/Lima";
const LIMA_UTC_OFFSET_HOURS = 5;

const WEEKDAY_NUMBER: Record<string, number> = {
  Sunday: 0,
  Monday: 1,
  Tuesday: 2,
  Wednesday: 3,
  Thursday: 4,
  Friday: 5,
  Saturday: 6,
};

const limaFormatter = new Intl.DateTimeFormat("en-US", {
  timeZone: LIMA_TIME_ZONE,
  year: "numeric",
  month: "numeric",
  day: "numeric",
  weekday: "long",
  hour: "numeric",
  minute: "numeric",
  second: "numeric",
  hourCycle: "h23",
});

export type LimaDateParts = {
  year: number;
  month: number;
  day: number;
  weekday: number;
  hour: number;
  minute: number;
  second: number;
};

export type MembershipStatus = {
  expired: boolean;
  daysLeft: number | null;
};

export const OPENING_HOURS: Readonly<
  Partial<Record<number, Readonly<{ startMinute: number; endMinute: number }>>>
> = {
  1: { startMinute: 6 * 60, endMinute: 21 * 60 },
  2: { startMinute: 6 * 60, endMinute: 21 * 60 },
  3: { startMinute: 6 * 60, endMinute: 21 * 60 },
  4: { startMinute: 6 * 60, endMinute: 21 * 60 },
  5: { startMinute: 6 * 60, endMinute: 21 * 60 },
  6: { startMinute: 6 * 60, endMinute: 20 * 60 },
};

export function limaDateParts(date = new Date()): LimaDateParts {
  const values = Object.fromEntries(
    limaFormatter
      .formatToParts(date)
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, part.value]),
  );

  return {
    year: Number(values.year),
    month: Number(values.month),
    day: Number(values.day),
    weekday: WEEKDAY_NUMBER[values.weekday] ?? 0,
    hour: Number(values.hour),
    minute: Number(values.minute),
    second: Number(values.second),
  };
}

export function getLimaDayRange(date = new Date()) {
  const { year, month, day } = limaDateParts(date);
  const startMs = Date.UTC(
    year,
    month - 1,
    day,
    LIMA_UTC_OFFSET_HOURS,
    0,
    0,
    0,
  );

  return {
    start: new Date(startMs),
    end: new Date(startMs + 24 * 60 * 60 * 1000 - 1),
  };
}

export function isGymOpen(date = new Date()) {
  const parts = limaDateParts(date);
  const hours = OPENING_HOURS[parts.weekday];
  if (!hours) return false;

  const minute = parts.hour * 60 + parts.minute;
  return minute >= hours.startMinute && minute < hours.endMinute;
}

export function getMembershipStatus(
  endDate: Date | null | undefined,
  now = new Date(),
): MembershipStatus {
  if (!endDate) return { expired: false, daysLeft: null };

  const end = limaDateParts(endDate);
  const current = limaDateParts(now);
  const endDay = Date.UTC(end.year, end.month - 1, end.day);
  const currentDay = Date.UTC(current.year, current.month - 1, current.day);
  const difference = Math.round(
    (endDay - currentDay) / (24 * 60 * 60 * 1000),
  );

  return {
    expired: difference < 0,
    daysLeft: Math.max(0, difference),
  };
}
