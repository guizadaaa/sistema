import "server-only";

import type { StatusCaso } from "@/lib/supabase/types";

/**
 * Paleta espelhando o modo claro de src/app/globals.css — pdfkit/exceljs
 * rodam em Node, sem acesso às custom properties do CSS, então os hex aqui
 * precisam ser mantidos manualmente em sincronia com aquele arquivo (mesma
 * obrigação que já existe entre globals.css e status-colors.ts/
 * prazo-colors.ts; esta é a terceira representação da mesma paleta).
 *
 * accent reaproveita --chart-1 (light) — os tokens semânticos (--primary
 * etc.) são neutros de propósito no modo claro; --chart-1 é o único tom
 * saturado já pensado pra destacar dado em cima de fundo branco.
 */
export const REPORT_COLORS = {
  accent: "#f54900",
  foreground: "#0a0a0a",
  mutedForeground: "#737373",
  border: "#e5e5e5",
  headerText: "#ffffff",
} as const;

/** bg = mesmo tom de "bg-status-x/15" (15% sobre branco); ink = "-ink", usado como texto do badge. */
export const STATUS_HEX: Record<StatusCaso, { bg: string; ink: string }> = {
  inicial: { bg: "#ddf3eb", ink: "#0f7a55" },
  recepcionado: { bg: "#fce8e1", ink: "#b8491e" },
  em_andamento_interno: { bg: "#e4e1f2", ink: "#30266d" },
  reavaliacao: { bg: "#fcebf1", ink: "#a83865" },
  resolvido: { bg: "#d9ecd9", ink: "#005500" },
  ouvidoria: { bg: "#fbe4e4", ink: "#c53030" },
};

export type SituacaoPrazo = "vencido" | "vencendo" | "normal";

/** Espelha PRAZO_COR_TEXT_CLASSES (prazo-colors.ts) — só texto colorido, sem badge/pill na tela. */
export const PRAZO_INK_HEX: Record<SituacaoPrazo, string> = {
  vencido: "#e7000b",
  vencendo: "#b45309",
  normal: "#047857",
};

/** Mesmos hex sem o "#", pra uso direto em ARGB do exceljs (sempre com prefixo de opacidade "FF"). */
export function argb(hex: string): string {
  return `FF${hex.replace("#", "").toUpperCase()}`;
}
