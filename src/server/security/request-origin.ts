export function isTrustedMutation(request: { method: string; url: string; headers: Headers }, configuredUrl?: string, localOnly = false) {
  if (["GET", "HEAD", "OPTIONS"].includes(request.method.toUpperCase())) return true;
  if (request.headers.get("sec-fetch-site") === "cross-site") return false;
  const origin = request.headers.get("origin");
  const referer = request.headers.get("referer");
  if (!origin && !referer) return true; // Non-browser clients; authorization is still mandatory.
  try {
    const canonical = new URL(configuredUrl || request.url);
    const allowed = new Set([canonical.origin]);
    // La misma aplicación local puede abrirse mediante cualquiera de sus alias
    // de loopback. Mantener protocolo/puerto y no ampliar orígenes de producción.
    if (localOnly && ["localhost", "127.0.0.1", "[::1]"].includes(canonical.hostname)) {
      for (const hostname of ["localhost", "127.0.0.1", "[::1]"]) {
        const alias = new URL(canonical.origin);
        alias.hostname = hostname;
        allowed.add(alias.origin);
      }
    }
    const incoming = origin ? new URL(origin).origin : new URL(referer!).origin;
    if (origin === "null") return false;
    return allowed.has(incoming);
  } catch { return false; }
}
