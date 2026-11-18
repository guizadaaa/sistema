"use client";

import { useState } from "react";
import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ehDiaUtil, feriadoDoDia, type Feriado } from "@/lib/feriados/dia-util";
import { FILIAL_LABELS } from "@/lib/labels";
import { cn } from "@/lib/utils";
import { mesAnterior, mesSeguinte, nomeMes, resumoDoMes, semanasDoMes, statusMarcador, type StatusMarcador } from "@/lib/vendas/calendario";
import type { ImportacaoDoDia } from "@/lib/vendas/importacoes";

const DIAS_SEMANA = ["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"];

const COR: Record<StatusMarcador, string> = {
  importou: "bg-emerald-500 border-emerald-600",
  atrasada: "bg-red-500 border-red-600",
  vazio: "bg-transparent border-muted-foreground/40",
};

function hora(iso: string) {
  return new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit" }).format(new Date(iso));
}

function diaMes(data: string) {
  const [, m, d] = data.split("-");
  return `${d}/${m}`;
}

function Marcador({ status, titulo }: { status: StatusMarcador; titulo: string }) {
  return <span title={titulo} aria-label={titulo} data-status={status} className={cn("inline-block size-2.5 rounded-full border", COR[status])} />;
}

/**
 * Importações do mês: cada dia mostra um marcador por loja (sempre na mesma
 * ordem). Verde = importou; vermelho = dia útil passado sem importação;
 * vazio = futuro, hoje antes de importar, fim de semana ou feriado.
 */
export function CalendarioImportacoes({
  mes,
  hoje,
  lojas,
  feriados,
  importacoes,
}: {
  mes: string;
  hoje: string;
  lojas: string[];
  feriados: Feriado[];
  importacoes: ImportacaoDoDia[];
}) {
  const [selecionado, setSelecionado] = useState<string | null>(hoje.startsWith(mes) ? hoje : null);
  const porDia = new Map<string, ImportacaoDoDia[]>();
  for (const i of importacoes) porDia.set(i.dia, [...(porDia.get(i.dia) ?? []), i]);
  const importouEm = (dia: string, loja: string) => (porDia.get(dia) ?? []).some((i) => i.filial === loja);
  const resumo = resumoDoMes(mes, lojas, hoje, importouEm, feriados);
  const doDia = selecionado ? porDia.get(selecionado) ?? [] : [];
  const visaoGeral = lojas.length > 1 ? null : lojas[0];

  return (
    <Card data-testid="calendario">
      <CardHeader className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle className="flex items-center gap-1">
            <Button asChild variant="ghost" size="sm" aria-label="Mês anterior">
              <Link href={`?mes=${mesAnterior(mes)}`}>
                <ChevronLeft className="size-4" />
              </Link>
            </Button>
            <span className="min-w-36 text-center" data-testid="mes">
              {nomeMes(mes)}
            </span>
            <Button asChild variant="ghost" size="sm" aria-label="Mês seguinte">
              <Link href={`?mes=${mesSeguinte(mes)}`}>
                <ChevronRight className="size-4" />
              </Link>
            </Button>
            <Button asChild variant="outline" size="sm" className="ml-1">
              <Link href="?">Hoje</Link>
            </Button>
          </CardTitle>
          <div className="text-muted-foreground flex flex-wrap items-center gap-3 text-xs">
            <span>Marcadores: {lojas.join(" · ")}</span>
            <span className="flex items-center gap-1">
              <Marcador status="importou" titulo="importou" /> importou
            </span>
            <span className="flex items-center gap-1">
              <Marcador status="atrasada" titulo="dia útil sem importação" /> dia útil sem importação
            </span>
            <span className="flex items-center gap-1">
              <Marcador status="vazio" titulo="sem cobrança" /> futuro / sem cobrança
            </span>
          </div>
        </div>
        <p className="text-sm" data-testid="resumo-mes">
          Dias úteis: <strong>{resumo.diasUteis}</strong> · importações em dia:{" "}
          {resumo.porLoja.map((r, i) => (
            <span key={r.loja}>
              {i > 0 && " · "}
              {lojas.length > 1 && `${r.loja} `}
              <strong>
                {r.emDia} de {r.esperados}
              </strong>
            </span>
          ))}
        </p>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="grid grid-cols-7 gap-1 text-xs">
          {DIAS_SEMANA.map((d) => (
            <div key={d} className="text-muted-foreground pb-1 text-center font-medium">
              {d}
            </div>
          ))}
          {semanasDoMes(mes)
            .flat()
            .map((dia, i) => {
              if (!dia) return <div key={`vazio-${i}`} />;
              const feriado = feriadoDoDia(dia, visaoGeral, feriados);
              const semCobranca = lojas.every((l) => !ehDiaUtil(dia, l, feriados));
              const doDiaN = porDia.get(dia)?.length ?? 0;
              return (
                <button
                  key={dia}
                  type="button"
                  onClick={() => setSelecionado(dia)}
                  data-dia={dia}
                  aria-pressed={selecionado === dia}
                  className={cn(
                    "flex min-h-16 flex-col items-start gap-1 rounded-md border p-1.5 text-left transition-colors hover:bg-accent",
                    semCobranca && "bg-muted/50 text-muted-foreground",
                    dia === hoje && "border-foreground",
                    selecionado === dia && "ring-ring ring-2"
                  )}
                >
                  <span className={cn("font-medium", dia === hoje && "text-foreground")}>{Number(dia.slice(8))}</span>
                  {feriado && (
                    <span className="line-clamp-2 text-[10px] leading-tight" data-testid="feriado">
                      {feriado.nome}
                      {feriado.facultativo ? " (facultativo)" : ""}
                    </span>
                  )}
                  <span className="mt-auto flex gap-1">
                    {lojas.map((loja) => {
                      const status = statusMarcador(dia, loja, hoje, importouEm(dia, loja), feriados);
                      const titulo =
                        status === "importou" ? `${loja}: importou` : status === "atrasada" ? `${loja}: dia útil sem importação` : `${loja}: sem cobrança`;
                      return <Marcador key={loja} status={status} titulo={titulo} />;
                    })}
                  </span>
                  {doDiaN > lojas.length && <span className="text-[10px]">{doDiaN} importações</span>}
                </button>
              );
            })}
        </div>

        {selecionado && (
          <div className="rounded-md border p-3" data-testid="painel-dia">
            <p className="mb-2 text-sm font-medium">
              Importações de {diaMes(selecionado)}/{selecionado.slice(0, 4)}
            </p>
            {doDia.length === 0 ? (
              <p className="text-muted-foreground text-sm">Nenhuma importação neste dia.</p>
            ) : (
              <ul className="flex flex-col gap-1 text-sm">
                {doDia.map((i) => (
                  <li key={i.id} className="flex flex-wrap gap-x-3" data-testid="importacao-dia">
                    <span className="font-medium">{FILIAL_LABELS[i.filial]}</span>
                    <span>{hora(i.importado_em)}</span>
                    <span className="text-muted-foreground">por {i.importado_por_nome}</span>
                    <span>vendas até {diaMes(i.ate)}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
