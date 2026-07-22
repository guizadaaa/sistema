/** Formatadores compartilhados entre páginas e relatórios exportados (PDF/Excel). */

export function formatarMoeda(valor: number): string {
  return valor.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export function formatarDataBr(data: string): string {
  return new Date(`${data}T00:00:00`).toLocaleDateString("pt-BR");
}

/** dias fracionários (ex.: saída de uma média) → texto — não confundir com formatarDuracaoEmDias (@/lib/casos/duracao), que parseia interval do Postgres. */
export function formatarDias(dias: number | null): string {
  if (dias === null) return "—";
  if (dias < 1) return "Menos de 1 dia";
  const inteiro = Math.round(dias);
  return inteiro === 1 ? "1 dia" : `${inteiro} dias`;
}
