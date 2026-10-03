import type { APIRoute } from "astro";
import { getServerConfig, synchronizeFlowPayment } from "../../../lib/server/flow";

export const prerender = false;

const json = (body: Record<string, unknown>, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
});

export const POST: APIRoute = async ({ request }) => {
  try {
    const config = getServerConfig();
    const requestOrigin = request.headers.get("origin");
    if (requestOrigin && requestOrigin !== new URL(config.siteUrl).origin) {
      return json({ error: "Origen no permitido." }, 403);
    }

    const body = await request.json();
    const orderId = String(body?.orderId || "").trim();
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(orderId)) {
      return json({ error: "Pedido invalido." }, 400);
    }

    const { data: paymentEvent, error } = await config.supabase
      .from("store_payment_events")
      .select("provider_token")
      .eq("order_id", orderId)
      .eq("provider", "flow")
      .not("provider_token", "is", null)
      .order("received_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) throw error;
    if (!paymentEvent?.provider_token) {
      return json({ error: "No encontramos una transaccion de Flow para este pedido." }, 404);
    }

    const result = await synchronizeFlowPayment(paymentEvent.provider_token);
    return json({ ok: true, paid: result.paid, providerStatus: result.providerStatus });
  } catch (error) {
    console.error("No se pudo actualizar el estado del pedido.", error);
    return json({ error: "No pudimos consultar Flow en este momento." }, 500);
  }
};
