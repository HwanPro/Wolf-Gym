import { afterEach, expect, it, vi } from "vitest";
const fs = vi.hoisted(() => ({ mkdir: vi.fn(), writeFile: vi.fn() }));
vi.mock("node:fs/promises", () => fs);
import { saveLocalMail } from "./local-mail";
afterEach(() => { vi.unstubAllEnvs(); vi.clearAllMocks(); });
it("saves private test mail only under the explicit local guards", async () => {
  vi.stubEnv("WOLF_LOCAL_ONLY", "0"); vi.stubEnv("WOLF_DISABLE_EXTERNAL_WRITES", "1");
  expect(await saveLocalMail({ to: "test.invalid" })).toBe(false);
  vi.stubEnv("WOLF_LOCAL_ONLY", "1"); vi.stubEnv("WOLF_DISABLE_EXTERNAL_WRITES", "0");
  expect(await saveLocalMail({ to: "test.invalid" })).toBe(false);
  vi.stubEnv("WOLF_DISABLE_EXTERNAL_WRITES", "1");
  expect(await saveLocalMail({ to: "test.invalid" })).toBe(true);
  expect(fs.writeFile).toHaveBeenCalledWith(expect.stringContaining("mail-outbox"), expect.stringContaining("test.invalid"), { mode: 0o600 });
});
