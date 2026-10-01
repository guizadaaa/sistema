import {
  corPrazoVigencia,
  descricaoDias,
  descricaoDiasAteVencimento,
  prazoNaResolucao,
} from "@/lib/casos/prazo";
import { PRAZO_COR_TEXT_CLASSES } from "@/lib/prazo-colors";
import type { StatusCaso } from "@/lib/supabase/types";
import { cn } from "@/lib/utils";

function formatarPrazo(prazoVigencia: string): string {
  return new Date(`${prazoVigencia}T00:00:00`).toLocaleDateString("pt-BR");
}

/**
 * Célula "Prazo de vigência" das listas. Caso Resolvido compara o prazo com
 * a data de resolução (o relógio para ali): "Resolvido antes/depois do
 * prazo" + distância em dias. Demais status (ou Resolvido sem data de
 * resolução conhecida) seguem comparando com hoje.
 */
export function PrazoVigencia({
  prazoVigencia,
  statusAtual,
  resolvidoEm,
}: {
  prazoVigencia: string;
  statusAtual: StatusCaso;
  resolvidoEm?: string | null;
}) {
  if (statusAtual === "resolvido" && resolvidoEm) {
    const { antesDoPrazo, dias } = prazoNaResolucao(prazoVigencia, resolvidoEm);
    return (
      <div
        className={cn("flex flex-col", PRAZO_COR_TEXT_CLASSES[antesDoPrazo ? "verde" : "vermelho"])}
        title={`Prazo de vigência: ${formatarPrazo(prazoVigencia)}`}
      >
        <span className="font-medium">{antesDoPrazo ? "Resolvido antes do prazo" : "Resolvido depois do prazo"}</span>
        <span className="text-xs">{descricaoDias(dias)}</span>
      </div>
    );
  }

  return (
    <div className={cn("flex flex-col", PRAZO_COR_TEXT_CLASSES[corPrazoVigencia(prazoVigencia)])}>
      <span className="font-medium">{formatarPrazo(prazoVigencia)}</span>
      <span className="text-xs">{descricaoDiasAteVencimento(prazoVigencia)}</span>
    </div>
  );
}
