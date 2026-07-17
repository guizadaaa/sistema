import { Badge } from "@/components/ui/badge";
import { formatarDuracaoEmDias } from "@/lib/casos/duracao";
import type { HistoricoComNome } from "@/lib/casos/detalhe";
import { STATUS_LABELS } from "@/lib/labels";

export function Timeline({ historico }: { historico: HistoricoComNome[] }) {
  return (
    <ol className="flex flex-col gap-3">
      {historico.map((item, i) => {
        const ultimo = i === historico.length - 1;
        return (
          <li key={item.id} className="flex gap-3">
            <div className="flex flex-col items-center">
              <span className={`size-2.5 rounded-full ${ultimo ? "bg-primary" : "bg-muted-foreground"}`} />
              {i < historico.length - 1 && <span className="bg-border mt-1 w-px flex-1" />}
            </div>
            <div className="flex flex-1 flex-col gap-0.5 pb-3">
              <div className="flex items-center gap-2">
                <span className="font-medium">{STATUS_LABELS[item.status]}</span>
                {item.via_delegacao && (
                  <Badge variant="outline" className="text-xs">
                    via delegação
                  </Badge>
                )}
              </div>
              <span className="text-muted-foreground text-sm">
                {new Date(item.entrou_em).toLocaleString("pt-BR")} · {item.alteradoPorNome}
              </span>
              <span className="text-muted-foreground text-sm">
                {formatarDuracaoEmDias(item.duracao)} {ultimo ? `em ${STATUS_LABELS[item.status]}` : `neste status`}
              </span>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
