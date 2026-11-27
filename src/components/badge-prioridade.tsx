import { Badge } from "@/components/ui/badge";
import { isGrauPrioridade, nomePrioridade } from "@/lib/casos/prioridade";
import { PRIORIDADE_BADGE_CLASSES, SEM_GRAU_BADGE_CLASSES } from "@/lib/status-colors";
import type { GrauPrioridade } from "@/lib/supabase/types";
import { cn } from "@/lib/utils";

/** Badge do grau de prioridade ("Sem grau" nos casos antigos). */
export function BadgePrioridade({ grau, className }: { grau: GrauPrioridade | null; className?: string }) {
  return (
    <Badge
      data-testid="badge-prioridade"
      data-grau={grau ?? "sem"}
      className={cn(isGrauPrioridade(grau) ? PRIORIDADE_BADGE_CLASSES[grau] : SEM_GRAU_BADGE_CLASSES, className)}
    >
      {nomePrioridade(grau)}
    </Badge>
  );
}
