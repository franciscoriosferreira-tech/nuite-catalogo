import type { APIRoute } from "astro";
import { getServerConfig } from "../../lib/server/flow";

export const prerender = false;

const attempts = new Map<string, { count: number; resetAt: number }>();
const WINDOW_MS = 10 * 60 * 1000;
const MAX_ATTEMPTS = 10;

const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), {
  status,
  headers: {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
  },
});

function clientKey(request: Request) {
  return request.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
    || request.headers.get("x-real-ip")
    || "unknown";
}

function rateLimited(request: Request) {
  const now = Date.now();
  const key = clientKey(request);
  const current = attempts.get(key);

  if (!current || current.resetAt <= now) {
    attempts.set(key, { count: 1, resetAt: now + WINDOW_MS });
    return false;
  }

  current.count += 1;
  if (attempts.size > 1000) {
    for (const [storedKey, bucket] of attempts) {
      if (bucket.resetAt <= now) attempts.delete(storedKey);
    }
  }
  return current.count > MAX_ATTEMPTS;
}

export const POST: APIRoute = async ({ request }) => {
  if (rateLimited(request)) {
    return json({ error: "Has realizado demasiados intentos. Espera unos minutos y vuelve a intentar." }, 429);
  }

  try {
    const payload = await request.json();
    const email = String(payload.email || "").trim().toLowerCase().slice(0, 160);
    const orderCode = String(payload.orderCode || "").trim().toLowerCase();

    if (!/^\S+@\S+\.\S+$/.test(email) || !/^[0-9a-f]{8}$/.test(orderCode)) {
      return json({ error: "Revisa el número de orden y el correo ingresado." }, 400);
    }

    const config = getServerConfig();
    const { data, error } = await config.supabase
      .from("store_orders")
      .select("id")
      .eq("customer_email", email)
      .order("created_at", { ascending: false })
      .limit(20);

    if (error) throw error;
    const order = data?.find((candidate) => String(candidate.id).toLowerCase().startsWith(orderCode));

    if (!order) {
      return json({
        error: "No encontramos el pedido. Usa el correo que ingresaste en el checkout antes de abrir Flow; puede ser distinto al correo de tu tarjeta.",
      }, 404);
    }

    return json({ redirectUrl: `/pago?orden=${encodeURIComponent(order.id)}` });
  } catch (error) {
    console.error(error);
    return json({ error: "No pudimos consultar el pedido en este momento. Intenta nuevamente." }, 500);
  }
};
