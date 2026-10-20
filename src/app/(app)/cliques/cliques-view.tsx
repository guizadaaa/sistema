"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useActionState, useEffect, useRef } from "react";
import { AlertTriangle } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { formatarDataBr } from "@/lib/formatacao";
import { FILIAL_LABELS } from "@/lib/labels";
import type { CliquesMes, ResumoVendedorMes, VitrineMes } from "@/lib/linkly/listar";
import { dataHoraSaoPaulo, hojeSaoPaulo, horaSaoPaulo, parametroMes, rotuloMes, rotuloMesCapitalizado } from "@/lib/linkly/mes";
import type { FilialCvc } from "@/lib/supabase/types";

import { atualizarCliques, type AtualizarCliquesState } from "./actions";

const initialState: AtualizarCliquesState = {};

// A sincronização roda de hora em hora; 5 min mantém a tela em dia sem
// martelar o servidor.
const INTERVALO_ATUALIZACAO_MS = 5 * 60 * 1000;

/** "contagem a partir de 14/10 (início do registro)" — mês sem snapshot anterior. */
function NotaContagemParcial({ desde }: { desde: string | null }) {
  if (!desde) return null;
  return (
    <span className="text-muted-foreground block text-xs">
      contagem a partir de {formatarDataBr(desde).slice(0, 5)} (início do registro)
    </span>
  );
}

/**
 * Recarrega os dados do servidor (router.refresh) a cada 5 min, só com a
 * aba visível; ao voltar para a aba depois de 5 min parada, recarrega na
 * hora. Não renderiza nada.
 */
export function AutoAtualizar() {
  const router = useRouter();
  const ultimaRef = useRef(0);

  useEffect(() => {
    ultimaRef.current = Date.now();
    const atualizar = () => {
      ultimaRef.current = Date.now();
      router.refresh();
    };
    const intervalo = window.setInterval(() => {
      if (document.visibilityState === "visible") atualizar();
    }, INTERVALO_ATUALIZACAO_MS);
    const aoMudarVisibilidade = () => {
      if (document.visibilityState === "visible" && Date.now() - ultimaRef.current >= INTERVALO_ATUALIZACAO_MS) atualizar();
    };
    document.addEventListener("visibilitychange", aoMudarVisibilidade);
    return () => {
      window.clearInterval(intervalo);
      document.removeEventListener("visibilitychange", aoMudarVisibilidade);
    };
  }, [router]);

  return null;
}

/**
 * "Atualizado às HH:MM" + aviso de sincronização atrasada (> 3 h) para
 * admins — se o cron voltar a falhar, alguém percebe pela tela.
 */
export function StatusSincronizacao({
  ultima,
  atrasada,
  mostrarAlerta,
}: {
  ultima: string | null;
  atrasada: boolean;
  mostrarAlerta: boolean;
}) {
  return (
    <div className="flex flex-col items-end gap-1 text-right">
      {ultima ? (
        <span className="text-muted-foreground text-xs" title={dataHoraSaoPaulo(ultima)}>
          Atualizado às {horaSaoPaulo(ultima)}
        </span>
      ) : (
        <span className="text-muted-foreground text-xs">Ainda sem sincronização</span>
      )}
      {mostrarAlerta && atrasada && (
        <span
          role="status"
          className="inline-flex items-center gap-1 rounded-md border border-amber-300 bg-amber-50 px-2 py-0.5 text-xs text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-300"
        >
          <AlertTriangle className="size-3.5" />
          {ultima ? `Sincronização atrasada desde ${dataHoraSaoPaulo(ultima)}` : "Sincronização nunca executada"}
        </span>
      )}
    </div>
  );
}

/** Seletor de mês: atual + meses com registro. Muda só ?mes=, mantendo os demais parâmetros. */
export function SeletorMes({ mes, opcoes }: { mes: string; opcoes: string[] }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  return (
    <div className="flex items-center gap-2">
      <Label htmlFor="mes-cliques" className="text-sm">
        Mês
      </Label>
      <Select
        value={mes}
        onValueChange={(novo) => {
          const params = new URLSearchParams(searchParams.toString());
          params.set("mes", parametroMes(novo));
          router.push(`${pathname}?${params.toString()}`);
        }}
      >
        <SelectTrigger id="mes-cliques" className="w-48">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {opcoes.map((o) => (
            <SelectItem key={o} value={o}>
              {rotuloMesCapitalizado(o)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

export function AtualizarAgoraBotao() {
  const [state, formAction, isPending] = useActionState(atualizarCliques, initialState);

  return (
    <form action={formAction} className="flex items-center gap-3">
      <Button type="submit" variant="ghost" size="sm" disabled={isPending}>
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

export function TabelaCliquesMes({ linhas, mes }: { linhas: CliquesMes[]; mes: string }) {
  const total = linhas.reduce((soma, l) => soma + l.cliques, 0);
  // No mês corrente o trecho vigente vai até hoje, não até o último dia do mês.
  const hoje = hojeSaoPaulo();

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          <span className="first-letter:uppercase">Cliques por link — {rotuloMes(mes)}</span>
          <Badge variant="outline" className="text-sm font-medium">
            Total: {total}
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="overflow-x-auto">
        {linhas.length === 0 ? (
          <p className="text-muted-foreground text-sm">Nenhum clique registrado neste mês.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-muted-foreground border-b text-left">
                <th className="py-2 pr-4 font-medium">Link</th>
                <th className="py-2 pr-4 font-medium">Período no mês</th>
                <th className="py-2 pr-4 font-medium">Cliques</th>
              </tr>
            </thead>
            <tbody>
              {linhas.map((l) => (
                <tr key={l.mapeamentoId} className="border-b last:border-0">
                  <td className="py-2 pr-4">{l.shortUrl}</td>
                  <td className="py-2 pr-4">
                    {formatarDataBr(l.inicio)} — {l.fim >= hoje ? "hoje" : formatarDataBr(l.fim)}
                    <NotaContagemParcial desde={l.baseParcial ? l.contagemDesde : null} />
                  </td>
                  <td className="py-2 pr-4">{l.cliques}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </CardContent>
    </Card>
  );
}

export function ResumoPorVendedorMes({
  resumo,
  mes,
  mostrarFilial,
  loja,
}: {
  resumo: ResumoVendedorMes[];
  mes: string;
  mostrarFilial: boolean;
  /** Filtro ?loja= ativo — levado para o "Ver por link". */
  loja?: FilialCvc;
}) {
  const totalGeral = resumo.reduce((soma, r) => soma + r.totalCliques, 0);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          <span className="first-letter:uppercase">Cliques por vendedor — {rotuloMes(mes)}</span>
          <span className="text-base font-medium">Total: {totalGeral}</span>
        </CardTitle>
      </CardHeader>
      <CardContent className="overflow-x-auto">
        {resumo.length === 0 ? (
          <p className="text-muted-foreground text-sm">
            {loja ? `Nenhum clique registrado neste mês em ${FILIAL_LABELS[loja]}.` : "Nenhum clique registrado neste mês."}
          </p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-muted-foreground border-b text-left">
                <th className="py-2 pr-4 font-medium">Vendedor</th>
                {mostrarFilial && <th className="py-2 pr-4 font-medium">Filial</th>}
                <th className="py-2 pr-4 font-medium">Cliques</th>
                <th className="py-2 pr-4 font-medium"></th>
              </tr>
            </thead>
            <tbody>
              {resumo.map((r) => {
                const query = new URLSearchParams({ vendedorId: r.vendedorId, vendedorNome: r.vendedorNome, mes: parametroMes(mes) });
                if (loja) query.set("loja", loja);
                return (
                  <tr key={r.vendedorId} className="border-b last:border-0 hover:bg-accent/50">
                    <td className="py-2 pr-4">{r.vendedorNome}</td>
                    {mostrarFilial && <td className="py-2 pr-4">{FILIAL_LABELS[r.filial]}</td>}
                    <td className="py-2 pr-4">
                      {r.totalCliques}
                      <NotaContagemParcial desde={r.contagemDesde} />
                    </td>
                    <td className="py-2 pr-4">
                      <Link href={`/cliques?${query.toString()}`} className="text-sm font-medium hover:underline">
                        Ver por link
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

export function VitrineMesCard({ vitrine, mes }: { vitrine: VitrineMes[]; mes: string }) {
  if (vitrine.length === 0) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="first-letter:uppercase">Vitrine (grupo de WhatsApp por loja) — {rotuloMes(mes)}</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-2">
        {vitrine.map((v) => (
          <div key={v.linkId} className="flex items-start justify-between gap-2 text-sm">
            <span>
              {FILIAL_LABELS[v.filial]} · {v.shortUrl}
            </span>
            <span className="text-muted-foreground text-right">
              {v.cliques} cliques
              <NotaContagemParcial desde={v.baseParcial ? v.contagemDesde : null} />
            </span>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
