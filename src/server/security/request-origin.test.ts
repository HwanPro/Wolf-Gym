import { describe, it, expect } from "vitest";
import { isTrustedMutation } from "./request-origin";
const request = (headers: Record<string, string>, method = "POST") => ({ url: "http://127.0.0.1:3100/api/admin/cash/sale", method, headers: new Headers(headers) });
describe("mutation origins", () => {
  it("rejects foreign, opaque and cross-site origins", () => {
    for (const origin of ["https://attacker.invalid", "null", "http://127.0.0.1:3100.attacker.invalid", "not-url"]) expect(isTrustedMutation(request({ origin }))).toBe(false);
    expect(isTrustedMutation(request({ origin: "http://127.0.0.1:3100", "sec-fetch-site": "cross-site" }))).toBe(false);
  });
  it("accepts exact same-origin and the configured canonical origin", () => {
    expect(isTrustedMutation(request({ origin: "http://127.0.0.1:3100" }))).toBe(true);
    expect(isTrustedMutation(request({ origin: "https://gym.example" }), "https://gym.example/auth")).toBe(true);
    expect(isTrustedMutation({ ...request({ origin: "https://attacker.invalid" }), url: "https://attacker.invalid/api" }, "https://gym.example")).toBe(false);
  });
  it("uses referer fallback and preserves authenticated non-browser clients", () => {
    expect(isTrustedMutation(request({ referer: "https://attacker.invalid/form" }))).toBe(false);
    expect(isTrustedMutation(request({ referer: "http://127.0.0.1:3100/admin/sales" }))).toBe(true);
    expect(isTrustedMutation(request({}))).toBe(true);
    expect(isTrustedMutation(request({ origin: "null" }, "GET"))).toBe(true);
  });
  it("allows loopback aliases only in verified local mode on the same protocol and port", () => {
    const canonical = "http://127.0.0.1:3100";
    for (const origin of ["http://localhost:3100", "http://[::1]:3100"]) {
      expect(isTrustedMutation(request({ origin }), canonical, true)).toBe(true);
      expect(isTrustedMutation(request({ origin }), canonical, false)).toBe(false);
    }
    for (const origin of ["http://localhost:3000", "https://localhost:3100", "http://localhost.attacker.invalid:3100", "https://attacker.invalid"]) {
      expect(isTrustedMutation(request({ origin }), canonical, true)).toBe(false);
    }
    expect(isTrustedMutation(request({ origin: canonical, "sec-fetch-site": "cross-site" }), canonical, true)).toBe(false);
    expect(isTrustedMutation(request({ origin: "http://localhost:3100" }), "https://gym.example", true)).toBe(false);
  });
});
