import type { CorPrazo } from "@/lib/casos/prazo";

// Mesmo padrão de src/lib/status-colors.ts — cor nunca é o único sinal, o
// texto "Vence em X dias"/"Vencido há X dias" sempre acompanha a cor.
export const PRAZO_COR_TEXT_CLASSES: Record<CorPrazo, string> = {
  verde: "text-emerald-600 dark:text-emerald-500",
  amarelo: "text-amber-600 dark:text-amber-500",
  laranja: "text-orange-600 dark:text-orange-500",
  vermelho: "text-destructive",
};
