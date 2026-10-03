import nodemailer from "nodemailer";
import type { SupabaseClient } from "@supabase/supabase-js";
import { SHIPPING_CARRIER_NAMES } from "../../data/shipping";

type NotificationType = "customer_paid" | "merchant_paid";

type PaidOrder = {
  id: string;
  customer_email: string;
  customer_name: string | null;
  customer_phone: string | null;
  total_clp: number;
  products_total_clp: number;
  shipping_amount_clp: number;
  delivery_method: string;
  shipping_payment_mode: string;
  shipping_carrier: string | null;
  shipping_region: string | null;
  shipping_commune: string | null;
  shipping_address: string | null;
  shipping_address_number: string | null;
  shipping_address_extra: string | null;
  shipping_notes: string | null;
};

type OrderItem = {
  product_name: string;
  product_brand: string | null;
  quantity: number;
  subtotal_clp: number;
};

const money = (value: number) => new Intl.NumberFormat("es-CL", {
  style: "currency",
  currency: "CLP",
  maximumFractionDigits: 0,
}).format(Number(value || 0));

const escapeHtml = (value: unknown) => String(value ?? "")
  .replaceAll("&", "&amp;")
  .replaceAll("<", "&lt;")
  .replaceAll(">", "&gt;")
  .replaceAll('"', "&quot;")
  .replaceAll("'", "&#039;");

function getMailConfig() {
  const user = import.meta.env.SMTP_USER;
  const password = import.meta.env.SMTP_APP_PASSWORD;
  const merchantEmail = import.meta.env.ORDER_NOTIFICATION_EMAIL || user;
  if (!user || !password || !merchantEmail) return null;

  return {
    host: import.meta.env.SMTP_HOST || "smtp.gmail.com",
    port: Number(import.meta.env.SMTP_PORT || 465),
    secure: String(import.meta.env.SMTP_SECURE || "true") !== "false",
    user,
    password,
    merchantEmail,
    fromName: import.meta.env.SMTP_FROM_NAME || "Nuité Perfumes",
    adminUrl: import.meta.env.ORDER_ADMIN_URL || "https://nuite-admin.vercel.app/admin/pedidos",
  };
}

function deliveryDescription(order: PaidOrder) {
  if (order.delivery_method !== "shipping") return "Retiro coordinado en Río Bueno";
  if (order.shipping_payment_mode === "prepaid") {
    const price = Number(order.shipping_amount_clp) > 0 ? ` · ${money(order.shipping_amount_clp)} pagados` : " · sin costo";
    return `Reparto a domicilio en ${order.shipping_commune || "Río Bueno"}${price}`;
  }
  const carrier = order.shipping_carrier
    ? SHIPPING_CARRIER_NAMES[order.shipping_carrier] || order.shipping_carrier
    : "transportista por confirmar";
  return `Envío por pagar mediante ${carrier} a ${order.shipping_commune || "comuna por confirmar"}`;
}

function itemsHtml(items: OrderItem[]) {
  return items.map((item) => `
    <tr>
      <td style="padding:12px 0;border-bottom:1px solid #2b271c;color:#f4ead4">
        <strong>${escapeHtml(item.product_name)}</strong><br>
        <span style="color:#9d947f;font-size:13px">${escapeHtml(item.product_brand || "Nuité Perfumes")} · Cantidad: ${item.quantity}</span>
      </td>
      <td style="padding:12px 0;border-bottom:1px solid #2b271c;color:#efd06e;text-align:right;white-space:nowrap">${money(item.subtotal_clp)}</td>
    </tr>`).join("");
}

function emailShell(content: string) {
  return `<!doctype html><html lang="es"><body style="margin:0;background:#050505;color:#f4ead4;font-family:Arial,sans-serif">
    <div style="max-width:620px;margin:auto;padding:28px 16px">
      <div style="padding:24px;border:1px solid #4b3d16;border-radius:18px;background:#0d0c09">
        <div style="margin-bottom:22px;color:#efd06e;font-size:20px;font-weight:800">Nuité Perfumes</div>
        ${content}
      </div>
      <p style="color:#756e60;font-size:11px;text-align:center">Más que fragancias, momentos inolvidables.</p>
    </div>
  </body></html>`;
}

async function claimNotification(supabase: SupabaseClient, orderId: string, type: NotificationType) {
  const { data, error } = await supabase.rpc("claim_store_order_notification", {
    p_order_id: orderId,
    p_notification_type: type,
  });
  if (error) throw error;
  return data === true;
}

async function finishNotification(
  supabase: SupabaseClient,
  orderId: string,
  type: NotificationType,
  result: { messageId?: string; error?: string },
) {
  const sent = !result.error;
  const { error } = await supabase
    .from("store_order_notifications")
    .update({
      status: sent ? "sent" : "failed",
      provider_message_id: result.messageId || null,
      last_error: result.error?.slice(0, 500) || null,
      sent_at: sent ? new Date().toISOString() : null,
      updated_at: new Date().toISOString(),
    })
    .eq("order_id", orderId)
    .eq("notification_type", type);
  if (error) console.error("No se pudo guardar el resultado de la notificación.", error);
}

export async function sendPaidOrderNotifications(supabase: SupabaseClient, orderId: string, siteUrl: string) {
  const mail = getMailConfig();
  if (!mail) {
    console.info("Notificaciones por correo desactivadas: faltan SMTP_USER o SMTP_APP_PASSWORD.");
    return;
  }

  const [orderResult, itemsResult] = await Promise.all([
    supabase.from("store_orders").select([
      "id", "customer_email", "customer_name", "customer_phone", "total_clp", "products_total_clp",
      "shipping_amount_clp", "delivery_method", "shipping_payment_mode", "shipping_carrier",
      "shipping_region", "shipping_commune", "shipping_address", "shipping_address_number",
      "shipping_address_extra", "shipping_notes",
    ].join(",")).eq("id", orderId).maybeSingle(),
    supabase.from("store_order_items")
      .select("product_name,product_brand,quantity,subtotal_clp")
      .eq("order_id", orderId)
      .order("product_name"),
  ]);

  if (orderResult.error || !orderResult.data) throw orderResult.error || new Error("Pedido no encontrado para notificar.");
  if (itemsResult.error) throw itemsResult.error;
  const order = orderResult.data as PaidOrder;
  const items = (itemsResult.data || []) as OrderItem[];
  const orderCode = order.id.slice(0, 8).toUpperCase();
  const trackingUrl = `${siteUrl}/pago?orden=${encodeURIComponent(order.id)}`;
  const whatsappNumber = String(order.customer_phone || "").replace(/\D/g, "");
  const customerWhatsappUrl = whatsappNumber
    ? `https://wa.me/${whatsappNumber}?text=${encodeURIComponent(`Hola ${order.customer_name || ""}, recibimos tu compra Nuité. Tu pedido es ${orderCode}.`)}`
    : "";
  const supportUrl = `https://wa.me/56935226409?text=${encodeURIComponent(`Hola Nuité, necesito ayuda con mi pedido ${orderCode}`)}`;
  const transporter = nodemailer.createTransport({
    host: mail.host,
    port: mail.port,
    secure: mail.secure,
    auth: { user: mail.user, pass: mail.password },
    connectionTimeout: 5_000,
    greetingTimeout: 5_000,
    socketTimeout: 8_000,
  });
  const from = `"${mail.fromName.replaceAll('"', "")}" <${mail.user}>`;

  const send = async (type: NotificationType, message: Parameters<typeof transporter.sendMail>[0]) => {
    let claimed = false;
    try {
      claimed = await claimNotification(supabase, order.id, type);
      if (!claimed) return;
      const info = await transporter.sendMail(message);
      await finishNotification(supabase, order.id, type, { messageId: info.messageId });
    } catch (error) {
      const messageText = error instanceof Error ? error.message : "Error desconocido al enviar correo";
      if (claimed) await finishNotification(supabase, order.id, type, { error: messageText });
      console.error(`No se pudo enviar ${type}.`, error);
    }
  };

  await Promise.all([
    send("customer_paid", {
      from,
      to: order.customer_email,
      replyTo: mail.merchantEmail,
      subject: `Pago confirmado · Pedido ${orderCode}`,
      text: `Hola ${order.customer_name || ""}. Recibimos tu pago. Tu número de pedido es ${orderCode}. Total: ${money(order.total_clp)}. Sigue tu pedido en ${trackingUrl}`,
      html: emailShell(`
        <p style="margin:0;color:#efd06e;font-size:12px;font-weight:800;letter-spacing:.12em">PAGO CONFIRMADO</p>
        <h1 style="margin:8px 0 10px;font-size:28px">¡Recibimos tu compra!</h1>
        <p style="color:#b8ae99;line-height:1.55">Hola ${escapeHtml(order.customer_name || "")}. Guarda este número para consultar la preparación y entrega de tu pedido.</p>
        <div style="margin:20px 0;padding:18px;border-radius:13px;background:#17140d;text-align:center">
          <span style="display:block;color:#9d947f;font-size:11px">NÚMERO DE PEDIDO</span>
          <strong style="display:block;margin-top:5px;color:#efd06e;font-size:29px;letter-spacing:.08em">${orderCode}</strong>
        </div>
        <table style="width:100%;border-collapse:collapse">${itemsHtml(items)}</table>
        <p style="font-size:14px;color:#b8ae99">Entrega: <strong style="color:#f4ead4">${escapeHtml(deliveryDescription(order))}</strong></p>
        <p style="font-size:18px">Total pagado: <strong style="color:#efd06e">${money(order.total_clp)}</strong></p>
        <a href="${trackingUrl}" style="display:block;margin-top:22px;padding:15px;border-radius:11px;background:#d5ad39;color:#080603;font-weight:800;text-align:center;text-decoration:none">Ver seguimiento del pedido</a>
        <a href="${supportUrl}" style="display:block;margin-top:10px;color:#8fd6a2;text-align:center">Consultar por WhatsApp</a>`),
    }),
    send("merchant_paid", {
      from,
      to: mail.merchantEmail,
      replyTo: order.customer_email,
      subject: `Nueva compra pagada · ${orderCode} · ${money(order.total_clp)}`,
      text: `Nueva compra pagada. Pedido ${orderCode}. Cliente: ${order.customer_name}. Teléfono: ${order.customer_phone}. Total: ${money(order.total_clp)}. Gestionar: ${mail.adminUrl}`,
      html: emailShell(`
        <p style="margin:0;color:#efd06e;font-size:12px;font-weight:800;letter-spacing:.12em">NUEVO PEDIDO WEB</p>
        <h1 style="margin:8px 0 10px;font-size:28px">Pedido ${orderCode}</h1>
        <p style="color:#b8ae99;line-height:1.55">El pago fue confirmado por Flow. El pedido ya está listo para gestionarse.</p>
        <p><strong>Cliente:</strong> ${escapeHtml(order.customer_name)}<br><strong>Correo:</strong> ${escapeHtml(order.customer_email)}<br><strong>Teléfono:</strong> ${escapeHtml(order.customer_phone)}</p>
        <table style="width:100%;border-collapse:collapse">${itemsHtml(items)}</table>
        <p><strong>Entrega:</strong> ${escapeHtml(deliveryDescription(order))}</p>
        ${order.shipping_address ? `<p><strong>Dirección:</strong> ${escapeHtml(`${order.shipping_address} ${order.shipping_address_number || ""}${order.shipping_address_extra ? `, ${order.shipping_address_extra}` : ""}, ${order.shipping_commune || ""}, ${order.shipping_region || ""}`)}</p>` : ""}
        ${order.shipping_notes ? `<p><strong>Indicaciones:</strong> ${escapeHtml(order.shipping_notes)}</p>` : ""}
        <p style="font-size:18px">Total pagado: <strong style="color:#efd06e">${money(order.total_clp)}</strong></p>
        <a href="${mail.adminUrl}" style="display:block;margin-top:22px;padding:15px;border-radius:11px;background:#d5ad39;color:#080603;font-weight:800;text-align:center;text-decoration:none">Abrir Pedidos web</a>
        ${customerWhatsappUrl ? `<a href="${customerWhatsappUrl}" style="display:block;margin-top:10px;padding:13px;border:1px solid #245c35;border-radius:11px;color:#8fd6a2;text-align:center;text-decoration:none">Avisar al cliente por WhatsApp</a>` : ""}`),
    }),
  ]);

  transporter.close();
}
