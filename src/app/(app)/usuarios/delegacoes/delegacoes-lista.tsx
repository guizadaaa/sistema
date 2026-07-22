"use client";

import { useActionState, useMemo, useState, useTransition } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { statusDelegacao, type StatusDelegacao } from "@/lib/delegacoes/status";
import type { DelegacaoListada } from "@/lib/delegacoes/listar";

import {
  atualizarDelegacaoAgendada,
  cancelarDelegacaoAgendada,
  criarDelegacao,
  encerrarDelegacao,
  type CriarDelegacaoState,
  type EditarDelegacaoState,
} from "./actions";

const initialCriarState: CriarDelegacaoState = {};
const initialEditarState: EditarDelegacaoState = {};

const STATUS_CONFIG: Record<StatusDelegacao, { label: string; className: string }> = {
  agendada: { label: "Agendada", className: "border-amber-300 bg-amber-50 text-amber-800 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-400" },
  ativa: { label: "Ativa", className: "border-transparent bg-secondary text-secondary-foreground" },
  encerrada: { label: "Encerrada", className: "text-foreground" },
};

function formatarDataHora(iso: string) {
  return new Date(iso).toLocaleString("pt-BR");
}

/** "2026-08-01T00:00:00+00:00" -> "2026-08-01", direto na string (sem passar por Date, que reintroduziria deslocamento de fuso). */
function paraValorDeInput(iso: string) {
  return iso.slice(0, 10);
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

function CancelarBotao({ delegacaoId }: { delegacaoId: string }) {
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
            const resultado = await cancelarDelegacaoAgendada(delegacaoId);
            if (resultado.error) setErro(resultado.error);
          })
        }
      >
        {isPending ? "Cancelando..." : "Cancelar"}
      </Button>
      {erro && <p className="text-destructive text-sm">{erro}</p>}
    </div>
  );
}

function DelegacaoRow({
  delegacao,
  status,
  gerentes,
  podeGerenciar,
}: {
  delegacao: DelegacaoListada;
  status: StatusDelegacao;
  gerentes: { id: string; nome_completo: string }[];
  podeGerenciar: boolean;
}) {
  const [editando, setEditando] = useState(false);
  const editarAction = atualizarDelegacaoAgendada.bind(null, delegacao.id);
  const [state, formAction, isPending] = useActionState(editarAction, initialEditarState);

  if (editando) {
    return (
      <tr className="border-b last:border-0 align-top">
        <td className="py-2 pr-4" colSpan={podeGerenciar ? 6 : 5}>
          <form action={formAction} className="flex flex-wrap items-end gap-3">
            <div className="flex flex-col gap-2">
              <Label htmlFor={`gerenteId-${delegacao.id}`}>Gerente</Label>
              <Select name="gerenteId" defaultValue={delegacao.gerente_id} required>
                <SelectTrigger id={`gerenteId-${delegacao.id}`} className="w-48">
                  <SelectValue />
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
              <Label htmlFor={`inicio-${delegacao.id}`}>Início</Label>
              <Input
                id={`inicio-${delegacao.id}`}
                name="inicio"
                type="date"
                defaultValue={paraValorDeInput(delegacao.inicio)}
                required
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor={`fim-${delegacao.id}`}>Término</Label>
              <Input
                id={`fim-${delegacao.id}`}
                name="fim"
                type="date"
                defaultValue={delegacao.fim ? paraValorDeInput(delegacao.fim) : ""}
              />
            </div>
            <div className="flex flex-col gap-2">
              <div className="flex gap-2">
                <Button type="submit" size="sm" disabled={isPending}>
                  {isPending ? "Salvando..." : "Salvar"}
                </Button>
                <Button type="button" size="sm" variant="ghost" onClick={() => setEditando(false)} disabled={isPending}>
                  Cancelar edição
                </Button>
              </div>
              {state.error && <p className="text-destructive text-sm">{state.error}</p>}
            </div>
          </form>
        </td>
      </tr>
    );
  }

  return (
    <tr className="border-b last:border-0">
      <td className="py-2 pr-4">{delegacao.gerenteNome}</td>
      <td className="py-2 pr-4">{delegacao.admNome}</td>
      <td className="py-2 pr-4">{formatarDataHora(delegacao.inicio)}</td>
      <td className="py-2 pr-4">{delegacao.fim ? formatarDataHora(delegacao.fim) : "—"}</td>
      <td className="py-2 pr-4">
        <Badge className={STATUS_CONFIG[status].className}>{STATUS_CONFIG[status].label}</Badge>
      </td>
      {podeGerenciar && (
        <td className="py-2 pr-4">
          <div className="flex flex-wrap gap-2">
            {status === "agendada" && (
              <>
                <Button size="sm" variant="outline" onClick={() => setEditando(true)}>
                  Editar
                </Button>
                <CancelarBotao delegacaoId={delegacao.id} />
              </>
            )}
            {status === "ativa" && <EncerrarBotao delegacaoId={delegacao.id} />}
          </div>
        </td>
      )}
    </tr>
  );
}

function TabelaDelegacoes({
  titulo,
  delegacoesComStatus,
  gerentes,
  podeGerenciar,
  mensagemVazio,
}: {
  titulo: string;
  delegacoesComStatus: { delegacao: DelegacaoListada; status: StatusDelegacao }[];
  gerentes: { id: string; nome_completo: string }[];
  podeGerenciar: boolean;
  mensagemVazio: string;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{titulo}</CardTitle>
      </CardHeader>
      <CardContent className="overflow-x-auto">
        {delegacoesComStatus.length === 0 ? (
          <p className="text-muted-foreground text-sm">{mensagemVazio}</p>
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
              {delegacoesComStatus.map(({ delegacao, status }) => (
                <DelegacaoRow
                  key={delegacao.id}
                  delegacao={delegacao}
                  status={status}
                  gerentes={gerentes}
                  podeGerenciar={podeGerenciar}
                />
              ))}
            </tbody>
          </table>
        )}
      </CardContent>
    </Card>
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
  const [state, formAction, isPending] = useActionState(criarDelegacao, initialCriarState);

  const { atuais, historico } = useMemo(() => {
    const comStatus = delegacoes.map((delegacao) => ({ delegacao, status: statusDelegacao(delegacao) }));
    return {
      atuais: comStatus.filter((d) => d.status !== "encerrada"),
      historico: comStatus.filter((d) => d.status === "encerrada"),
    };
  }, [delegacoes]);

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-xl font-semibold">Delegações (modo férias)</h1>

      {podeGerenciar && (
        <Card className="max-w-lg">
          <CardHeader>
            <CardTitle>Nova delegação</CardTitle>
            <CardDescription>
              O gerente passa a poder conduzir o fluxo adm (Recepcionado → Resolvido) na própria filial
              enquanto a delegação estiver ativa. Deixe &ldquo;Início&rdquo; em branco para começar
              imediatamente, ou escolha uma data futura para agendar com antecedência (ex.: férias já
              programadas).
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

              <div className="grid grid-cols-2 gap-4">
                <div className="flex flex-col gap-2">
                  <Label htmlFor="inicio">Início (opcional)</Label>
                  <Input id="inicio" name="inicio" type="date" />
                </div>
                <div className="flex flex-col gap-2">
                  <Label htmlFor="fim">Término previsto (opcional)</Label>
                  <Input id="fim" name="fim" type="date" />
                </div>
              </div>

              {state.error && <p className="text-destructive text-sm">{state.error}</p>}

              <Button type="submit" disabled={isPending} className="w-fit">
                {isPending ? "Salvando..." : "Criar delegação"}
              </Button>
            </form>
          </CardContent>
        </Card>
      )}

      <TabelaDelegacoes
        titulo="Agendadas e ativas"
        delegacoesComStatus={atuais}
        gerentes={gerentes}
        podeGerenciar={podeGerenciar}
        mensagemVazio="Nenhuma delegação agendada ou ativa no momento."
      />

      <TabelaDelegacoes
        titulo="Histórico"
        delegacoesComStatus={historico}
        gerentes={gerentes}
        podeGerenciar={podeGerenciar}
        mensagemVazio="Nenhuma delegação encerrada ainda."
      />
    </div>
  );
}
