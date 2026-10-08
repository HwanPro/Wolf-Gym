import net, { type Server, type Socket } from "node:net";
import { afterEach, expect, it, vi } from "vitest";
import { sendEmail } from "./mail";

let server: Server | undefined;
const sockets = new Set<Socket>();
async function listen() {
  server = net.createServer((socket) => {
    sockets.add(socket);
    socket.once("close", () => sockets.delete(socket));
  });
  await new Promise<void>((resolve) => server!.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Expected loopback TCP port");
  return address.port;
}
function configure(port: number) {
  // This process can contact only the synthetic loopback SMTP endpoint.
  vi.stubEnv("WOLF_LOCAL_ONLY", "0");
  vi.stubEnv("WOLF_DISABLE_EXTERNAL_WRITES", "0");
  vi.stubEnv("SMTP_HOST", "127.0.0.1");
  vi.stubEnv("SMTP_PORT", String(port));
  vi.stubEnv("SMTP_USER", "smtp-fixture@example.invalid");
  vi.stubEnv("SMTP_PASS", "synthetic-loopback-only");
  vi.stubEnv("SMTP_FROM", "smtp-fixture@example.invalid");
}
afterEach(async () => {
  for (const socket of sockets) socket.destroy();
  if (server?.listening) await new Promise<void>((resolve) => server!.close(() => resolve()));
  server = undefined;
  vi.unstubAllEnvs();
});
it("rejects a real refused loopback SMTP connection", async () => {
  const port = await listen();
  await new Promise<void>((resolve) => server!.close(() => resolve()));
  configure(port);
  await expect(sendEmail("recipient@example.invalid", "Local fixture", "<p>Fixture</p>"))
    .rejects.toMatchObject({ code: "ESOCKET" });
});
it("bounds the wait when a real SMTP socket accepts TCP but never greets", async () => {
  configure(await listen());
  const start = Date.now();
  await expect(sendEmail("recipient@example.invalid", "Local fixture", "<p>Fixture</p>"))
    .rejects.toMatchObject({ code: "ETIMEDOUT", command: "CONN" });
  expect(Date.now() - start).toBeGreaterThanOrEqual(9000);
  expect(Date.now() - start).toBeLessThan(13000);
}, 15000);
