import Link from "next/link";

import { plural, segmentosStatus, statusAoClicar, urlCasos, type FiltrosTelaCasos } from "@/lib/casos/barra-status";
import type { ContagemStatus } from "@/lib/casos/listar";
import { STATUS_LABELS } from "@/lib/labels";
import { STATUS_BADGE_CLASSES, STATUS_DOT_ATUAL } from "@/lib/status-colors";
import { cn } from "@/lib/utils";

/**
 * "Casos por status" entre os filtros e a lista. Conta com os filtros da
 * tela MENOS o Status (o selecionado fica realçado, os outros esmaecidos).
 * Etiquetas e "vencidos" são links: mesma navegação do Filtrar, sem
 * recarregar a página inteira.
 */
export function BarraStatus({ contagem, filtros }: { contagem: ContagemStatus; filtros: FiltrosTelaCasos }) {
  const segmentos = segmentosStatus(contagem.porStatus);
  const vencidosAtivo = filtros.prazo === "vencido";
  const vence5Ativo = filtros.prazo === "vence5";

  return (
    <section className="flex flex-col gap-2 px-1" data-testid="barra-status" aria-label="Casos por status">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 text-sm">
        <span className="font-semibold" data-testid="total-casos">
          {plural(contagem.total, "caso", "casos")}
        </span>
        {segmentos.map((s) => {
          const selecionado = filtros.status === s.status;
          return (
            <Link
              key={s.status}
              href={urlCasos(filtros, { status: statusAoClicar(filtros.status, s.status) })}
              scroll={false}
              data-status={s.status}
              data-quantidade={s.quantidade}
              aria-current={selecionado ? "true" : undefined}
              title={selecionado ? "Clique para mostrar todos os status" : `Filtrar: ${STATUS_LABELS[s.status]}`}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-md px-2 py-0.5 text-xs font-medium transition-opacity hover:opacity-100",
                STATUS_BADGE_CLASSES[s.status],
                selecionado && "ring-foreground/70 ring-2 ring-offset-1 ring-offset-background",
                filtros.status && !selecionado && "opacity-55",
                !filtros.status && s.quantidade === 0 && "opacity-45"
              )}
            >
              {STATUS_LABELS[s.status]}
              <span className="tabular-nums">{s.quantidade}</span>
            </Link>
          );
        })}
        {(contagem.vencidos > 0 || contagem.vencemEm5 > 0 || filtros.prazo) && (
          <span className="text-muted-foreground ml-auto flex items-center gap-1.5 text-xs" data-testid="prazos">
            <Link
              href={urlCasos(filtros, { prazo: vencidosAtivo ? undefined : "vencido" })}
              scroll={false}
              data-testid="vencidos"
              title={vencidosAtivo ? "Mostrar todos os prazos" : "Filtrar: só os vencidos"}
              className={cn(
                "text-destructive font-medium hover:underline",
                vencidosAtivo && "bg-destructive/10 rounded px-1.5 py-0.5 ring-1 ring-destructive/40"
              )}
            >
              {plural(contagem.vencidos, "vencido", "vencidos")}
              {vencidosAtivo && " ×"}
            </Link>
            ·
            <Link
              href={urlCasos(filtros, { prazo: vence5Ativo ? undefined : "vence5" })}
              scroll={false}
              data-testid="vencem-5"
              title={vence5Ativo ? "Mostrar todos os prazos" : "Filtrar: só os que vencem em até 5 dias"}
              className={cn(
                "font-medium text-orange-700 hover:underline dark:text-orange-400",
                vence5Ativo && "rounded bg-orange-500/10 px-1.5 py-0.5 ring-1 ring-orange-500/40"
              )}
            >
              {contagem.vencemEm5} {contagem.vencemEm5 === 1 ? "vence" : "vencem"} em até 5 dias
              {vence5Ativo && " ×"}
            </Link>
          </span>
        )}
      </div>
      <div className="bg-muted flex h-1.5 w-full overflow-hidden rounded-full" data-testid="barra-proporcao">
        {segmentos
          .filter((s) => s.quantidade > 0)
          .map((s) => (
            <div
              key={s.status}
              title={`${STATUS_LABELS[s.status]}: ${s.quantidade} (${s.percentual}%)`}
              data-status={s.status}
              className={cn(STATUS_DOT_ATUAL[s.status], filtros.status && filtros.status !== s.status && "opacity-40")}
              style={{ width: `${(s.quantidade / contagem.total) * 100}%` }}
            />
          ))}
      </div>
    </section>
  );
}
