"use client";

import Link from "next/link";
import { useActionState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatarDataBr } from "@/lib/formatacao";
import { FILIAL_LABELS } from "@/lib/labels";
import type { CliquesVitrine, PeriodoCliques, ResumoVendedorCliques } from "@/lib/linkly/listar";
import type { FilialCvc } from "@/lib/supabase/types";

import { atualizarCliques, type AtualizarCliquesState } from "./actions";

const initialState: AtualizarCliquesState = {};

function formatarDataHora(iso: string) {
  return new Date(iso).toLocaleString("pt-BR");
}

export function AtualizarAgoraBotao() {
  const [state, formAction, isPending] = useActionState(atualizarCliques, initialState);

  return (
    <form action={formAction} className="flex items-center gap-3">
      <Button type="submit" variant="outline" size="sm" disabled={isPending}>
        {isPending ? "Atualizando..." : "Atualizar agora"}
      </Button>
      {state.error && <p className="text-destructive text-sm">{state.error}</p>}
      {state.resultado && (
        <p className="text-muted-foreground text-sm">
          {state.resultado.atualizados} link(s) atualizado(s)
          {state.resultado.erros > 0 ? `, ${state.resultado.erros} com erro (ver logs da Edge Function).` : "."}
        </p>
      )}
    </form>
  );
}

export function TabelaPeriodos({ periodos, total }: { periodos: PeriodoCliques[]; total: number }) {
  const atualizadoEm = periodos.reduce<string | null>(
    (maisRecente, p) => (!maisRecente || p.cliquesAtualizadoEm > maisRecente ? p.cliquesAtualizadoEm : maisRecente),
    null
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          <span>Cliques por período</span>
          <Badge variant="outline" className="text-sm font-medium">
            Total: {total}
          </Badge>
        </CardTitle>
        {atualizadoEm && <p className="text-muted-foreground text-xs">Dados atualizados em {formatarDataHora(atualizadoEm)}</p>}
      </CardHeader>
      <CardContent className="overflow-x-auto">
        {periodos.length === 0 ? (
          <p className="text-muted-foreground text-sm">Nenhum período encontrado.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-muted-foreground border-b text-left">
                <th className="py-2 pr-4 font-medium">Link</th>
                <th className="py-2 pr-4 font-medium">Período</th>
                <th className="py-2 pr-4 font-medium">Cliques</th>
              </tr>
            </thead>
            <tbody>
              {periodos.map((p) => (
                <tr key={p.mapeamentoId} className="border-b last:border-0">
                  <td className="py-2 pr-4">{p.shortUrl}</td>
                  <td className="py-2 pr-4">
                    {formatarDataBr(p.vigenteDesde)} — {p.vigenteAte ? formatarDataBr(p.vigenteAte) : "atual"}
                  </td>
                  <td className="py-2 pr-4">{p.cliquesPeriodo}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </CardContent>
    </Card>
  );
}

export function ResumoPorVendedorTabela({
  resumo,
  mostrarFiltroFilial,
  filial,
}: {
  resumo: ResumoVendedorCliques[];
  mostrarFiltroFilial: boolean;
  filial?: FilialCvc;
}) {
  const totalGeral = resumo.reduce((soma, r) => soma + r.totalCliques, 0);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          <span>Cliques por vendedor</span>
          <span className="text-base font-medium">Total: {totalGeral}</span>
        </CardTitle>
      </CardHeader>
      <CardContent className="overflow-x-auto">
        {resumo.length === 0 ? (
          <p className="text-muted-foreground text-sm">Nenhum clique registrado ainda.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-muted-foreground border-b text-left">
                <th className="py-2 pr-4 font-medium">Vendedor</th>
                {mostrarFiltroFilial && <th className="py-2 pr-4 font-medium">Filial</th>}
                <th className="py-2 pr-4 font-medium">Cliques</th>
                <th className="py-2 pr-4 font-medium"></th>
              </tr>
            </thead>
            <tbody>
              {resumo.map((r) => {
                const query = new URLSearchParams({
                  vendedorId: r.vendedorId,
                  vendedorNome: r.vendedorNome,
                  ...(filial ? { filial } : {}),
                });
                return (
                  <tr key={r.vendedorId} className="border-b last:border-0 hover:bg-accent/50">
                    <td className="py-2 pr-4">{r.vendedorNome}</td>
                    {mostrarFiltroFilial && <td className="py-2 pr-4">{FILIAL_LABELS[r.filial]}</td>}
                    <td className="py-2 pr-4">{r.totalCliques}</td>
                    <td className="py-2 pr-4">
                      <Link href={`/cliques?${query.toString()}`} className="text-sm font-medium hover:underline">
                        Ver períodos
                      </Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </CardContent>
    </Card>
  );
}

export function VitrineCard({ vitrine }: { vitrine: CliquesVitrine[] }) {
  if (vitrine.length === 0) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Vitrine (QR comum às lojas)</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-2">
        {vitrine.map((v) => (
          <div key={v.linkId} className="flex items-center justify-between text-sm">
            <span>{v.shortUrl}</span>
            <span className="text-muted-foreground">
              {v.totalCliques} cliques · atualizado em {formatarDataHora(v.atualizadoEm)}
            </span>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
