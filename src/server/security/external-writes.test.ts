import { afterEach, expect, it, vi } from "vitest";
import { assertExternalWrites } from "./external-writes";
afterEach(() => vi.unstubAllEnvs());
it("blocks external actions in a protected local runtime", () => {
  vi.stubEnv("WOLF_DISABLE_EXTERNAL_WRITES", "1"); expect(assertExternalWrites).toThrow("deshabilitados");
  vi.stubEnv("WOLF_DISABLE_EXTERNAL_WRITES", "0"); expect(assertExternalWrites).not.toThrow();
});
