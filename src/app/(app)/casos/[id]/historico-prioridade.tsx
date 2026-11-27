import { BadgePrioridade } from "@/components/badge-prioridade";
import type { PrioridadeHistoricoComNome } from "@/lib/casos/detalhe";

/** Definição e mudanças do grau de prioridade (quem, de → para, quando). */
export function HistoricoPrioridade({ historico }: { historico: PrioridadeHistoricoComNome[] }) {
  if (historico.length === 0) return null;
  return (
    <div className="flex flex-col gap-2 border-t pt-3" data-testid="historico-prioridade">
      <span className="text-sm font-medium">Prioridade</span>
      <ol className="flex flex-col gap-1.5">
        {historico.map((h) => (
          <li key={h.id} className="flex flex-wrap items-center gap-1.5 text-sm">
            {h.de === null ? (
              <span>Definida como</span>
            ) : (
              <>
                <BadgePrioridade grau={h.de} />
                <span aria-label="para">→</span>
              </>
            )}
            <BadgePrioridade grau={h.para} />
            <span className="text-muted-foreground">
              · {new Date(h.alterado_em).toLocaleString("pt-BR")} · {h.alteradoPorNome}
            </span>
          </li>
        ))}
      </ol>
    </div>
  );
}
