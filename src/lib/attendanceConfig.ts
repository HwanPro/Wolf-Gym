// America/Lima (sin DST)
export const TIMEZONE = "America/Lima";

// Horarios de atención (minutos desde 00:00)
export const OPEN_WINDOWS: Record<number, { start: number; end: number }> = {
  // 0=Dom ... 6=Sáb
  1: { start: 6 * 60, end: 21 * 60 }, // L
  2: { start: 6 * 60, end: 21 * 60 }, // M
  3: { start: 6 * 60, end: 21 * 60 }, // M
  4: { start: 6 * 60, end: 21 * 60 }, // J
  5: { start: 6 * 60, end: 21 * 60 }, // V
  6: { start: 6 * 60, end: 20 * 60 }, // S
};

export const AUTO_CLOSE_MIN = 21 * 60; // 21:00 (L-V)
export const AUTO_CLOSE_MIN_SAT = 20 * 60; // 20:00 sáb

// Ventanas separadas para tipo de sesión (EDITA libremente)
export type SessionType = "GYM" | "FULLBODY";

export const SESSION_WINDOWS: Array<{
  dow: number[];           // días de semana
  startMin: number;        // minutos desde 00:00
  endMin: number;
  type: SessionType;
}> = [
  { dow: [1,2,3,4,5], startMin: 6*60, endMin: 18*60, type: "GYM" },
  { dow: [1,2,3,4,5], startMin: 18*60,   endMin: 19*60+30, type: "FULLBODY" },
  { dow: [1,2,3,4,5], startMin: 19*60+30, endMin: 21*60,   type: "GYM" },
  { dow: [6],          startMin: 6*60,    endMin: 18*60,   type: "GYM" },
  { dow: [6],          startMin: 18*60,   endMin: 20*60,   type: "FULLBODY" },
];

export function limaNow(): Date {
  // Next.js runtime: usar Date "local" + Intl para TZ display; cálculos por minutos
  return new Date(); // persistimos en UTC en BD, pero todas reglas usan minutos locales
}

export function minutesSinceMidnight(d = limaNow()): number {
  const hh = d.getHours();
  const mm = d.getMinutes();
  return hh*60 + mm;
}

export function currentSessionType(d = limaNow()): SessionType | null {
  const dow = d.getDay(); // 0=Dom..6=Sáb
  const m = minutesSinceMidnight(d);
  for (const w of SESSION_WINDOWS) {
    if (w.dow.includes(dow) && m >= w.startMin && m < w.endMin) return w.type;
  }
  return null;
}

export function autoCloseMinuteFor(d = limaNow()): number | null {
  const dow = d.getDay();
  if (dow === 6) return AUTO_CLOSE_MIN_SAT;
  if (dow >= 1 && dow <= 5) return AUTO_CLOSE_MIN;
  return null;
}
