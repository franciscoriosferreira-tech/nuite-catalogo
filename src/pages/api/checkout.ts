import type { APIRoute } from "astro";
import { randomUUID } from "node:crypto";
import { createFlowPayment, getServerConfig } from "../../lib/server/flow";
import { CHILE_REGIONS, SHIPPING_CARRIER_NAMES } from "../../data/shipping";

export const prerender = false;

const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), {
  status,
  headers: { "Content-Type": "application/json; charset=utf-8" },
});

const clean = (value: unknown, maxLength: number) => String(value || "").trim().slice(0, maxLength);

function normalizePhone(value: unknown) {
  const digits = String(value || "").replace(/\D/g, "");
  if (digits.length === 9 && /^[2-9]/.test(digits)) return `+56${digits}`;
  if (digits.length === 11 && digits.startsWith("56") && /^[2-9]/.test(digits.slice(2))) return `+${digits}`;
  return "";
}

export const POST: APIRoute = async ({ request }) => {
  try {
    const payload = await request.json();
    const email = String(payload.email || "").trim().toLowerCase();
    const rawItems = Array.isArray(payload.items) ? payload.items : [];
    const rawDelivery = payload.delivery && typeof payload.delivery === "object" ? payload.delivery : {};
    const method = clean(rawDelivery.method, 30);
    const customerName = clean(rawDelivery.customerName, 90);
    const phone = normalizePhone(rawDelivery.phone);

    if (!/^\S+@\S+\.\S+$/.test(email)) return json({ error: "Ingresa un correo válido." }, 400);
    if (customerName.length < 3) return json({ error: "Ingresa el nombre completo de quien recibirá el pedido." }, 400);
    if (!phone) return json({ error: "Ingresa un teléfono chileno válido." }, 400);
    if (!["pickup", "shipping_collect"].includes(method)) return json({ error: "Selecciona una forma de entrega válida." }, 400);
    if (rawItems.length === 0 || rawItems.length > 20) return json({ error: "El carrito no es válido." }, 400);

    const delivery = {
      method,
      customerName,
      phone,
      region: "",
      commune: "",
      address: "",
      addressNumber: "",
      addressExtra: "",
      carrier: "",
      notes: clean(rawDelivery.notes, 300),
    };

    if (method === "shipping_collect") {
      delivery.region = clean(rawDelivery.region, 80);
      delivery.commune = clean(rawDelivery.commune, 70);
      delivery.address = clean(rawDelivery.address, 140);
      delivery.addressNumber = clean(rawDelivery.addressNumber, 15);
      delivery.addressExtra = clean(rawDelivery.addressExtra, 140);
      delivery.carrier = clean(rawDelivery.carrier, 30);

      if (!CHILE_REGIONS.includes(delivery.region as typeof CHILE_REGIONS[number])) {
        return json({ error: "Selecciona una región válida." }, 400);
      }
      if (delivery.commune.length < 2 || delivery.address.length < 3 || !delivery.addressNumber) {
        return json({ error: "Completa la comuna y la dirección de entrega." }, 400);
      }
      if (!SHIPPING_CARRIER_NAMES[delivery.carrier]) {
        return json({ error: "Selecciona Starken, Chilexpress o Blue Express." }, 400);
      }
    }

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
      p_delivery: delivery,
    });
    const order = created?.[0];
    if (orderError || !order) throw orderError || new Error("No se pudo crear la orden.");
    const total = Number(order.created_total_clp);
    const orderId = order.created_order_id;

    const flow = await createFlowPayment({
      apiKey: config.apiKey,
      commerceOrder,
      subject: `Compra Nuité Perfumes (${items.length} producto${items.length === 1 ? "" : "s"} · ${method === "pickup" ? "retiro" : `envío por pagar vía ${SHIPPING_CARRIER_NAMES[delivery.carrier]}`})`,
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
