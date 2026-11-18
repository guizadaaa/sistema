// Calendário de importações (Vendas → Importar). Puro: a página monta e os
// testes verificam. Dia útil vem de @/lib/feriados/dia-util.

import { ehDiaUtil, ehFimDeSemana, type Feriado } from "@/lib/feriados/dia-util";

export type StatusMarcador = "importou" | "reconstruido" | "presumido" | "atrasada" | "vazio" | "antes";

/**
 * Marcos da loja (vendas_calendario_historico). Datas YYYY-MM-DD.
 * - primeiraImportacao: antes dela nada é cobrado (cinza).
 * - inicioRegistro: início do registro diário (vendas_importacoes, PR #62);
 *   antes dele os dias úteis ficam verdes "presumido".
 * - diasReconstruidos: dias até inicioRegistro (inclusive) em que a loja
 *   gravou venda nova — importação real reconstruída por importado_em.
 */
export type HistoricoLoja = {
  primeiraImportacao: string | null;
  inicioRegistro: string | null;
  diasReconstruidos: string[];
};

/** A partir de que dia a loja é cobrada: "" = sempre (sem histórico); null = ainda não é. */
export function cobrancaDesde(historico: HistoricoLoja | undefined): string | null {
  if (!historico) return "";
  const { primeiraImportacao: p, inicioRegistro: r } = historico;
  if (!p || !r) return null;
  return p > r ? p : r;
}

/**
 * Verde: importou naquele dia. Vermelho: dia útil já passado sem importação.
 * Sem histórico (undefined): só essa regra. Com histórico: cinza ("antes")
 * antes da primeira importação da loja; verde "presumido" nos dias úteis
 * entre ela e o início do registro diário ("reconstruido" quando a venda
 * gravada mostra a importação real); depois, a regra de sempre.
 */
export function statusMarcador(
  dia: string,
  loja: string,
  hoje: string,
  importou: boolean,
  feriados: Feriado[],
  historico?: HistoricoLoja
): StatusMarcador {
  if (importou) return "importou";
  if (historico) {
    const { primeiraImportacao: p, inicioRegistro: r, diasReconstruidos } = historico;
    if (!p || dia < p) return "antes";
    if ((!r || dia <= r) && diasReconstruidos.includes(dia)) return "reconstruido";
    if (!r || dia < r) return dia < hoje && ehDiaUtil(dia, loja, feriados) ? "presumido" : "vazio";
  }
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
 * = dias úteis já passados + hoje, se hoje já houve importação. Com histórico,
 * só conta a partir de cobrancaDesde (início do registro diário ou primeira
 * importação, o que vier depois): dias presumidos ficam fora de X e de Y.
 */
export function resumoDoMes(
  mes: string,
  lojas: string[],
  hoje: string,
  importouEm: (dia: string, loja: string) => boolean,
  feriados: Feriado[],
  historicoDe: (loja: string) => HistoricoLoja | undefined = () => undefined
): ResumoMes {
  const dias = semanasDoMes(mes).flat().filter((d): d is string => d !== null);
  const naoMunicipais = feriados.filter((f) => f.abrangencia !== "municipal");
  const diasUteis = dias.filter((d) => !ehFimDeSemana(d) && !naoMunicipais.some((f) => f.data === d)).length;
  return {
    diasUteis,
    porLoja: lojas.map((loja) => {
      const historico = historicoDe(loja);
      const desde = cobrancaDesde(historico);
      if (desde === null) return { loja, esperados: 0, emDia: 0 };
      const emDia = (d: string) => {
        const status = statusMarcador(d, loja, hoje, importouEm(d, loja), feriados, historico);
        return status === "importou" || status === "reconstruido";
      };
      const uteis = dias.filter((d) => d >= desde && ehDiaUtil(d, loja, feriados));
      const esperados = uteis.filter((d) => d < hoje || (d === hoje && emDia(d)));
      return { loja, esperados: esperados.length, emDia: esperados.filter(emDia).length };
    }),
  };
}
