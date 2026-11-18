"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useActionState, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { casaMostrar, contarPorMostrar, OPCOES_MOSTRAR, type MostrarMapeamento } from "@/lib/conferencia/mapeamento-grupos";
import type { LinhaMapeamentoSystur, UsuarioParaVinculo } from "@/lib/conferencia/mapeamento-systur";
import { FILIAL_LABELS, PERFIL_LABELS } from "@/lib/labels";
import type { FilialCvc } from "@/lib/supabase/types";

import { SeletorLoja } from "../seletor-loja";
import { salvarVinculoSystur, type SalvarVinculoSysturState } from "./actions";

const initialState: SalvarVinculoSysturState = {};

function rotuloUsuario(u: UsuarioParaVinculo): string {
  return `${u.nome} · ${PERFIL_LABELS[u.perfil]}${u.filial ? ` ${u.filial}` : ""}`;
}

function LinhaVendedor({ linha, usuarios }: { linha: LinhaMapeamentoSystur; usuarios: UsuarioParaVinculo[] }) {
  const [state, formAction, isPending] = useActionState(salvarVinculoSystur, initialState);
  // Sem vínculo: já vem com a sugestão selecionada — o admin confirma em Salvar.
  const [usuarioId, setUsuarioId] = useState(linha.usuarioId ?? linha.sugestaoUsuarioId ?? "nenhum");
  const sugerido = !linha.usuarioId && linha.sugestaoUsuarioId !== null && usuarioId === linha.sugestaoUsuarioId;

  return (
    <tr className="border-b align-top last:border-0">
      <td className="py-2 pr-4">
        <div className="flex flex-col gap-1">
          <span>{linha.nomeSystur}</span>
          {linha.grupo === "site" && <Badge variant="outline" className="w-fit">Site / Internet</Badge>}
          {linha.grupo === "sem_vinculo" && (
            <Badge variant="outline" className="w-fit">
              {linha.usuarioId ? "Usuário inativo (ex-vendedor)" : "Sem vínculo"}
            </Badge>
          )}
          {linha.pareceAtivo && <span className="text-muted-foreground text-xs">Parece usuário ativo</span>}
        </div>
      </td>
      <td className="py-2 pr-4">{FILIAL_LABELS[linha.loja]}</td>
      <td className="py-2 pr-4" colSpan={3}>
        <form action={formAction} className="flex flex-wrap items-start gap-3">
          <input type="hidden" name="id" value={linha.id} />
          <input type="hidden" name="usuarioId" value={usuarioId} />
          <div className="flex flex-col gap-1">
            <Select value={usuarioId} onValueChange={setUsuarioId}>
              <SelectTrigger className="w-72" aria-label={`Usuário Aura de ${linha.nomeSystur}`}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="nenhum">Sem vínculo</SelectItem>
                {linha.usuarioId && !usuarios.some((u) => u.id === linha.usuarioId) && (
                  // Vinculado a usuário inativo (ex-vendedor): continua visível para trocar ou desvincular.
                  <SelectItem value={linha.usuarioId}>{linha.usuarioNome ?? "Usuário"} · inativo</SelectItem>
                )}
                {usuarios.map((u) => (
                  <SelectItem key={u.id} value={u.id}>
                    {rotuloUsuario(u)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {sugerido && (
              <span className="text-muted-foreground text-xs">
                Sugestão pelo nome{linha.sugestaoOrigem === "linkly" ? " (já mapeado no Linkly)" : ""} — confirme em Salvar.
              </span>
            )}
          </div>
          <Input
            name="loginSystur"
            defaultValue={linha.loginSystur ?? ""}
            placeholder="Login Systur"
            className="w-36"
            aria-label={`Login Systur de ${linha.nomeSystur}`}
          />
          <Button type="submit" size="sm" variant="outline" disabled={isPending}>
            {isPending ? "Salvando..." : "Salvar"}
          </Button>
          {state.error && <p className="text-destructive w-full text-xs">{state.error}</p>}
          {state.ok && !isPending && <p className="text-muted-foreground w-full text-xs">Salvo.</p>}
        </form>
      </td>
    </tr>
  );
}

function FiltroMostrar({ mostrar, totais }: { mostrar: MostrarMapeamento; totais: Record<MostrarMapeamento, number> }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  return (
    <div className="flex items-center gap-2">
      <Label htmlFor="mostrar" className="text-sm">
        Mostrar
      </Label>
      <Select
        value={mostrar}
        onValueChange={(v) => {
          const params = new URLSearchParams(searchParams.toString());
          params.delete("parecem");
          params.delete("sem_vinculo");
          if (v === "atual") params.delete("mostrar");
          else params.set("mostrar", v);
          const query = params.toString();
          router.push(query ? `${pathname}?${query}` : pathname);
        }}
      >
        <SelectTrigger id="mostrar" className="w-64">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {OPCOES_MOSTRAR.map((o) => (
            <SelectItem key={o.valor} value={o.valor}>
              {o.rotulo} ({totais[o.valor]})
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

export function VendedoresSysturLista({
  linhas,
  usuarios,
  loja,
  mostrar,
}: {
  /** Todos os nomes da loja; o filtro Mostrar é aplicado aqui (com os totais de cada opção). */
  linhas: LinhaMapeamentoSystur[];
  usuarios: UsuarioParaVinculo[];
  loja?: FilialCvc;
  mostrar: MostrarMapeamento;
}) {
  const totais = contarPorMostrar(linhas);
  const visiveis = linhas.filter((l) => casaMostrar(l, mostrar));
  const rotulo = OPCOES_MOSTRAR.find((o) => o.valor === mostrar)?.rotulo ?? "";

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-xl font-semibold">Vendedores do Systur</h1>
      <p className="text-muted-foreground text-sm">
        Nomes que aparecem na lista de excursões do Systur (extensão Aura Conferência). Nome novo entra aqui sem vínculo;
        ao vincular, as reservas e recibos já recebidos com esse nome passam para o usuário.
      </p>

      <div className="flex flex-wrap items-center gap-4">
        <SeletorLoja loja={loja} />
        <FiltroMostrar mostrar={mostrar} totais={totais} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>
            {rotulo} ({visiveis.length})
          </CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          {visiveis.length === 0 ? (
            <p className="text-muted-foreground text-sm">Nenhum nome encontrado com estes filtros.</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-muted-foreground border-b text-left">
                  <th className="py-2 pr-4 font-medium">Nome no Systur</th>
                  <th className="py-2 pr-4 font-medium">Loja</th>
                  <th className="py-2 pr-4 font-medium">Usuário Aura</th>
                  <th className="py-2 pr-4 font-medium">Login Systur</th>
                  <th className="py-2 pr-4 font-medium"></th>
                </tr>
              </thead>
              <tbody>
                {visiveis.map((linha) => (
                  <LinhaVendedor key={`${linha.id}-${linha.usuarioId ?? ""}`} linha={linha} usuarios={usuarios} />
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
