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

// Grau de prioridade: mesmo padrão dos status (fundo /15 + texto "-ink"),
// numa escala de risco verde-lima → amarelo → laranja → vermelho-rosado
// (tokens --prioridade-* em globals.css). O badge leva também a bandeira e o
// nome do grau — a cor nunca é o único sinal, nem para separar de status.
export const PRIORIDADE_BADGE_CLASSES: Record<GrauPrioridade, string> = {
  1: "border-transparent bg-prioridade-baixa/15 text-prioridade-baixa-ink",
  2: "border-transparent bg-prioridade-media/15 text-prioridade-media-ink",
  3: "border-transparent bg-prioridade-alta/15 text-prioridade-alta-ink",
  4: "border-transparent bg-prioridade-urgente/15 text-prioridade-urgente-ink",
};

// Texto na cor do grau (subtítulos "Urgente · 2" da página inicial).
export const PRIORIDADE_TEXTO_CLASSES: Record<GrauPrioridade, string> = {
  1: "text-prioridade-baixa-ink",
  2: "text-prioridade-media-ink",
  3: "text-prioridade-alta-ink",
  4: "text-prioridade-urgente-ink",
};

// Cartão de escolha da criação: só o selecionado ganha a borda na cor do grau e o fundo /10.
export const PRIORIDADE_CARTAO_SELECIONADO_CLASSES: Record<GrauPrioridade, string> = {
  1: "has-[:checked]:border-prioridade-baixa has-[:checked]:bg-prioridade-baixa/10",
  2: "has-[:checked]:border-prioridade-media has-[:checked]:bg-prioridade-media/10",
  3: "has-[:checked]:border-prioridade-alta has-[:checked]:bg-prioridade-alta/10",
  4: "has-[:checked]:border-prioridade-urgente has-[:checked]:bg-prioridade-urgente/10",
};

export const SEM_GRAU_BADGE_CLASSES = "border-dashed border-muted-foreground/40 bg-transparent text-muted-foreground";
