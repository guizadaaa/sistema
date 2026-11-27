import type { GrauPrioridade, StatusCaso } from "@/lib/supabase/types";

// Fundo suave (mesma matiz, baixa opacidade) + texto na variante "-ink"
// (ver globals.css) — cada status sempre com a mesma cor em toda a UI, para
// reconhecimento rápido. A cor nunca é o único sinal: o rótulo do status
// acompanha o badge em todo lugar que ele aparece.
export const STATUS_BADGE_CLASSES: Record<StatusCaso, string> = {
  inicial: "border-transparent bg-status-inicial/15 text-status-inicial-ink",
  recepcionado: "border-transparent bg-status-recepcionado/15 text-status-recepcionado-ink",
  em_andamento_interno: "border-transparent bg-status-em-andamento-interno/15 text-status-em-andamento-interno-ink",
  reavaliacao: "border-transparent bg-status-reavaliacao/15 text-status-reavaliacao-ink",
  resolvido: "border-transparent bg-status-resolvido/15 text-status-resolvido-ink",
  ouvidoria: "border-transparent bg-status-ouvidoria/15 text-status-ouvidoria-ink",
};

// Indicador da Linha do Tempo — mesma matiz do badge, cor cheia só na etapa
// atual (sincronizada com o badge do protocolo); etapas já superadas usam a
// mesma cor "apagada" (baixa opacidade), indicando que já passaram.
export const STATUS_DOT_ATUAL: Record<StatusCaso, string> = {
  inicial: "bg-status-inicial",
  recepcionado: "bg-status-recepcionado",
  em_andamento_interno: "bg-status-em-andamento-interno",
  reavaliacao: "bg-status-reavaliacao",
  resolvido: "bg-status-resolvido",
  ouvidoria: "bg-status-ouvidoria",
};

export const STATUS_DOT_PASSADO: Record<StatusCaso, string> = {
  inicial: "bg-status-inicial/35",
  recepcionado: "bg-status-recepcionado/35",
  em_andamento_interno: "bg-status-em-andamento-interno/35",
  reavaliacao: "bg-status-reavaliacao/35",
  resolvido: "bg-status-resolvido/35",
  ouvidoria: "bg-status-ouvidoria/35",
};

// Número da tabela "Casos por status" (página inicial): só o texto na cor do status.
export const STATUS_TEXTO_CLASSES: Record<StatusCaso, string> = {
  inicial: "text-status-inicial-ink",
  recepcionado: "text-status-recepcionado-ink",
  em_andamento_interno: "text-status-em-andamento-interno-ink",
  reavaliacao: "text-status-reavaliacao-ink",
  resolvido: "text-status-resolvido-ink",
  ouvidoria: "text-status-ouvidoria-ink",
};

// Grau de prioridade: preenchimento sólido (os badges de status são suaves)
// e claridades bem distintas — Baixa clara, Alta média-clara, Média escura,
// Urgente a mais escura —, para não depender só da matiz. O nome do grau
// sempre acompanha o badge.
export const PRIORIDADE_BADGE_CLASSES: Record<GrauPrioridade, string> = {
  1: "border-slate-300 bg-slate-100 text-slate-700 dark:border-slate-500 dark:bg-slate-700 dark:text-slate-100",
  2: "border-transparent bg-blue-600 text-white dark:bg-blue-500",
  3: "border-transparent bg-orange-400 text-orange-950",
  4: "border-transparent bg-red-700 text-white dark:bg-red-600",
};

export const SEM_GRAU_BADGE_CLASSES = "border-dashed border-muted-foreground/40 bg-transparent text-muted-foreground";
