import { Badge } from "@/components/ui/badge";
import {
  corPrazoVigencia,
  descricaoDiasAteVencimento,
  descricaoResolucao,
  prazoNaResolucao,
} from "@/lib/casos/prazo";
import { PRAZO_COR_BADGE_CLASSES } from "@/lib/prazo-colors";
import type { StatusCaso } from "@/lib/supabase/types";
import { cn } from "@/lib/utils";

function formatarPrazo(prazoVigencia: string): string {
  return new Date(`${prazoVigencia}T00:00:00`).toLocaleDateString("pt-BR");
}

/**
 * Célula "Prazo de vigência" das listas. A data em si fica neutra (sem cor)
 * — só a situação, abaixo, carrega a cor, no mesmo estilo "pill" dos badges
 * de status (fundo suave + texto), para não competir visualmente com eles.
 *
 * Caso Resolvido compara o prazo com a data de resolução (o relógio para
 * ali): "Resolvido X dias antes/depois". Demais status (ou Resolvido sem
 * data de resolução conhecida) seguem comparando com hoje.
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
      <div className="flex flex-col gap-0.5" title={`Prazo de vigência: ${formatarPrazo(prazoVigencia)}`}>
        <span className="font-medium">{formatarPrazo(prazoVigencia)}</span>
        <Badge className={cn("w-fit", PRAZO_COR_BADGE_CLASSES[antesDoPrazo ? "verde" : "vermelho"])}>
          {descricaoResolucao(antesDoPrazo, dias)}
        </Badge>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-0.5">
      <span className="font-medium">{formatarPrazo(prazoVigencia)}</span>
      <Badge className={cn("w-fit", PRAZO_COR_BADGE_CLASSES[corPrazoVigencia(prazoVigencia)])}>
        {descricaoDiasAteVencimento(prazoVigencia)}
      </Badge>
    </div>
  );
}
