import { describe, expect, it } from "vitest";
import { clientPhoneAliases, clientPhoneSchema, datesInOrder, isCalendarDate, optionalClientDateSchema } from "./client-input";

describe("client input boundaries", () => {
  it("normalizes equivalent Peruvian phones and keeps legacy lookup aliases", () => {
    for (const phone of ["987654321", "+51 987 654 321", "(987) 654-321"]) {
      expect(clientPhoneSchema.parse(phone)).toBe("+51987654321");
    }
    expect(clientPhoneAliases("+51987654321")).toEqual(["+51987654321", "987654321"]);
  });
  it("rejects text, short and empty phones", () => {
    for (const phone of ["abcdefghi", "Call 987654321", "123", ""]) expect(clientPhoneSchema.safeParse(phone).success).toBe(false);
  });
  it("validates calendar dates without Date rollover", () => {
    for (const value of ["2026-02-30", "2025-02-29", "2026-13-01", "2026-04-31", "not-date", "2026-02-30T00:00:00.000Z"]) expect(isCalendarDate(value)).toBe(false);
    for (const value of ["2024-02-29", "2026-10-03", "2026-10-03T00:00:00.000Z"]) expect(isCalendarDate(value)).toBe(true);
    expect(optionalClientDateSchema.parse("")).toBe(null);
    expect(optionalClientDateSchema.parse(undefined)).toBe(null);
    expect(datesInOrder("2026-10-03", "2026-10-02")).toBe(false);
    expect(datesInOrder("2026-10-03", "2026-10-03")).toBe(true);
  });
});
