"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { ariaNumero, hrefNumero, STATUS_ABERTOS, type GrupoTabela, type LinhaTabela, type Numeros } from "@/lib/dashboard/tabela-status";
import { STATUS_LABELS } from "@/lib/labels";
import { STATUS_BADGE_CLASSES, STATUS_TEXTO_CLASSES } from "@/lib/status-colors";
import type { StatusCaso } from "@/lib/supabase/types";
import { cn } from "@/lib/utils";

const CHAVE_AGRUPAR = "aura:inicio:agrupar";
type Agrupar = "filial" | "vendedor";

function lerAgrupar(): Agrupar | undefined {
  try {
    const v = window.localStorage.getItem(CHAVE_AGRUPAR);
    return v === "filial" || v === "vendedor" ? v : undefined;
  } catch {
    return undefined;
  }
}

function salvarAgrupar(v: Agrupar) {
  try {
    window.localStorage.setItem(CHAVE_AGRUPAR, v);
  } catch {
    // Sem armazenamento (aba anônima, bloqueado): só não lembra.
  }
}

/** Número clicável (0 = "–", sem link). */
function Numero({
  linha,
  coluna,
  n,
  total,
}: {
  linha: Pick<LinhaTabela, "filial" | "vendedor" | "rotulo">;
  coluna: StatusCaso | "aberto";
  n: number;
  total?: boolean;
}) {
  if (n === 0) return <span className="text-muted-foreground/60">–</span>;
  const cor = total || coluna === "aberto" ? "" : coluna === "resolvido" ? "text-muted-foreground" : STATUS_TEXTO_CLASSES[coluna];
  return (
    <Link
      href={hrefNumero(linha, coluna)}
      aria-label={ariaNumero(linha, coluna, n)}
      className={cn("tabular-nums hover:underline", cor)}
      data-coluna={coluna}
      data-n={n}
    >
      {n}
    </Link>
  );
}

function Celulas({ linha, numeros, total }: { linha: Pick<LinhaTabela, "filial" | "vendedor" | "rotulo">; numeros: Numeros; total?: boolean }) {
  return (
    <>
      {STATUS_ABERTOS.map((s) => (
        <td key={s} className="px-2 py-1.5 text-center">
          <Numero linha={linha} coluna={s} n={numeros.porStatus[s]} total={total} />
        </td>
      ))}
      <td className="w-3" aria-hidden />
      <td className="px-2 py-1.5 text-center opacity-70">
        <Numero linha={linha} coluna="resolvido" n={numeros.porStatus.resolvido} total={total} />
      </td>
      <td className="px-2 py-1.5 text-center font-semibold">
        <Numero linha={linha} coluna="aberto" n={numeros.emAberto} total={total} />
      </td>
    </>
  );
}

function LinhaPessoaOuLoja({ linha }: { linha: LinhaTabela }) {
  return (
    <tr className="hover:bg-accent/40 border-b last:border-0" data-testid="linha-status" data-chave={linha.chave}>
      <th scope="row" className="py-1.5 pr-3 text-left font-normal">
        <span className="flex flex-wrap items-center gap-1.5">
          <span className="font-medium">{linha.rotulo}</span>
          {linha.etiqueta && <span className="text-muted-foreground rounded border px-1 text-[10px] leading-4">{linha.etiqueta}</span>}
        </span>
        {linha.subtitulo && <span className="text-muted-foreground block text-xs">{linha.subtitulo}</span>}
      </th>
      <Celulas linha={linha} numeros={linha.numeros} />
    </tr>
  );
}

/**
 * Casos por status × filial ou vendedor. Cada número é um link para
 * Acompanhar Casos com os filtros daquela linha/coluna.
 */
export function TabelaStatus({
  porFilial,
  porVendedor,
  total,
  rotuloTotal = "Total",
  comChave,
  agruparInicial,
}: {
  porFilial: LinhaTabela[];
  porVendedor: GrupoTabela[];
  total: Numeros;
  rotuloTotal?: string;
  /** Chave "Por filial | Por vendedor" (só adm/adm_master). */
  comChave: boolean;
  agruparInicial: Agrupar;
}) {
  const [agrupar, setAgrupar] = useState<Agrupar>(agruparInicial);
  // A escolha fica no navegador; lida depois de montar (no servidor não há localStorage).
  useEffect(() => {
    const salvo = comChave ? lerAgrupar() : undefined;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- preferência local, lida só no navegador
    if (salvo) setAgrupar(salvo);
  }, [comChave]);

  const escolher = (v: Agrupar) => {
    setAgrupar(v);
    salvarAgrupar(v);
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2">
      {comChave && (
        <div className="absolute top-4 right-4 flex rounded-md border p-0.5 text-xs" role="group" aria-label="Agrupar por" data-testid="chave-agrupar">
          {(["filial", "vendedor"] as const).map((v) => (
            <button
              key={v}
              type="button"
              aria-pressed={agrupar === v}
              onClick={() => escolher(v)}
              className={cn("rounded px-2 py-1", agrupar === v ? "bg-foreground text-background" : "text-muted-foreground hover:text-foreground")}
            >
              {v === "filial" ? "Por filial" : "Por vendedor"}
            </button>
          ))}
        </div>
      )}
      <div className="min-h-0 flex-1 overflow-auto" data-testid="tabela-status-rolagem">
        <table className="w-full text-sm" data-testid="tabela-status" data-agrupar={agrupar}>
          <thead className="bg-card sticky top-0 z-10">
            <tr className="border-b">
              <th className="text-muted-foreground py-2 pr-3 text-left text-xs font-medium">{agrupar === "filial" ? "Filial" : "Vendedor"}</th>
              {STATUS_ABERTOS.map((s) => (
                <th key={s} className="px-1 py-2 text-center font-normal">
                  <Badge className={cn("whitespace-normal leading-tight", STATUS_BADGE_CLASSES[s])}>{STATUS_LABELS[s]}</Badge>
                </th>
              ))}
              <th className="w-3" aria-hidden />
              <th className="px-1 py-2 text-center font-normal opacity-60">
                <Badge className={STATUS_BADGE_CLASSES.resolvido}>{STATUS_LABELS.resolvido}</Badge>
              </th>
              <th className="px-2 py-2 text-center text-xs font-semibold">Em aberto</th>
            </tr>
          </thead>
          <tbody>
            {agrupar === "filial"
              ? porFilial.map((l) => <LinhaPessoaOuLoja key={l.chave} linha={l} />)
              : porVendedor.map((g) => [
                  g.titulo && (
                    <tr key={`g-${g.titulo}`} className="bg-muted/40">
                      <th colSpan={9} scope="rowgroup" className="text-muted-foreground px-1 py-1 text-left text-xs font-semibold">
                        {g.titulo}
                      </th>
                    </tr>
                  ),
                  ...g.linhas.map((l) => <LinhaPessoaOuLoja key={l.chave} linha={l} />),
                ])}
          </tbody>
          <tfoot className="bg-card sticky bottom-0">
            <tr className="border-t-2 font-semibold" data-testid="linha-total">
              <th scope="row" className="py-2 pr-3 text-left">
                {rotuloTotal}
              </th>
              <Celulas linha={{ rotulo: rotuloTotal, filial: porFilial.length === 1 ? porFilial[0].filial : undefined }} numeros={total} total />
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}
