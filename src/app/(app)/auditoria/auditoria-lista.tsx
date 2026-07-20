"use client";

import { useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ACAO_AUDITORIA_LABELS, TABELA_AUDITORIA_LABELS } from "@/lib/labels";
import type { AuditoriaListada } from "@/lib/auditoria/listar";
import { ACOES_AUDITORIA } from "@/lib/validation/auditoria";
import type { AcaoAuditoria } from "@/lib/supabase/types";

const TABELAS_AUDITORIA = Object.keys(TABELA_AUDITORIA_LABELS);

function formatarDataHora(iso: string) {
  return new Date(iso).toLocaleString("pt-BR");
}

function nomeTabela(tabela: string) {
  return TABELA_AUDITORIA_LABELS[tabela] ?? tabela;
}

// Compara os dois snapshots campo a campo — dados_antigos/dados_novos são
// to_jsonb(old)/to_jsonb(new), formatos diferentes por tabela auditada
// (usuarios, implicacoes, desfechos), então em vez de um layout fixo por
// tabela, isto funciona genericamente pra qualquer uma.
function DetalhesAuditoria({ dadosAntigos, dadosNovos }: { dadosAntigos: unknown; dadosNovos: unknown }) {
  const antigos = (dadosAntigos ?? {}) as Record<string, unknown>;
  const novos = (dadosNovos ?? {}) as Record<string, unknown>;
  const chaves = [...new Set([...Object.keys(antigos), ...Object.keys(novos)])].sort();

  const formatarValor = (v: unknown) => {
    if (v === null || v === undefined) return "—";
    if (typeof v === "boolean") return v ? "Sim" : "Não";
    if (typeof v === "object") return JSON.stringify(v);
    return String(v);
  };

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-muted-foreground border-b text-left">
            <th className="py-2 pr-4 font-medium">Campo</th>
            <th className="py-2 pr-4 font-medium">Antes</th>
            <th className="py-2 pr-4 font-medium">Depois</th>
          </tr>
        </thead>
        <tbody>
          {chaves.map((chave) => {
            const antes = formatarValor(antigos[chave]);
            const depois = formatarValor(novos[chave]);
            const mudou = antes !== depois;
            return (
              <tr key={chave} className="border-b last:border-0">
                <td className="text-muted-foreground py-2 pr-4">{chave}</td>
                <td className={`py-2 pr-4 break-all ${mudou ? "text-destructive" : ""}`}>{antes}</td>
                <td className={`py-2 pr-4 break-all ${mudou ? "font-medium" : ""}`}>{depois}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export function AuditoriaLista({
  registros,
  filtros,
}: {
  registros: AuditoriaListada[];
  filtros: { tabela?: string; acao?: AcaoAuditoria };
}) {
  const [detalheAberto, setDetalheAberto] = useState<AuditoriaListada | null>(null);

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-xl font-semibold">Auditoria</h1>

      <Card>
        <CardContent>
          <form method="get" className="flex flex-wrap items-end gap-3">
            <div className="flex flex-col gap-1">
              <label className="text-sm font-medium">Tabela</label>
              <Select name="tabela" defaultValue={filtros.tabela ?? "todas"}>
                <SelectTrigger className="w-56">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="todas">Todas</SelectItem>
                  {TABELAS_AUDITORIA.map((t) => (
                    <SelectItem key={t} value={t}>
                      {nomeTabela(t)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex flex-col gap-1">
              <label className="text-sm font-medium">Ação</label>
              <Select name="acao" defaultValue={filtros.acao ?? "todas"}>
                <SelectTrigger className="w-56">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="todas">Todas</SelectItem>
                  {ACOES_AUDITORIA.map((a) => (
                    <SelectItem key={a} value={a}>
                      {ACAO_AUDITORIA_LABELS[a]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <Button type="submit" variant="outline">
              Filtrar
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="overflow-x-auto">
          {registros.length === 0 ? (
            <p className="text-muted-foreground text-sm">Nenhum registro encontrado.</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-muted-foreground border-b text-left">
                  <th className="py-2 pr-4 font-medium">Tabela</th>
                  <th className="py-2 pr-4 font-medium">Ação</th>
                  <th className="py-2 pr-4 font-medium">Quem fez</th>
                  <th className="py-2 pr-4 font-medium">Quando</th>
                  <th className="py-2 pr-4 font-medium">Detalhes</th>
                </tr>
              </thead>
              <tbody>
                {registros.map((r) => (
                  <tr key={r.id} className="border-b last:border-0">
                    <td className="py-2 pr-4">{nomeTabela(r.tabela)}</td>
                    <td className="py-2 pr-4">
                      <Badge variant="secondary">{ACAO_AUDITORIA_LABELS[r.acao]}</Badge>
                    </td>
                    <td className="py-2 pr-4">{r.realizadoPorNome}</td>
                    <td className="py-2 pr-4">{formatarDataHora(r.realizado_em)}</td>
                    <td className="py-2 pr-4">
                      {(r.dados_antigos || r.dados_novos) && (
                        <Button size="sm" variant="outline" onClick={() => setDetalheAberto(r)}>
                          Ver detalhes
                        </Button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>

      <Dialog open={detalheAberto !== null} onOpenChange={(open) => !open && setDetalheAberto(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>
              {detalheAberto && `${nomeTabela(detalheAberto.tabela)} · ${ACAO_AUDITORIA_LABELS[detalheAberto.acao]}`}
            </DialogTitle>
          </DialogHeader>
          {detalheAberto && (
            <DetalhesAuditoria dadosAntigos={detalheAberto.dados_antigos} dadosNovos={detalheAberto.dados_novos} />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
