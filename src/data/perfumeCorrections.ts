export const PERFUME_PUBLIC_FIELDS =
  "id,slug,nombre,marca,ml,precio,precio_sugerido,stock,genero,tipo_fragancia,descripcion,imagen_url,imagen_local,notas";

const correccionesPerfumes = {
  "64c15ab0-cb45-4953-8bbf-89a1371a49a9": {
    tipo_fragancia: "Aromático especiado",
    notas: {
      salida: "Bergamota, cardamomo, manzana",
      corazon: "Lavanda, tabaco, geranio",
      fondo: "Cuero, haba tonka, pachulí, vetiver",
    },
  },
  "01066a96-de38-4c3d-99b0-c0adc4fecfd2": {
    tipo_fragancia: "Dulce gourmand",
    notas: {
      salida: "Limón, frutilla",
      corazon: "Azúcar batida, sugarberry, frangipani",
      fondo: "Vainilla en grano, almizcle, ámbar",
    },
  },
  "06fe8a3f-ee6f-47e5-9b42-a7e8a0148918": {
    tipo_fragancia: "Dulce gourmand",
    notas: {
      salida:
        "Vainilla, pera, malvavisco, ron, hojas de violeta, ylang-ylang",
      corazon: "Chicle, jellybean, caramelo, jazmín, ládano",
      fondo:
        "Azúcar, pachulí, haba tonka, madera de cachemira, sándalo, vetiver",
    },
  },
};

export function normalizarNotasPerfume(valor: unknown) {
  if (!valor) return {};
  if (typeof valor === "object") return valor;

  try {
    return JSON.parse(String(valor));
  } catch {
    return {};
  }
}

export function aplicarCorreccionPerfume(perfume: Record<string, any>) {
  const correccion =
    correccionesPerfumes[perfume?.id as keyof typeof correccionesPerfumes];

  if (!correccion) return perfume;

  return {
    ...perfume,
    ...correccion,
    notas: {
      ...normalizarNotasPerfume(perfume.notas),
      ...correccion.notas,
    },
  };
}
