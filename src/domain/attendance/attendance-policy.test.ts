import { describe, expect, it } from "vitest";

import {
  getLimaDayRange,
  getMembershipStatus,
  isGymOpen,
  limaDateParts,
} from "./attendance-policy";

describe("attendance policy", () => {
  it("uses the Lima calendar even when the server runs in another timezone", () => {
    const instant = new Date("2026-07-10T02:30:00.000Z");

    expect(limaDateParts(instant)).toMatchObject({
      year: 2026,
      month: 7,
      day: 9,
      weekday: 4,
      hour: 21,
      minute: 30,
    });
  });

  it("creates a UTC range that covers exactly one Lima calendar day", () => {
    const { start, end } = getLimaDayRange(
      new Date("2026-07-10T02:30:00.000Z"),
    );

    expect(start.toISOString()).toBe("2026-07-09T05:00:00.000Z");
    expect(end.toISOString()).toBe("2026-07-10T04:59:59.999Z");
  });

  it.each([
    ["2026-07-06T10:59:00.000Z", false],
    ["2026-07-06T11:00:00.000Z", true],
    ["2026-07-07T01:59:00.000Z", true],
    ["2026-07-07T02:00:00.000Z", false],
    ["2026-07-11T11:00:00.000Z", true],
    ["2026-07-12T01:00:00.000Z", false],
    ["2026-07-12T18:00:00.000Z", false],
  ])("applies the documented opening hours at %s", (iso, expected) => {
    expect(isGymOpen(new Date(iso))).toBe(expected);
  });

  it("keeps a membership active through the end of its Lima end date", () => {
    const endDate = new Date("2026-07-10T04:59:59.999Z");

    expect(
      getMembershipStatus(endDate, new Date("2026-07-10T04:30:00.000Z")),
    ).toEqual({ expired: false, daysLeft: 0 });
    expect(
      getMembershipStatus(endDate, new Date("2026-07-10T05:00:00.000Z")),
    ).toEqual({ expired: true, daysLeft: 0 });
  });

  it("does not block attendance when no membership end date exists", () => {
    expect(getMembershipStatus(null, new Date())).toEqual({
      expired: false,
      daysLeft: null,
    });
  });
});
