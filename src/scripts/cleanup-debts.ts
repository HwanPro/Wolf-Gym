// Financial obligations and their history must survive date changes.
// Kept as compatibility exports for scheduled callers; no destructive cleanup.
export async function cleanupDailyDebts() { return { preserved: true }; }
export async function cleanupWeeklyHistory() { return { preserved: true }; }
