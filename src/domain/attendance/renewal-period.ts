import { limaDateParts } from "./attendance-policy";

export function renewalPeriod(durationDays: number, currentStart?: string, currentEnd?: string, now = new Date()) {
  const { year, month, day } = limaDateParts(now);
  const today = Date.UTC(year, month - 1, day);
  const parsedEnd = currentEnd ? Date.parse(currentEnd.slice(0, 10) + "T00:00:00Z") : NaN;
  const active = Number.isFinite(parsedEnd) && parsedEnd >= today;
  const startDate = active && currentStart ? currentStart.slice(0, 10) : new Date(today).toISOString().slice(0, 10);
  const endDate = new Date((active ? parsedEnd : today) + durationDays * 86400000).toISOString().slice(0, 10);
  return { startDate, endDate };
}
