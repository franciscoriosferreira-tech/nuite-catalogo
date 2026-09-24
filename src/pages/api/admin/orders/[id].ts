import type { APIRoute } from "astro";
import { FULFILLMENT_STATUS_LABELS, type FulfillmentStatus } from "../../../../data/orderStatus";
import { adminUnauthorized, isAdminAuthorized, isSameOriginRequest } from "../../../../lib/server/admin";
import { getServerConfig } from "../../../../lib/server/flow";

export const prerender = false;

export const POST: APIRoute = async ({ request, params, redirect }) => {
  if (!isAdminAuthorized(request)) return adminUnauthorized();
  if (!isSameOriginRequest(request)) return new Response("Origen no permitido.", { status: 403 });

  const orderId = String(params.id || "");
  if (!/^[0-9a-f-]{36}$/i.test(orderId)) return new Response("Orden no válida.", { status: 400 });

  const data = await request.formData();
  const nextStatus = String(data.get("fulfillmentStatus") || "") as FulfillmentStatus;
  if (!(nextStatus in FULFILLMENT_STATUS_LABELS)) {
    return new Response("Estado no válido.", { status: 400 });
  }

  const config = getServerConfig();
  const { error } = await config.supabase.rpc("admin_update_store_order", {
    p_order_id: orderId,
    p_fulfillment_status: nextStatus,
  });

  if (error) {
    console.error(error);
    return redirect(`/gestion/pedidos?error=${encodeURIComponent(error.message)}`, 303);
  }

  return redirect(`/gestion/pedidos?actualizada=${encodeURIComponent(orderId.slice(0, 8).toUpperCase())}`, 303);
};
