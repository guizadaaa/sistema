"use client";

import { useActionState, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { formatarDataBr } from "@/lib/formatacao";
import { FILIAL_LABELS } from "@/lib/labels";
import type { MapeamentoComUsuario, PendenteDeVinculo } from "@/lib/vendas/mapeamento";
import { FILIAIS } from "@/lib/validation/caso";

import { criarMapeamento, type CriarMapeamentoState } from "./actions";

const initialState: CriarMapeamentoState = {};

function periodoTexto(desde: string | null, ate: string | null): string {
  if (!desde && !ate) return "Sempre";
  const de = desde ? formatarDataBr(desde) : "início";
  const ateTexto = ate ? formatarDataBr(ate) : "atual";
  return `${de} — ${ateTexto}`;
}

export function MapeamentoLista({
  mapeamentos,
  pendentes,
  prefill,
}: {
  mapeamentos: MapeamentoComUsuario[];
  pendentes: PendenteDeVinculo[];
  prefill: { nome?: string; filial?: string };
}) {
  const [state, formAction, isPending] = useActionState(criarMapeamento, initialState);
  const [semConta, setSemConta] = useState(false);
  const [nomePlanilha, setNomePlanilha] = useState(prefill.nome ?? "");
  const [filial, setFilial] = useState(prefill.filial ?? "");

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-xl font-semibold">Mapeamento de vendedores</h1>

      {pendentes.length > 0 && (
        <Card className="border-dashed">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              Pendentes de vínculo
              <Badge variant="outline">{pendentes.length}</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground mb-3 text-sm">
              Nomes de vendedor que apareceram em vendas importadas mas ainda não têm vínculo com nenhum usuário.
            </p>
            <ul className="flex flex-col gap-2">
              {pendentes.map((p) => (
                <li
                  key={`${p.filial}-${p.vendedorNomePlanilha}`}
                  className="flex items-center justify-between gap-2 rounded-md border p-2 text-sm"
                >
                  <div className="flex flex-col">
                    <span className="font-medium">
                      {p.vendedorNomePlanilha} · {FILIAL_LABELS[p.filial]}
                    </span>
                    <span className="text-muted-foreground text-xs">
                      {p.quantidade} venda(s) · {formatarDataBr(p.primeiraVenda)} a {formatarDataBr(p.ultimaVenda)}
                    </span>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setNomePlanilha(p.vendedorNomePlanilha);
                      setFilial(p.filial);
                    }}
                  >
                    Criar vínculo
                  </Button>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Vínculos existentes</CardTitle>
        </CardHeader>
        <CardContent>
          {mapeamentos.length === 0 ? (
            <p className="text-muted-foreground text-sm">Nenhum vínculo criado ainda.</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-muted-foreground border-b text-left">
                  <th className="py-2 pr-4 font-medium">Nome na planilha</th>
                  <th className="py-2 pr-4 font-medium">Loja</th>
                  <th className="py-2 pr-4 font-medium">Usuário</th>
                  <th className="py-2 pr-4 font-medium">Período</th>
                </tr>
              </thead>
              <tbody>
                {mapeamentos.map((m) => (
                  <tr key={m.id} className="border-b last:border-0">
                    <td className="py-2 pr-4">{m.nome_planilha}</td>
                    <td className="py-2 pr-4">{FILIAL_LABELS[m.filial]}</td>
                    <td className="py-2 pr-4">
                      {m.usuario_id ? (
                        <div className="flex flex-col">
                          <span>{m.usuarioNome}</span>
                          <span className="text-muted-foreground text-xs">{m.usuarioEmail}</span>
                        </div>
                      ) : (
                        <Badge variant="outline">Sem conta</Badge>
                      )}
                    </td>
                    <td className="py-2 pr-4">{periodoTexto(m.vigente_desde, m.vigente_ate)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Novo vínculo</CardTitle>
        </CardHeader>
        <CardContent>
          <form action={formAction} className="flex flex-col gap-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="flex flex-col gap-1">
                <Label htmlFor="nomePlanilha">Nome exato na planilha</Label>
                <Input
                  id="nomePlanilha"
                  name="nomePlanilha"
                  value={nomePlanilha}
                  onChange={(e) => setNomePlanilha(e.target.value)}
                  placeholder="Ex.: SAMARA MENDES NUNES"
                  required
                />
              </div>

              <div className="flex flex-col gap-1">
                <Label htmlFor="filial">Loja</Label>
                <Select name="filial" value={filial} onValueChange={setFilial}>
                  <SelectTrigger id="filial">
                    <SelectValue placeholder="Selecione" />
                  </SelectTrigger>
                  <SelectContent>
                    {FILIAIS.map((f) => (
                      <SelectItem key={f} value={f}>
                        {FILIAL_LABELS[f]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <Checkbox
                id="semConta"
                name="semConta"
                value="1"
                checked={semConta}
                onCheckedChange={(v) => setSemConta(v === true)}
              />
              <Label htmlFor="semConta" className="text-sm font-normal">
                Sem conta no sistema (ex-funcionário — mantém o nome identificado no histórico)
              </Label>
            </div>

            {!semConta && (
              <div className="flex flex-col gap-1">
                <Label htmlFor="email">E-mail do usuário</Label>
                <Input id="email" name="email" type="email" placeholder="usuario@cvc.com.br" />
              </div>
            )}

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="flex flex-col gap-1">
                <Label htmlFor="vigenteDesde">Vigente desde (opcional)</Label>
                <Input id="vigenteDesde" name="vigenteDesde" type="date" />
              </div>
              <div className="flex flex-col gap-1">
                <Label htmlFor="vigenteAte">Vigente até (opcional)</Label>
                <Input id="vigenteAte" name="vigenteAte" type="date" />
              </div>
            </div>
            <p className="text-muted-foreground text-xs">
              Deixe as duas datas em branco para o vínculo valer sempre (inclusive vendas já importadas no passado).
            </p>

            {state.error && <p className="text-destructive text-sm">{state.error}</p>}

            <Button type="submit" disabled={isPending} className="w-fit">
              {isPending ? "Salvando..." : "Criar vínculo"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
