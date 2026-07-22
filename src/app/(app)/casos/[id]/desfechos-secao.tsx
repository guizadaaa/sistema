"use client";

import { useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { DesfechoVisivelRow } from "@/lib/casos/detalhe";
import { SUBTIPO_REEMBOLSO_LABELS, SUBTIPO_REMARCACAO_LABELS, TIPO_DESFECHO_LABELS } from "@/lib/labels";
import type { TipoDocumentoAnexo } from "@/lib/supabase/types";

import { cancelarDesfecho } from "./actions";
import { DesfechoForm } from "./desfecho-form";

function formatarData(iso: string) {
  return new Date(iso).toLocaleString("pt-BR");
}

function formatarMoeda(valor: number) {
  return valor.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function ResumoDesfecho({ d }: { d: DesfechoVisivelRow }) {
  return (
    <>
      <div className="font-medium">{TIPO_DESFECHO_LABELS[d.tipo]}</div>
      {d.tipo === "reembolso" && d.subtipo_reembolso && (
        <div className="text-muted-foreground">
          {SUBTIPO_REEMBOLSO_LABELS[d.subtipo_reembolso]}
          {d.valor !== null && ` · ${formatarMoeda(d.valor)}`}
          {d.banco_nome_completo && ` · ${d.banco_nome_completo}`}
        </div>
      )}
      {d.tipo === "remarcacao" && d.subtipo_remarcacao && (
        <div className="text-muted-foreground">
          {SUBTIPO_REMARCACAO_LABELS[d.subtipo_remarcacao]}
          {d.origem_remarcacao_com_custo && <> · Motivo: {d.origem_remarcacao_com_custo === "saude" ? "Saúde" : "Outro"}</>}
          {d.valor_taxas !== null && ` · Taxas: ${formatarMoeda(d.valor_taxas)}`}
          {d.valor_diferenca_tarifaria !== null && ` · Diferença: ${formatarMoeda(d.valor_diferenca_tarifaria)}`}
        </div>
      )}
      {d.tipo === "carta_credito" && d.valor !== null && <div className="text-muted-foreground">{formatarMoeda(d.valor)}</div>}
    </>
  );
}

function ExcluirBotao({ casoId, desfechoId }: { casoId: string; desfechoId: string }) {
  const [isPending, startTransition] = useTransition();
  const [erro, setErro] = useState<string | undefined>();

  return (
    <div className="flex flex-col items-start gap-1">
      <Button
        type="button"
        size="sm"
        variant="ghost"
        disabled={isPending}
        onClick={() =>
          startTransition(async () => {
            setErro(undefined);
            const resultado = await cancelarDesfecho(casoId, desfechoId);
            if (resultado.error) setErro(resultado.error);
          })
        }
      >
        {isPending ? "Excluindo..." : "Excluir"}
      </Button>
      {erro && <p className="text-destructive text-sm">{erro}</p>}
    </div>
  );
}

export function DesfechosSecao({
  casoId,
  desfechos,
  tiposAnexosExistentes,
  podeConduzirFluxo,
}: {
  casoId: string;
  desfechos: DesfechoVisivelRow[];
  tiposAnexosExistentes: TipoDocumentoAnexo[];
  podeConduzirFluxo: boolean;
}) {
  const [editandoId, setEditandoId] = useState<string | null>(null);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Desfechos</CardTitle>
      </CardHeader>
      <CardContent>
        {desfechos.length === 0 ? (
          <p className="text-muted-foreground text-sm">Nenhum desfecho registrado ainda.</p>
        ) : (
          <ul className="flex flex-col gap-3">
            {desfechos.map((d) => {
              // Correção com histórico (20260722000001): o registro nunca é
              // apagado — só marcado como substituído ou cancelado. Ambos
              // ficam visíveis, esmaecidos, sem ações (já são estado final).
              // Boolean(...), não "!== null": se a migration ainda não rodou
              // no projeto Supabase em uso, essas colunas vêm undefined (não
              // presentes na linha), e undefined !== null é true em JS.
              const inativo = Boolean(d.substituido_por) || Boolean(d.cancelado_em);

              if (editandoId === d.id) {
                return (
                  <li key={d.id}>
                    <DesfechoForm
                      casoId={casoId}
                      tiposAnexosExistentes={tiposAnexosExistentes}
                      desfechoParaCorrigir={d}
                      onCancelarCorrecao={() => setEditandoId(null)}
                    />
                  </li>
                );
              }

              return (
                <li key={d.id} className={`rounded-md border p-3 text-sm ${inativo ? "opacity-60" : ""}`}>
                  <div className={inativo ? "line-through decoration-muted-foreground" : ""}>
                    <ResumoDesfecho d={d} />
                  </div>
                  {d.substituido_em && (
                    <p className="text-muted-foreground mt-1 text-xs">Substituído em {formatarData(d.substituido_em)}</p>
                  )}
                  {d.cancelado_em && (
                    <p className="text-muted-foreground mt-1 text-xs">Cancelado em {formatarData(d.cancelado_em)}</p>
                  )}
                  {podeConduzirFluxo && !inativo && (
                    <div className="mt-2 flex gap-2">
                      <Button type="button" size="sm" variant="outline" onClick={() => setEditandoId(d.id)}>
                        Editar
                      </Button>
                      <ExcluirBotao casoId={casoId} desfechoId={d.id} />
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
