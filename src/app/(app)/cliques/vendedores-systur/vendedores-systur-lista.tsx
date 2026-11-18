"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useActionState, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { casaMostrar, contarPorMostrar, OPCOES_MOSTRAR, type MostrarMapeamento } from "@/lib/conferencia/mapeamento-grupos";
import type { LinhaMapeamentoSystur } from "@/lib/conferencia/mapeamento-systur";
import { agruparUsuariosParaVinculo, type UsuarioParaVinculo } from "@/lib/conferencia/usuarios-vinculo";
import { FILIAL_LABELS, PERFIL_LABELS } from "@/lib/labels";
import type { FilialCvc } from "@/lib/supabase/types";

import { SeletorLoja } from "../seletor-loja";
import { salvarVinculoSystur, vincularSugestoesFortes, type SalvarVinculoSysturState, type VincularSugestoesState } from "./actions";

const initialState: SalvarVinculoSysturState = {};
const initialLote: VincularSugestoesState = {};

function rotuloUsuario(u: UsuarioParaVinculo): string {
  return `${u.nome} · ${PERFIL_LABELS[u.perfil]}${u.filial ? ` ${u.filial}` : ""}`;
}

function ItensUsuarios({ usuarios }: { usuarios: UsuarioParaVinculo[] }) {
  return usuarios.map((u) => (
    <SelectItem key={u.id} value={u.id}>
      {rotuloUsuario(u)}
    </SelectItem>
  ));
}

function LinhaVendedor({ linha, usuarios }: { linha: LinhaMapeamentoSystur; usuarios: UsuarioParaVinculo[] }) {
  const [state, formAction, isPending] = useActionState(salvarVinculoSystur, initialState);
  const [usuarioId, setUsuarioId] = useState(linha.usuarioId ?? "nenhum");
  const grupos = agruparUsuariosParaVinculo(
    usuarios,
    linha.loja,
    linha.sugestoes.map((s) => s.usuarioId)
  );
  // "Outras lojas" começa recolhido — aberto se o selecionado estiver lá.
  const [verOutras, setVerOutras] = useState(() => grupos.outrasLojas.some((u) => u.id === usuarioId));
  const outrasVisivel = verOutras || grupos.outrasLojas.some((u) => u.id === usuarioId);
  const forte = linha.sugestoes.find((s) => s.forte);
  const nomeForte = forte ? usuarios.find((u) => u.id === forte.usuarioId)?.nome : null;

  return (
    <tr className="border-b align-top last:border-0" data-testid="linha-systur" data-nome={linha.nomeSystur}>
      <td className="py-2 pr-4">
        <div className="flex flex-col gap-1">
          <span className="flex flex-wrap items-center gap-1.5">
            {linha.nomeSystur}
            {linha.usuarioId && linha.vinculoOrigem === "automatico" && (
              <span
                className="text-muted-foreground rounded border px-1 text-[10px] leading-4"
                title="Vinculado automaticamente: nome igual ao de um único usuário ativo"
                data-testid="rotulo-automatico"
              >
                automático
              </span>
            )}
          </span>
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
                {grupos.sugeridos.length > 0 && (
                  <SelectGroup data-testid="grupo-sugeridos">
                    <SelectSeparator />
                    <SelectLabel>Sugeridos</SelectLabel>
                    <ItensUsuarios usuarios={grupos.sugeridos} />
                  </SelectGroup>
                )}
                {grupos.daLoja.length > 0 && (
                  <SelectGroup>
                    <SelectSeparator />
                    <SelectLabel>Loja {linha.loja}</SelectLabel>
                    <ItensUsuarios usuarios={grupos.daLoja} />
                  </SelectGroup>
                )}
                {grupos.outrasLojas.length > 0 && (
                  <SelectGroup>
                    <SelectSeparator />
                    <button
                      type="button"
                      className="text-muted-foreground hover:text-foreground flex w-full items-center justify-between px-2 py-1.5 text-left text-xs font-medium"
                      aria-expanded={outrasVisivel}
                      onPointerDown={(e) => e.preventDefault()}
                      onClick={() => setVerOutras((v) => !v)}
                    >
                      Outras lojas ({grupos.outrasLojas.length})
                      <span aria-hidden>{outrasVisivel ? "▾" : "▸"}</span>
                    </button>
                    {outrasVisivel && <ItensUsuarios usuarios={grupos.outrasLojas} />}
                  </SelectGroup>
                )}
                {grupos.administracao.length > 0 && (
                  <SelectGroup>
                    <SelectSeparator />
                    <SelectLabel>Administração</SelectLabel>
                    <ItensUsuarios usuarios={grupos.administracao} />
                  </SelectGroup>
                )}
              </SelectContent>
            </Select>
            {forte && nomeForte && usuarioId === "nenhum" && (
              <span className="text-muted-foreground text-xs">Sugestão: {nomeForte}</span>
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
          {forte && !linha.usuarioId && (
            <Button type="submit" size="sm" name="aceitar" value={forte.usuarioId} disabled={isPending}>
              Aceitar sugestão
            </Button>
          )}
          {state.error && <p className="text-destructive w-full text-xs">{state.error}</p>}
          {state.ok && !isPending && <p className="text-muted-foreground w-full text-xs">Salvo.</p>}
        </form>
      </td>
    </tr>
  );
}

type ItemLote = { id: string; nomeSystur: string; loja: FilialCvc; usuarioNome: string };

/** Confirmação com a lista antes de vincular (só sugestões fortes de nomes não bloqueados). */
function VincularSugestoesFortes({ itens }: { itens: ItemLote[] }) {
  const [aberto, setAberto] = useState(false);
  const [state, formAction, isPending] = useActionState(vincularSugestoesFortes, initialLote);

  return (
    <>
      <Button type="button" variant="outline" size="sm" disabled={itens.length === 0} onClick={() => setAberto(true)}>
        Vincular todas as sugestões fortes ({itens.length})
      </Button>
      {state.vinculados !== undefined && !isPending && (
        <span className="text-muted-foreground text-xs">{state.vinculados} nome(s) vinculado(s).</span>
      )}
      <Dialog open={aberto} onOpenChange={setAberto}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Vincular {itens.length} sugestões fortes?</DialogTitle>
            <DialogDescription>Cada nome do Systur passa para o usuário abaixo (vínculo manual).</DialogDescription>
          </DialogHeader>
          <form
            action={(fd) => {
              formAction(fd);
              setAberto(false);
            }}
            className="flex flex-col gap-3"
          >
            <ul className="max-h-80 overflow-y-auto text-sm" data-testid="lista-sugestoes-fortes">
              {itens.map((i) => (
                <li key={i.id} className="border-b py-1 last:border-0">
                  <input type="hidden" name="id" value={i.id} />
                  {i.nomeSystur} <span className="text-muted-foreground">({i.loja})</span> → <strong>{i.usuarioNome}</strong>
                </li>
              ))}
            </ul>
            {state.error && <p className="text-destructive text-xs">{state.error}</p>}
            <div className="flex justify-end gap-2">
              <Button type="button" variant="ghost" onClick={() => setAberto(false)}>
                Cancelar
              </Button>
              <Button type="submit" disabled={isPending}>
                Vincular {itens.length}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </>
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
  const nomePorId = new Map(usuarios.map((u) => [u.id, u.nome]));
  const fortes: ItemLote[] = linhas.flatMap((l) => {
    const forte = l.sugestoes.find((s) => s.forte);
    const usuarioNome = forte && nomePorId.get(forte.usuarioId);
    return !l.usuarioId && !l.vinculoBloqueado && usuarioNome ? [{ id: l.id, nomeSystur: l.nomeSystur, loja: l.loja, usuarioNome }] : [];
  });

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-xl font-semibold">Vendedores do Systur</h1>
      <p className="text-muted-foreground text-sm">
        Nomes que aparecem na lista de excursões do Systur (extensão Aura Conferência). Nome novo igual ao de um único
        usuário ativo é vinculado automaticamente; os demais entram sem vínculo. Ao vincular, as reservas e recibos já
        recebidos com esse nome passam para o usuário.
      </p>

      <div className="flex flex-wrap items-center gap-4">
        <SeletorLoja loja={loja} />
        <FiltroMostrar mostrar={mostrar} totais={totais} />
        <VincularSugestoesFortes itens={fortes} />
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
