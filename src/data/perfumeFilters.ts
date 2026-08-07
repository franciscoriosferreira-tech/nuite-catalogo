type PerfumeFilterRecord = Record<string, any>;

const FAMILIAS_AROMA: Record<string, string[]> = {
  dulce: [
    "dulce",
    "dulces",
    "gourmand",
    "vainilla",
    "avainillado",
    "avainillada",
    "avainillados",
    "avainilladas",
    "azucar",
    "azucarado",
    "azucarada",
    "caramelo",
    "praline",
    "malvavisco",
    "chocolate",
    "chocolatoso",
    "chocolatosa",
    "cacao",
    "cremoso",
    "cremosa",
    "tonka",
  ],
  amaderada: [
    "amaderado",
    "amaderada",
    "amaderados",
    "amaderadas",
    "madera",
    "maderas",
    "cedro",
    "sandalo",
    "vetiver",
    "pachuli",
    "patchouli",
    "oud",
    "cuero",
    "cashmere",
  ],
  citrica: [
    "citrico",
    "citrica",
    "citricos",
    "citricas",
    "limon",
    "bergamota",
    "mandarina",
    "naranja",
    "pomelo",
    "toronja",
  ],
  fresca: [
    "fresco",
    "fresca",
    "frescos",
    "frescas",
    "fresh",
    "menta",
    "acuatico",
    "acuatica",
    "acuaticos",
    "acuaticas",
    "marino",
    "marina",
    "verde",
    "verdes",
  ],
  floral: [
    "floral",
    "florales",
    "flor",
    "flores",
    "jazmin",
    "rosa",
    "rosas",
    "gardenia",
    "nardo",
    "orquidea",
    "ylang",
    "geranio",
    "frangipani",
    "violeta",
    "peonia",
  ],
  frutal: [
    "frutal",
    "frutales",
    "afrutado",
    "afrutada",
    "afrutados",
    "afrutadas",
    "fruta",
    "frutas",
    "manzana",
    "pera",
    "mango",
    "frutilla",
    "fresa",
    "cereza",
    "durazno",
    "pina",
    "coco",
    "tropical",
    "tropicales",
    "bayas",
    "grosella",
    "frambuesa",
    "lichi",
  ],
  especiada: [
    "especiado",
    "especiada",
    "especiados",
    "especiadas",
    "calido",
    "calida",
    "pimienta",
    "cardamomo",
    "canela",
    "jengibre",
    "azafran",
    "romero",
  ],
  oriental: [
    "oriental",
    "orientales",
    "ambar",
    "ambarado",
    "ambarada",
    "incienso",
    "resina",
    "benzoin",
    "benjui",
    "oud",
    "almizcle",
    "ladano",
  ],
};

export function normalizarTextoFiltro(valor: unknown) {
  return String(valor ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

export function coincideBusquedaPerfume(
  perfume: PerfumeFilterRecord,
  consulta: unknown,
) {
  const terminos = normalizarTextoFiltro(consulta).split(" ").filter(Boolean);
  if (terminos.length === 0) return true;

  const texto = normalizarTextoFiltro([
    perfume.nombre,
    perfume.marca,
    perfume.tipo_fragancia,
  ].join(" "));

  return terminos.every((termino) => texto.includes(termino));
}

export function coincideValorExacto(valor: unknown, filtro: unknown) {
  const filtroNormalizado = normalizarTextoFiltro(filtro);
  return !filtroNormalizado || normalizarTextoFiltro(valor) === filtroNormalizado;
}

export function coincideFamiliaAroma(
  perfume: PerfumeFilterRecord,
  familia: unknown,
) {
  const familiaNormalizada = normalizarTextoFiltro(familia);
  if (!familiaNormalizada) return true;

  const palabras = FAMILIAS_AROMA[familiaNormalizada] ?? [];
  if (palabras.length === 0) return false;

  // El tipo de fragancia es la clasificación principal del inventario.
  // Una nota aislada (por ejemplo, limón en un perfume oriental) no debe
  // cambiar la familia completa del producto.
  const texto = normalizarTextoFiltro(perfume.tipo_fragancia);
  const tokens = new Set(texto.split(" ").filter(Boolean));

  return palabras.some((palabra) => tokens.has(normalizarTextoFiltro(palabra)));
}
