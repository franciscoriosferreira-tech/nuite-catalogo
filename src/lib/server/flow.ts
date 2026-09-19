import { createHmac } from "node:crypto";
import { createClient } from "@supabase/supabase-js";

type FlowParams = Record<string, string | number>;

export function getServerConfig() {
  const supabaseUrl = import.meta.env.SUPABASE_URL;
  const serviceKey = import.meta.env.SUPABASE_SERVICE_ROLE_KEY;
  const apiKey = import.meta.env.FLOW_API_KEY;
  const secretKey = import.meta.env.FLOW_SECRET_KEY;
  const siteUrl = import.meta.env.PUBLIC_SITE_URL;
  const flowEnv = import.meta.env.FLOW_ENV === "production" ? "production" : "sandbox";

  if (!supabaseUrl || !serviceKey || !apiKey || !secretKey || !siteUrl) {
    throw new Error("El sistema de pago todavía no tiene configuradas todas sus variables de entorno.");
  }

  return {
    supabase: createClient(supabaseUrl, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    }),
    apiKey,
    secretKey,
    siteUrl: siteUrl.replace(/\/$/, ""),
    apiUrl: flowEnv === "production"
      ? "https://www.flow.cl/api"
      : "https://sandbox.flow.cl/api",
  };
}

export function signFlowParams(params: FlowParams, secretKey: string) {
  const value = Object.keys(params)
    .sort()
    .map((key) => `${key}${params[key]}`)
    .join("");

  return createHmac("sha256", secretKey).update(value).digest("hex");
}

async function readFlowResponse(response: Response) {
  const body = await response.text();
  if (!response.ok) {
    throw new Error(`Flow respondió ${response.status}: ${body.slice(0, 300)}`);
  }

  return JSON.parse(body);
}

export async function createFlowPayment(params: FlowParams) {
  const config = getServerConfig();
  const signed = { ...params, s: signFlowParams(params, config.secretKey) };
  const body = new URLSearchParams(
    Object.entries(signed).map(([key, value]) => [key, String(value)]),
  );

  const response = await fetch(`${config.apiUrl}/payment/create`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });

  return readFlowResponse(response);
}

export async function getFlowPaymentStatus(token: string) {
  const config = getServerConfig();
  const params = { apiKey: config.apiKey, token };
  const signed = { ...params, s: signFlowParams(params, config.secretKey) };
  const query = new URLSearchParams(signed).toString();
  const response = await fetch(`${config.apiUrl}/payment/getStatus?${query}`);
  return readFlowResponse(response);
}

export async function synchronizeFlowPayment(token: string) {
  const config = getServerConfig();
  const status = await getFlowPaymentStatus(token);
  const commerceOrder = String(status.commerceOrder || "");

  if (!commerceOrder) throw new Error("Flow no entregó el identificador de la orden.");

  const { data: order, error: orderError } = await config.supabase
    .from("store_orders")
    .select("id,commerce_order,total_clp,currency,status")
    .eq("commerce_order", commerceOrder)
    .maybeSingle();

  if (orderError || !order) throw new Error("La orden informada por Flow no existe.");

  const amountMatches = Number(status.amount) === Number(order.total_clp);
  const currencyMatches = String(status.currency) === order.currency;
  const paid = Number(status.status) === 2 && amountMatches && currencyMatches;

  await config.supabase.from("store_payment_events").insert({
    order_id: order.id,
    provider: "flow",
    provider_status: Number(status.status || 0),
    provider_token: token,
    payload: status,
  });

  if (paid) {
    const { error } = await config.supabase.rpc("confirm_store_order", {
      p_order_id: order.id,
      p_flow_status: Number(status.status),
      p_provider_payload: status,
    });
    if (error) throw error;
  } else if ([3, 4].includes(Number(status.status))) {
    const { error } = await config.supabase.rpc("release_store_order", {
      p_order_id: order.id,
      p_flow_status: Number(status.status),
      p_provider_payload: status,
    });
    if (error) throw error;
  } else {
    const nextStatus = Number(status.status) === 1 ? "pending" : "review";
    await config.supabase
      .from("store_orders")
      .update({ flow_status: Number(status.status || 0), status: nextStatus })
      .eq("id", order.id)
      .neq("status", "paid");
  }

  return { orderId: order.id, paid, providerStatus: Number(status.status || 0) };
}
