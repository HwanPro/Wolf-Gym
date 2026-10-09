import { parsePhoneNumberFromString } from "libphonenumber-js";
import { z } from "zod";

export function normalizeClientPhone(value: string): string | null {
  // Do not let the phone parser extract a number from arbitrary text.
  if (!/^[+\d\s().-]+$/.test(value.trim())) return null;
  const phone = parsePhoneNumberFromString(value.trim(), "PE");
  return phone?.isValid() ? phone.number : null;
}

export const clientPhoneSchema = z.string().trim().transform((value, ctx) => {
  const phone = normalizeClientPhone(value);
  if (!phone) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "El teléfono no es válido" });
    return z.NEVER;
  }
  return phone;
});

export function clientPhoneAliases(phone: string) {
  const parsed = parsePhoneNumberFromString(phone);
  // Include the national format saved by older public registrations.
  return parsed?.country === "PE" ? [phone, String(parsed.nationalNumber)] : [phone];
}

export function isCalendarDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}(?:$|T)/.test(value)) return false;
  const day = value.slice(0, 10);
  const date = new Date(day + "T00:00:00.000Z");
  if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== day) return false;
  return value.length === 10 || z.string().datetime({ offset: true }).safeParse(value).success;
}

export const optionalClientDateSchema = z.preprocess(
  value => value === "" || value === undefined ? null : value,
  z.string().refine(isCalendarDate, "La fecha no existe o tiene un formato inválido").nullable(),
);

export function datesInOrder(start: string | null, end: string | null) {
  return !start || !end || new Date(start).getTime() <= new Date(end).getTime();
}
