"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useActionState, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
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
  const [ativo, setAtivo] = useState(linha.ativo);
  const sugerido = !linha.usuarioId && linha.sugestaoUsuarioId !== null && usuarioId === linha.sugestaoUsuarioId;

  return (
    <tr className="border-b align-top last:border-0">
      <td className="py-2 pr-4">
        <div className="flex flex-col gap-1">
          <span>{linha.nomeSystur}</span>
          {!linha.usuarioId && <Badge variant="outline" className="w-fit">Sem vínculo</Badge>}
        </div>
      </td>
      <td className="py-2 pr-4">{FILIAL_LABELS[linha.loja]}</td>
      <td className="py-2 pr-4" colSpan={3}>
        <form action={formAction} className="flex flex-wrap items-start gap-3">
          <input type="hidden" name="id" value={linha.id} />
          <input type="hidden" name="usuarioId" value={usuarioId} />
          <input type="hidden" name="ativo" value={ativo ? "1" : "0"} />
          <div className="flex flex-col gap-1">
            <Select value={usuarioId} onValueChange={setUsuarioId}>
              <SelectTrigger className="w-72" aria-label={`Usuário Aura de ${linha.nomeSystur}`}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="nenhum">Sem vínculo</SelectItem>
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
          <div className="flex items-center gap-2 pt-2">
            <Checkbox id={`ativo-${linha.id}`} checked={ativo} onCheckedChange={(v) => setAtivo(v === true)} />
            <Label htmlFor={`ativo-${linha.id}`} className="text-sm font-normal">
              Ativo
            </Label>
          </div>
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

function FiltroSemVinculo({ semVinculo }: { semVinculo: boolean }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  return (
    <div className="flex items-center gap-2">
      <Checkbox
        id="sem-vinculo"
        checked={semVinculo}
        onCheckedChange={(v) => {
          const params = new URLSearchParams(searchParams.toString());
          if (v === true) params.set("sem_vinculo", "1");
          else params.delete("sem_vinculo");
          const query = params.toString();
          router.push(query ? `${pathname}?${query}` : pathname);
        }}
      />
      <Label htmlFor="sem-vinculo" className="text-sm font-normal">
        Só sem vínculo
      </Label>
    </div>
  );
}

export function VendedoresSysturLista({
  linhas,
  usuarios,
  loja,
  semVinculo,
}: {
  linhas: LinhaMapeamentoSystur[];
  usuarios: UsuarioParaVinculo[];
  loja?: FilialCvc;
  semVinculo: boolean;
}) {
  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-xl font-semibold">Vendedores do Systur</h1>
      <p className="text-muted-foreground text-sm">
        Nomes que aparecem na lista de excursões do Systur (extensão Aura Conferência). Nome novo entra aqui sem vínculo;
        ao vincular, as reservas e recibos já recebidos com esse nome passam para o usuário.
      </p>

      <div className="flex flex-wrap items-center gap-4">
        <SeletorLoja loja={loja} />
        <FiltroSemVinculo semVinculo={semVinculo} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Mapeamento ({linhas.length})</CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          {linhas.length === 0 ? (
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
                {linhas.map((linha) => (
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
