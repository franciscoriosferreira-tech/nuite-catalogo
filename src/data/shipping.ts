export const CHILE_REGIONS = [
  "Arica y Parinacota",
  "Tarapacá",
  "Antofagasta",
  "Atacama",
  "Coquimbo",
  "Valparaíso",
  "Metropolitana de Santiago",
  "O’Higgins",
  "Maule",
  "Ñuble",
  "Biobío",
  "La Araucanía",
  "Los Ríos",
  "Los Lagos",
  "Aysén",
  "Magallanes y de la Antártica Chilena",
] as const;

export const SHIPPING_CARRIERS = [
  { id: "starken", name: "Starken" },
  { id: "chilexpress", name: "Chilexpress" },
  { id: "bluex", name: "Blue Express" },
] as const;

export const SHIPPING_CARRIER_NAMES = Object.fromEntries(
  SHIPPING_CARRIERS.map((carrier) => [carrier.id, carrier.name]),
) as Record<string, string>;

export const SHIPPING_CARRIER_TRACKING_PAGES = {
  starken: "https://www.starken.cl/seguimiento",
  chilexpress: "https://www.chilexpress.cl/Views/ServicioAlCliente/EstadoEnvios.aspx",
  bluex: "https://www.blue.cl/emprendedores/seguimiento",
} as const;

export function getShippingTrackingUrl(
  carrier: string | null | undefined,
  trackingNumber: string | null | undefined,
  savedUrl?: string | null,
) {
  if (typeof savedUrl === "string" && savedUrl.startsWith("https://")) return savedUrl;
  if (!carrier || !(carrier in SHIPPING_CARRIER_TRACKING_PAGES)) return "";

  const baseUrl = SHIPPING_CARRIER_TRACKING_PAGES[
    carrier as keyof typeof SHIPPING_CARRIER_TRACKING_PAGES
  ];

  if (carrier === "starken" && trackingNumber) {
    return `${baseUrl}?codigo=${encodeURIComponent(trackingNumber.trim())}`;
  }

  return baseUrl;
}
