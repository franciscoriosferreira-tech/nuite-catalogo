import type { APIRoute } from "astro";
import { randomUUID } from "node:crypto";
import { createFlowPayment, getServerConfig } from "../../lib/server/flow";

export const prerender = false;

const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), {
  status,
  headers: { "Content-Type": "application/json; charset=utf-8" },
});

export const POST: APIRoute = async ({ request }) => {
  try {
    const payload = await request.json();
    const email = String(payload.email || "").trim().toLowerCase();
    const rawItems = Array.isArray(payload.items) ? payload.items : [];

    if (!/^\S+@\S+\.\S+$/.test(email)) return json({ error: "Ingresa un correo válido." }, 400);
    if (rawItems.length === 0 || rawItems.length > 20) return json({ error: "El carrito no es válido." }, 400);

    const quantities = new Map<string, number>();
    for (const item of rawItems) {
      const id = String(item.id || "");
      const quantity = Number(item.quantity);
      if (!/^[0-9a-f-]{36}$/i.test(id) || !Number.isInteger(quantity) || quantity < 1 || quantity > 10) {
        return json({ error: "Uno de los productos no es válido." }, 400);
      }
      quantities.set(id, Math.min(10, (quantities.get(id) || 0) + quantity));
    }

    const config = getServerConfig();
    const items = [...quantities].map(([id, quantity]) => ({ id, quantity }));
    const commerceOrder = `NUITE-${randomUUID()}`;
    const { data: created, error: orderError } = await config.supabase.rpc("create_store_order", {
      p_commerce_order: commerceOrder,
      p_customer_email: email,
      p_items: items,
    });
    const order = created?.[0];
    if (orderError || !order) throw orderError || new Error("No se pudo crear la orden.");
    const total = Number(order.created_total_clp);
    const orderId = order.created_order_id;

    const flow = await createFlowPayment({
      apiKey: config.apiKey,
      commerceOrder,
      subject: `Compra Nuité Perfumes (${items.length} producto${items.length === 1 ? "" : "s"})`,
      currency: "CLP",
      amount: total,
      email,
      paymentMethod: 9,
      urlConfirmation: `${config.siteUrl}/api/flow/confirmation`,
      urlReturn: `${config.siteUrl}/api/flow/return`,
      optional: JSON.stringify({ orderId }),
      timeout: 1800,
    });

    await config.supabase.from("store_orders").update({
      flow_order: flow.flowOrder,
      flow_token: flow.token,
    }).eq("id", orderId);

    return json({ redirectUrl: `${flow.url}?token=${encodeURIComponent(flow.token)}` });
  } catch (error) {
    console.error(error);
    const message = error instanceof Error ? error.message : "No se pudo iniciar el pago.";
    return json({ error: message }, 500);
  }
};
