"use client";

import { useActionState, useState, useTransition } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { DelegacaoListada } from "@/lib/delegacoes/listar";

import { criarDelegacao, encerrarDelegacao, type CriarDelegacaoState } from "./actions";

const initialState: CriarDelegacaoState = {};

function formatarDataHora(iso: string) {
  return new Date(iso).toLocaleString("pt-BR");
}

function EncerrarBotao({ delegacaoId }: { delegacaoId: string }) {
  const [isPending, startTransition] = useTransition();
  const [erro, setErro] = useState<string | undefined>();

  return (
    <div className="flex flex-col items-start gap-1">
      <Button
        size="sm"
        variant="outline"
        disabled={isPending}
        onClick={() =>
          startTransition(async () => {
            setErro(undefined);
            const resultado = await encerrarDelegacao(delegacaoId);
            if (resultado.error) setErro(resultado.error);
          })
        }
      >
        {isPending ? "Encerrando..." : "Encerrar"}
      </Button>
      {erro && <p className="text-destructive text-sm">{erro}</p>}
    </div>
  );
}

export function DelegacoesLista({
  delegacoes,
  gerentes,
  podeGerenciar,
}: {
  delegacoes: DelegacaoListada[];
  gerentes: { id: string; nome_completo: string }[];
  podeGerenciar: boolean;
}) {
  const [state, formAction, isPending] = useActionState(criarDelegacao, initialState);

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-xl font-semibold">Delegações (modo férias)</h1>

      {podeGerenciar && (
        <Card className="max-w-lg">
          <CardHeader>
            <CardTitle>Nova delegação</CardTitle>
            <CardDescription>
              O gerente passa a poder conduzir o fluxo adm (Recepcionado → Resolvido) na própria filial
              enquanto a delegação estiver ativa.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form action={formAction} className="flex flex-col gap-4">
              <div className="flex flex-col gap-2">
                <Label htmlFor="gerenteId">Gerente</Label>
                <Select name="gerenteId" required>
                  <SelectTrigger id="gerenteId">
                    <SelectValue placeholder="Selecione" />
                  </SelectTrigger>
                  <SelectContent>
                    {gerentes.map((g) => (
                      <SelectItem key={g.id} value={g.id}>
                        {g.nome_completo}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="flex flex-col gap-2">
                <Label htmlFor="fim">Término previsto (opcional)</Label>
                <Input id="fim" name="fim" type="date" />
              </div>

              {state.error && <p className="text-destructive text-sm">{state.error}</p>}

              <Button type="submit" disabled={isPending} className="w-fit">
                {isPending ? "Salvando..." : "Criar delegação"}
              </Button>
            </form>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardContent className="overflow-x-auto">
          {delegacoes.length === 0 ? (
            <p className="text-muted-foreground text-sm">Nenhuma delegação encontrada.</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-muted-foreground border-b text-left">
                  <th className="py-2 pr-4 font-medium">Gerente</th>
                  <th className="py-2 pr-4 font-medium">Adm master</th>
                  <th className="py-2 pr-4 font-medium">Início</th>
                  <th className="py-2 pr-4 font-medium">Fim</th>
                  <th className="py-2 pr-4 font-medium">Status</th>
                  {podeGerenciar && <th className="py-2 pr-4 font-medium">Ações</th>}
                </tr>
              </thead>
              <tbody>
                {delegacoes.map((d) => (
                  <tr key={d.id} className="border-b last:border-0">
                    <td className="py-2 pr-4">{d.gerenteNome}</td>
                    <td className="py-2 pr-4">{d.admNome}</td>
                    <td className="py-2 pr-4">{formatarDataHora(d.inicio)}</td>
                    <td className="py-2 pr-4">{d.fim ? formatarDataHora(d.fim) : "—"}</td>
                    <td className="py-2 pr-4">
                      <Badge variant={d.ativa ? "secondary" : "outline"}>
                        {d.ativa ? "Ativa" : "Encerrada"}
                      </Badge>
                    </td>
                    {podeGerenciar && (
                      <td className="py-2 pr-4">{d.ativa && <EncerrarBotao delegacaoId={d.id} />}</td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
