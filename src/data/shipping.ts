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
