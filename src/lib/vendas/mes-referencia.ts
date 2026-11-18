// Período padrão da tela Vendas (puro: página e testes).
// Mês de referência de cada filial = mês da data "vendas até" da última
// importação dela; período = do dia 1º desse mês até essa data. Período
// escolhido pelo usuário sempre vence.

import { diaUtilAnterior, type Feriado } from "@/lib/feriados/dia-util";

import { nomeMes } from "./calendario";

export type ReferenciaLoja = { loja: string; ate: string | null; importadoEm: string | null };
export type PeriodoLoja = { filial: string; de: string; ate: string };

const MESES_MIN = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];

function diaMes(data: string) {
  return `${data.slice(8, 10)}/${data.slice(5, 7)}`;
}

function dataBr(data: string) {
  return `${data.slice(8, 10)}/${data.slice(5, 7)}/${data.slice(0, 4)}`;
}

function quando(iso: string) {
  return new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })
    .format(new Date(iso))
    .replace(",", "");
}

/** "vendas até 17/11" -> 01/11 a 17/11. */
export function periodoDaReferencia(ate: string): { de: string; ate: string } {
  return { de: `${ate.slice(0, 7)}-01`, ate };
}

export type PeriodoVendas = {
  periodos: PeriodoLoja[];
  /** Texto acima do resumo. */
  rotulo: string;
  /** Lojas com destaque (importação atrasada ou ainda no mês anterior). */
  alertas: string[];
  manual: boolean;
};

/**
 * Períodos por filial e rótulo. `lojas` = lojas mostradas (uma, ou todas as
 * visíveis em "Todas"). Período manual (de/até) vale para todas elas.
 */
export function montarPeriodoVendas(opts: {
  lojas: string[];
  referencias: ReferenciaLoja[];
  hoje: string;
  feriados: Feriado[];
  dataInicio?: string;
  dataFim?: string;
}): PeriodoVendas {
  const { lojas, referencias, hoje, feriados, dataInicio, dataFim } = opts;

  if (dataInicio || dataFim) {
    const de = dataInicio ?? "0001-01-01";
    const ate = dataFim ?? "9999-12-31";
    const rotulo = dataInicio && dataFim
      ? `Período escolhido: ${dataBr(dataInicio)} a ${dataBr(dataFim)}`
      : dataInicio ? `Período escolhido: a partir de ${dataBr(dataInicio)}` : `Período escolhido: até ${dataBr(dataFim!)}`;
    return { periodos: lojas.map((filial) => ({ filial, de, ate })), rotulo, alertas: [], manual: true };
  }

  const refs = lojas.map((loja) => referencias.find((r) => r.loja === loja) ?? { loja, ate: null, importadoEm: null });
  const comImportacao = refs.filter((r): r is ReferenciaLoja & { ate: string } => r.ate !== null);
  const periodos = comImportacao.map((r) => ({ filial: r.loja, ...periodoDaReferencia(r.ate) }));

  if (comImportacao.length === 0) {
    return { periodos: [], rotulo: "Nenhuma importação de vendas ainda.", alertas: [], manual: false };
  }

  const mesTitulo = comImportacao.map((r) => r.ate.slice(0, 7)).sort().at(-1)!;
  const alertas: string[] = [];
  const situacao = (r: ReferenciaLoja) => {
    if (!r.ate) return " — sem importação";
    if (r.ate.slice(0, 7) < mesTitulo) return ` — sem importação em ${MESES_MIN[Number(mesTitulo.slice(5, 7)) - 1]}`;
    const esperado = diaUtilAnterior(hoje, r.loja, feriados);
    if (r.ate < esperado) return ` — importação atrasada (esperado até ${diaMes(esperado)})`;
    return "";
  };

  if (lojas.length === 1) {
    const r = refs[0];
    const extra = situacao(r);
    if (extra) alertas.push(r.loja);
    const importacao = r.importadoEm ? ` (importação de ${quando(r.importadoEm)})` : "";
    return { periodos, rotulo: `${nomeMes(mesTitulo)} · vendas até ${diaMes(r.ate!)}${importacao}${extra}`, alertas, manual: false };
  }

  const partes = refs.map((r) => {
    const extra = situacao(r);
    if (extra) alertas.push(r.loja);
    return r.ate ? `${r.loja} até ${diaMes(r.ate)}${extra}` : `${r.loja}${extra}`;
  });
  return { periodos, rotulo: [nomeMes(mesTitulo), ...partes].join(" · "), alertas, manual: false };
}
