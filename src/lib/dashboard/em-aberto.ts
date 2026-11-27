// Card "Casos em aberto" da página inicial (por grau / por tempo parado).
// Puro: a página monta e os testes verificam.

import { isGrauPrioridade, nomePrioridade } from "@/lib/casos/prioridade";
import type { FilialCvc, GrauPrioridade, StatusCaso } from "@/lib/supabase/types";

export type ModoEmAberto = "grau" | "parado";

export const MODO_EM_ABERTO_PADRAO: ModoEmAberto = "grau";

export type CasoEmAberto = {
  id: string;
  protocolo: number;
  clienteNome: string;
  statusAtual: StatusCaso;
  filial: FilialCvc;
  prioridade: GrauPrioridade | null;
  /** Quando entrou na etapa atual. */
  entrouEm: string;
  /** Casos em aberto (que quem vê enxerga) com o mesmo grau. */
  totalGrau: number;
};

export type GrupoGrau<T extends CasoEmAberto = CasoEmAberto> = {
  /** "sem" para os casos sem grau. */
  chave: GrauPrioridade | "sem";
  /** Ex.: "Urgente · 2". */
  rotulo: string;
  casos: T[];
};

/**
 * Agrupa a lista "por grau" (já vem ordenada do banco: Urgente → Sem grau,
 * mais parado primeiro) em blocos consecutivos do mesmo grau. A quantidade
 * do subtítulo é o total de casos em aberto do grau, não só os que cabem
 * no card.
 */
export function gruposPorGrau<T extends CasoEmAberto>(casos: T[]): GrupoGrau<T>[] {
  const grupos: GrupoGrau<T>[] = [];
  for (const caso of casos) {
    const chave = isGrauPrioridade(caso.prioridade) ? caso.prioridade : "sem";
    const ultimo = grupos.at(-1);
    if (ultimo && ultimo.chave === chave) {
      ultimo.casos.push(caso);
    } else {
      grupos.push({ chave, rotulo: `${nomePrioridade(caso.prioridade)} · ${caso.totalGrau}`, casos: [caso] });
    }
  }
  return grupos;
}

/** "Ver todos →": a lista de Acompanhar Casos na mesma ordem do card. */
export function hrefVerTodos(modo: ModoEmAberto): string {
  return modo === "grau" ? "/casos?aberto=1&ordem=prioridade" : "/casos?aberto=1&ordem=parado";
}

export function lerModoEmAberto(valor: unknown): ModoEmAberto | undefined {
  return valor === "grau" || valor === "parado" ? valor : undefined;
}
