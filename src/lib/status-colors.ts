import type { StatusCaso } from "@/lib/supabase/types";

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
