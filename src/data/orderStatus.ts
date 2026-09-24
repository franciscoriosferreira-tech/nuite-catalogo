export const FULFILLMENT_STATUS_LABELS = {
  new: "Nuevo",
  preparing: "Preparando",
  ready_pickup: "Listo para retiro",
  shipped: "Enviado",
  delivered: "Entregado",
  cancelled: "Cancelado",
} as const;

export const PAYMENT_STATUS_LABELS: Record<string, string> = {
  pending: "Pago pendiente",
  paid: "Pagado",
  failed: "Pago fallido",
  review: "En revisión",
  cancelled: "Cancelado",
  refunded: "Reembolsado",
};

export type FulfillmentStatus = keyof typeof FULFILLMENT_STATUS_LABELS;
