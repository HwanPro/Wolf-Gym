import { describe, expect, it } from "vitest";
import { mapActiveAttendanceRows } from "./attendance-feed";

describe("mapActiveAttendanceRows", () => {
  it("lee perfil, nombre y deudas desde el contrato anidado de asistencia", () => {
    const rows = mapActiveAttendanceRows(
      [
        {
          checkInTime: "2026-09-30T15:00:00.000Z",
          checkOutTime: null,
          userId: "user-1",
          user: {
            id: "user-1",
            username: "prueba01",
            firstName: "Cliente 01",
            lastName: "Prueba Wolf Gym",
          },
          profile: {
            profileId: "profile-1",
            plan: "Plan Mes",
            endDate: "2026-10-24T05:00:00.000Z",
            monthlyDebt: 7,
            dailyDebt: 1.5,
            totalDebt: 8.5,
          },
        },
      ],
      new Date("2026-09-30T18:00:00.000Z"),
    );

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      profileId: "profile-1",
      fullName: "Cliente 01 Prueba Wolf Gym",
      plan: "Plan Mes",
      monthlyDebt: 7,
      dailyDebt: 1.5,
      totalDebt: 8.5,
    });
  });

  it("excluye clientes que ya registraron salida", () => {
    const rows = mapActiveAttendanceRows(
      [
        {
          checkInTime: "2026-09-30T15:00:00.000Z",
          checkOutTime: "2026-09-30T16:00:00.000Z",
        },
      ],
      new Date("2026-09-30T18:00:00.000Z"),
    );

    expect(rows).toEqual([]);
  });
});
