import { timingSafeEqual } from "node:crypto";

function safeEqual(left: string, right: string) {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}

export function adminIsConfigured() {
  return Boolean(import.meta.env.ADMIN_USER && import.meta.env.ADMIN_PASSWORD);
}

export function isAdminAuthorized(request: Request) {
  const expectedUser = import.meta.env.ADMIN_USER;
  const expectedPassword = import.meta.env.ADMIN_PASSWORD;
  if (!expectedUser || !expectedPassword) return false;

  const authorization = request.headers.get("authorization") || "";
  if (!authorization.startsWith("Basic ")) return false;

  try {
    const decoded = Buffer.from(authorization.slice(6), "base64").toString("utf8");
    const separator = decoded.indexOf(":");
    if (separator < 0) return false;
    return safeEqual(decoded.slice(0, separator), expectedUser)
      && safeEqual(decoded.slice(separator + 1), expectedPassword);
  } catch {
    return false;
  }
}

export function adminUnauthorized(configured = adminIsConfigured()) {
  return new Response(
    configured ? "Credenciales incorrectas." : "El acceso administrativo todavía no está configurado.",
    {
      status: configured ? 401 : 503,
      headers: configured
        ? { "WWW-Authenticate": 'Basic realm="Nuite Gestion", charset="UTF-8"' }
        : {},
    },
  );
}

export function isSameOriginRequest(request: Request) {
  const origin = request.headers.get("origin");
  return !origin || origin === new URL(request.url).origin;
}
