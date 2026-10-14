// Utilitários de mês da tela Cliques — sem "server-only", testáveis.
// Mês sempre como "YYYY-MM-01" (primeiro dia), no fuso de São Paulo.

const FUSO = "America/Sao_Paulo";

/** Primeiro dia do mês corrente em São Paulo ("2026-10-01"). */
export function mesAtualSaoPaulo(agora: Date = new Date()): string {
  const partes = new Intl.DateTimeFormat("en-CA", { timeZone: FUSO, year: "numeric", month: "2-digit" }).formatToParts(agora);
  const ano = partes.find((p) => p.type === "year")?.value;
  const mes = partes.find((p) => p.type === "month")?.value;
  return `${ano}-${mes}-01`;
}

/**
 * Mês pedido na URL (?mes=2026-09) só vale se for o atual ou um mês com
 * registro de cliques; qualquer outra coisa cai no mês atual.
 */
export function resolverMes(parametro: unknown, disponiveis: string[], atual: string): string {
  if (typeof parametro !== "string" || !/^\d{4}-\d{2}$/.test(parametro)) return atual;
  const pedido = `${parametro}-01`;
  return pedido === atual || disponiveis.includes(pedido) ? pedido : atual;
}

/** Opções do seletor: o mês atual sempre, mais os meses com registro, do mais recente ao mais antigo. */
export function opcoesDeMes(disponiveis: string[], atual: string): string[] {
  return [...new Set([atual, ...disponiveis])].sort().reverse();
}

/** "2026-10-01" -> "outubro de 2026". */
export function rotuloMes(mes: string): string {
  const [ano, m] = mes.split("-").map(Number);
  return new Date(Date.UTC(ano, m - 1, 15)).toLocaleDateString("pt-BR", { month: "long", year: "numeric", timeZone: "UTC" });
}

/** "2026-10-01" -> "2026-10" (valor do parâmetro de URL). */
export function parametroMes(mes: string): string {
  return mes.slice(0, 7);
}

/** Hora "HH:MM" em São Paulo. */
export function horaSaoPaulo(iso: string): string {
  return new Date(iso).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", timeZone: FUSO });
}

/** Data + hora em São Paulo ("14/10 às 09:05"). */
export function dataHoraSaoPaulo(iso: string): string {
  const d = new Date(iso);
  const data = d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", timeZone: FUSO });
  return `${data} às ${horaSaoPaulo(iso)}`;
}

export const LIMITE_SINCRONIZACAO_ATRASADA_MS = 3 * 60 * 60 * 1000;

export function sincronizacaoAtrasada(ultima: string | null, agora: Date = new Date()): boolean {
  if (!ultima) return true;
  return agora.getTime() - new Date(ultima).getTime() > LIMITE_SINCRONIZACAO_ATRASADA_MS;
}
