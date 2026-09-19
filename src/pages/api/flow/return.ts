import type { APIRoute } from "astro";
import { synchronizeFlowPayment } from "../../../lib/server/flow";

export const prerender = false;

export const POST: APIRoute = async ({ request, redirect }) => {
  try {
    const body = await request.formData();
    const token = String(body.get("token") || "");
    if (!token) return redirect("/pago?estado=error", 303);
    const result = await synchronizeFlowPayment(token);
    return redirect(`/pago?orden=${encodeURIComponent(result.orderId)}`, 303);
  } catch (error) {
    console.error(error);
    return redirect("/pago?estado=error", 303);
  }
};

