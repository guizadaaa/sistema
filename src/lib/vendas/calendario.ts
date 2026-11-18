// Calendário de importações (Vendas → Importar). Puro: a página monta e os
// testes verificam. Dia útil vem de @/lib/feriados/dia-util.

import { ehDiaUtil, ehFimDeSemana, type Feriado } from "@/lib/feriados/dia-util";

export type StatusMarcador = "importou" | "atrasada" | "vazio";

/** Verde: importou naquele dia. Vermelho: dia útil já passado sem importação. Vazio: o resto. */
export function statusMarcador(dia: string, loja: string, hoje: string, importou: boolean, feriados: Feriado[]): StatusMarcador {
  if (importou) return "importou";
  if (dia < hoje && ehDiaUtil(dia, loja, feriados)) return "atrasada";
  return "vazio";
}

/** Semanas do mês (segunda a domingo); null = dia fora do mês. */
export function semanasDoMes(mes: string): (string | null)[][] {
  const [a, m] = mes.split("-").map(Number);
  const dias = new Date(Date.UTC(a, m, 0)).getUTCDate();
  const primeiro = (new Date(Date.UTC(a, m - 1, 1)).getUTCDay() + 6) % 7; // 0 = segunda
  const celulas: (string | null)[] = Array(primeiro).fill(null);
  for (let d = 1; d <= dias; d++) celulas.push(`${mes}-${String(d).padStart(2, "0")}`);
  while (celulas.length % 7) celulas.push(null);
  const semanas: (string | null)[][] = [];
  for (let i = 0; i < celulas.length; i += 7) semanas.push(celulas.slice(i, i + 7));
  return semanas;
}

export function mesAnterior(mes: string): string {
  const [a, m] = mes.split("-").map(Number);
  return m === 1 ? `${a - 1}-12` : `${a}-${String(m - 1).padStart(2, "0")}`;
}

export function mesSeguinte(mes: string): string {
  const [a, m] = mes.split("-").map(Number);
  return m === 12 ? `${a + 1}-01` : `${a}-${String(m + 1).padStart(2, "0")}`;
}

const NOMES_MES = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];

export function nomeMes(mes: string): string {
  const [a, m] = mes.split("-").map(Number);
  return `${NOMES_MES[m - 1]}/${a}`;
}

export type ResumoMes = {
  /** Dias úteis do mês sem contar feriados municipais (comum às lojas). */
  diasUteis: number;
  porLoja: { loja: string; emDia: number; esperados: number }[];
};

/**
 * Por loja: "em dia" = dias úteis (da loja) até hoje com importação; esperados
 * = dias úteis já passados + hoje, se hoje já houve importação.
 */
export function resumoDoMes(mes: string, lojas: string[], hoje: string, importouEm: (dia: string, loja: string) => boolean, feriados: Feriado[]): ResumoMes {
  const dias = semanasDoMes(mes).flat().filter((d): d is string => d !== null);
  const naoMunicipais = feriados.filter((f) => f.abrangencia !== "municipal");
  const diasUteis = dias.filter((d) => !ehFimDeSemana(d) && !naoMunicipais.some((f) => f.data === d)).length;
  return {
    diasUteis,
    porLoja: lojas.map((loja) => {
      const uteis = dias.filter((d) => ehDiaUtil(d, loja, feriados));
      const esperados = uteis.filter((d) => d < hoje || (d === hoje && importouEm(d, loja)));
      return { loja, esperados: esperados.length, emDia: esperados.filter((d) => importouEm(d, loja)).length };
    }),
  };
}
