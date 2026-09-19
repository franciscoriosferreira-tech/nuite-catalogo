import type { APIRoute } from "astro";
import { synchronizeFlowPayment } from "../../../lib/server/flow";

export const prerender = false;

export const POST: APIRoute = async ({ request }) => {
  try {
    const body = await request.formData();
    const token = String(body.get("token") || "");
    if (!token) return new Response("token requerido", { status: 400 });
    await synchronizeFlowPayment(token);
    return new Response("OK", { status: 200 });
  } catch (error) {
    console.error(error);
    return new Response("No fue posible confirmar la orden", { status: 500 });
  }
};

