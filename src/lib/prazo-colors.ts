import type { CorPrazo } from "@/lib/casos/prazo";

// Mesmo padrão de src/lib/status-colors.ts — cor nunca é o único sinal, o
// texto "Vence em X dias"/"Vencido há X dias" sempre acompanha a cor.
export const PRAZO_COR_TEXT_CLASSES: Record<CorPrazo, string> = {
  verde: "text-emerald-600 dark:text-emerald-500",
  amarelo: "text-amber-600 dark:text-amber-500",
  laranja: "text-orange-600 dark:text-orange-500",
  vermelho: "text-destructive",
};

// Versão "pill" (fundo suave + texto), no mesmo espírito de
// STATUS_BADGE_CLASSES — usada na célula "Prazo de vigência" das listas,
// onde só a linha de situação (não a data) carrega a cor.
export const PRAZO_COR_BADGE_CLASSES: Record<CorPrazo, string> = {
  verde: "border-transparent bg-emerald-500/15 text-emerald-700 dark:text-emerald-400",
  amarelo: "border-transparent bg-amber-500/15 text-amber-700 dark:text-amber-400",
  laranja: "border-transparent bg-orange-500/15 text-orange-700 dark:text-orange-400",
  vermelho: "border-transparent bg-destructive/15 text-destructive",
};
