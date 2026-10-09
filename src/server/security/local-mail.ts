import { mkdir, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import path from "node:path";
export async function saveLocalMail(message: unknown) {
  if (process.env.WOLF_LOCAL_ONLY !== "1" || process.env.WOLF_DISABLE_EXTERNAL_WRITES !== "1") return false;
  const folder = path.join(process.cwd(), ".local", "mail-outbox");
  await mkdir(folder, { recursive: true });
  await writeFile(path.join(folder, `${Date.now()}-${randomUUID()}.json`), JSON.stringify(message, null, 2), { mode: 0o600 });
  return true;
}
