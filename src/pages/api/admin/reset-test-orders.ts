import type { APIRoute } from "astro";
import { createHash, timingSafeEqual } from "node:crypto";
import { getServerConfig } from "../../../lib/server/flow";

export const prerender = false;

const RESET_TOKEN_HASH = "a43b09a16118876b1540a447e74c1f3e6bb6f1b575177b24caa17bb927c9a63d";
const RESET_ORDER_IDS = [
  "b63b1348-de58-4b59-a88d-3dc5bb9b714f",
  "75d65373-2226-45f7-9d24-40a679d68de4",
  "6c70295b-7928-40bd-bcb4-3cdb3f775fb6",
  "0d4a19cd-9877-4058-ae7e-b5b88bad8447",
  "2bf29552-7cbb-4160-90ac-e58c0c544eb7",
  "a1be4e19-f1ef-4ad3-bc33-564e260536d9",
  "fc0234de-fe65-44bb-8d94-91d03ba38f11",
  "7a4bcaab-3dee-4505-9e60-c1147c79d7b8",
  "24ca6c50-0ed1-4076-890e-f3bc897d4770",
  "ed176f0a-b621-444a-b6a2-9e0d67f45088",
];

const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), {
  status,
  headers: {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
  },
});

function validToken(value: string) {
  const received = Buffer.from(createHash("sha256").update(value).digest("hex"));
  const expected = Buffer.from(RESET_TOKEN_HASH);
  return received.length === expected.length && timingSafeEqual(received, expected);
}

export const POST: APIRoute = async ({ request }) => {
  const token = request.headers.get("x-reset-token") || "";
  if (!validToken(token)) return json({ error: "No autorizado." }, 401);

  try {
    const { supabase } = getServerConfig();
    const { data: orders, error: ordersError } = await supabase
      .from("store_orders")
      .select("id,status,flow_status,fulfillment_status,reservation_released,stock_restored_at")
      .in("id", RESET_ORDER_IDS);

    if (ordersError) throw ordersError;

    let restoredPaidOrders = 0;
    let releasedReservations = 0;

    for (const order of orders || []) {
      if (order.status === "paid" && order.fulfillment_status !== "cancelled" && !order.stock_restored_at) {
        const { error } = await supabase.rpc("admin_update_store_order", {
          p_order_id: order.id,
          p_fulfillment_status: "cancelled",
        });
        if (error) throw error;
        restoredPaidOrders += 1;
      } else if (order.status !== "paid" && !order.reservation_released) {
        const { error } = await supabase.rpc("release_store_order", {
          p_order_id: order.id,
          p_flow_status: Number(order.flow_status || -1),
          p_provider_payload: { reason: "reset-test-orders" },
        });
        if (error) throw error;
        releasedReservations += 1;
      }
    }

    const { error: eventsError } = await supabase
      .from("store_payment_events")
      .delete()
      .in("order_id", RESET_ORDER_IDS);
    if (eventsError) throw eventsError;

    const { error: itemsError } = await supabase
      .from("store_order_items")
      .delete()
      .in("order_id", RESET_ORDER_IDS);
    if (itemsError) throw itemsError;

    const { error: deleteError } = await supabase
      .from("store_orders")
      .delete()
      .in("id", RESET_ORDER_IDS);
    if (deleteError) throw deleteError;

    const { count, error: countError } = await supabase
      .from("store_orders")
      .select("id", { count: "exact", head: true })
      .in("id", RESET_ORDER_IDS);
    if (countError) throw countError;

    return json({
      deletedOrders: (orders || []).length,
      restoredPaidOrders,
      releasedReservations,
      remainingAuthorizedOrders: count || 0,
    });
  } catch (error) {
    console.error(error);
    return json({ error: "No fue posible reiniciar los pedidos web." }, 500);
  }
};
