// Produto da reserva pelo 1º dígito do Roteiro Systur (excursão), gravado em
// cliente_excursoes.categoria_codigo. Código desconhecido ou nulo = "Outros",
// que não aparece no filtro.

export const PRODUTOS = [
  { codigo: 2, rotulo: "Terrestre nacional" },
  { codigo: 3, rotulo: "Rodoaéreo" },
  { codigo: 4, rotulo: "Pacote exclusivo" },
  { codigo: 5, rotulo: "Aéreo nacional" },
  { codigo: 7, rotulo: "Rodoviário" },
  { codigo: 8, rotulo: "Cruzeiro" },
  { codigo: 9, rotulo: "Internacional" },
] as const;

export type CodigoProduto = (typeof PRODUTOS)[number]["codigo"];

export function isCodigoProduto(valor: number): valor is CodigoProduto {
  return PRODUTOS.some((p) => p.codigo === valor);
}

/** Rótulo do produto; desconhecido ou nulo = "Outros". */
export function rotuloProduto(codigo: number | null | undefined): string {
  return PRODUTOS.find((p) => p.codigo === codigo)?.rotulo ?? "Outros";
}
