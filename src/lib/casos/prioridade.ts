// Grau de prioridade do caso (20261130000002). Única fonte dos rótulos,
// frases de ajuda e do parâmetro de URL `prioridade=` — tela de criação,
// detalhe, lista, filtro e página inicial usam daqui.

import type { GrauPrioridade } from "@/lib/supabase/types";

export type Prioridade = {
  grau: GrauPrioridade;
  /** Valor do parâmetro de URL `prioridade=`. */
  slug: "baixa" | "media" | "alta" | "urgente";
  nome: string;
  /** Frase de ajuda do campo na criação. */
  ajuda: string;
  /** Quem resolve. */
  quem: string;
};

/** Do mais leve ao mais grave (ordem do campo na criação). */
export const PRIORIDADES: readonly Prioridade[] = [
  { grau: 1, slug: "baixa", nome: "Baixa", ajuda: "Resolvo sozinho, sem prazo apertado", quem: "Vendedor" },
  { grau: 2, slug: "media", nome: "Média", ajuda: "Resolvo sozinho, mas tem data limite", quem: "Vendedor" },
  { grau: 3, slug: "alta", nome: "Alta", ajuda: "Preciso de apoio (negociação, aprovação, fornecedor)", quem: "Gerente/adm" },
  {
    grau: 4,
    slug: "urgente",
    nome: "Urgente",
    ajuda: "Preciso de apoio agora (embarque em até 72 h, cliente viajando, Procon/Reclame Aqui, valor alto)",
    quem: "Gerente/adm",
  },
];

/** Do mais grave ao mais leve (filtro, select do detalhe, agrupamento da página inicial). */
export const PRIORIDADES_DESC: readonly Prioridade[] = [...PRIORIDADES].reverse();

export const SEM_GRAU = "Sem grau";

export function isGrauPrioridade(v: unknown): v is GrauPrioridade {
  return v === 1 || v === 2 || v === 3 || v === 4;
}

export function prioridadeDoGrau(grau: GrauPrioridade): Prioridade {
  return PRIORIDADES[grau - 1];
}

export function nomePrioridade(grau: GrauPrioridade | null | undefined): string {
  return isGrauPrioridade(grau) ? prioridadeDoGrau(grau).nome : SEM_GRAU;
}

/** Grau a partir do texto de um formulário ("1".."4"); qualquer outra coisa = undefined. */
export function lerGrau(valor: unknown): GrauPrioridade | undefined {
  const n = typeof valor === "string" && /^[1-4]$/.test(valor) ? Number(valor) : undefined;
  return isGrauPrioridade(n) ? n : undefined;
}

/** Filtro de Acompanhar Casos: um grau ou "sem" (casos sem grau). */
export type PrioridadeFiltro = Prioridade["slug"] | "sem";

export function lerPrioridadeFiltro(valor: unknown): PrioridadeFiltro | undefined {
  if (valor === "sem") return "sem";
  return PRIORIDADES.find((p) => p.slug === valor)?.slug;
}

/** Grau do filtro; null = "Sem grau". */
export function grauDoFiltro(filtro: PrioridadeFiltro): GrauPrioridade | null {
  return filtro === "sem" ? null : (PRIORIDADES.find((p) => p.slug === filtro)?.grau ?? null);
}

export function rotuloFiltroPrioridade(filtro: PrioridadeFiltro): string {
  const grau = grauDoFiltro(filtro);
  return grau === null ? SEM_GRAU : prioridadeDoGrau(grau).nome;
}

/** Mais grave primeiro; sem grau por último. */
export function compararPrioridade(a: GrauPrioridade | null, b: GrauPrioridade | null): number {
  return (b ?? 0) - (a ?? 0);
}
