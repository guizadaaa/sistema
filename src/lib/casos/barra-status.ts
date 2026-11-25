// Barra "Casos por status" de Acompanhar Casos. Puro: a página monta e os
// testes verificam.

import { STATUS_ORDEM } from "@/lib/casos/status";
import type { FilialCvc, StatusCaso, TipoCaso } from "@/lib/supabase/types";

export type FiltrosTelaCasos = {
  status?: StatusCaso;
  tipo?: TipoCaso;
  filial?: FilialCvc;
  vendedor?: string;
  busca?: string;
  dataInicio?: string;
  dataFim?: string;
  mostrarTeste?: boolean;
  prazo?: "vencido";
};

/** URL da lista com os filtros atuais e a mudança pedida (undefined remove o filtro). */
export function urlCasos(filtros: FiltrosTelaCasos, mudanca: Partial<FiltrosTelaCasos> = {}): string {
  const f = { ...filtros, ...mudanca };
  const q = new URLSearchParams();
  if (f.busca) q.set("busca", f.busca);
  if (f.status) q.set("status", f.status);
  if (f.tipo) q.set("tipo", f.tipo);
  if (f.filial) q.set("filial", f.filial);
  if (f.vendedor) q.set("vendedor", f.vendedor);
  if (f.dataInicio) q.set("dataInicio", f.dataInicio);
  if (f.dataFim) q.set("dataFim", f.dataFim);
  if (f.mostrarTeste) q.set("mostrarTeste", "1");
  if (f.prazo) q.set("prazo", f.prazo);
  const s = q.toString();
  return s ? `/casos?${s}` : "/casos";
}

export type Segmento = { status: StatusCaso; quantidade: number; percentual: number };

/** Um pedaço por status, sempre na ordem da lista (zerados inclusive); % arredondado. */
export function segmentosStatus(porStatus: Record<StatusCaso, number>): Segmento[] {
  const total = STATUS_ORDEM.reduce((soma, s) => soma + (porStatus[s] ?? 0), 0);
  return STATUS_ORDEM.map((status) => {
    const quantidade = porStatus[status] ?? 0;
    return { status, quantidade, percentual: total ? Math.round((quantidade / total) * 100) : 0 };
  });
}

/** Clicar na etiqueta: aplica o status; clicar de novo no já selecionado volta para "Todos". */
export function statusAoClicar(atual: StatusCaso | undefined, clicado: StatusCaso): StatusCaso | undefined {
  return atual === clicado ? undefined : clicado;
}

export function plural(n: number, um: string, varios: string): string {
  return `${n} ${n === 1 ? um : varios}`;
}
