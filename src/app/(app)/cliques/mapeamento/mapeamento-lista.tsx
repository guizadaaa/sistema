"use client";

import { useActionState, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { formatarDataBr } from "@/lib/formatacao";
import { FILIAL_LABELS } from "@/lib/labels";
import type { HistoricoVinculo, LinkComVendedorAtual } from "@/lib/linkly/mapeamento";
import { FILIAIS } from "@/lib/validation/caso";

import { atribuirVendedor, cadastrarLink, type AtribuirVendedorState, type CadastrarLinkState } from "./actions";

const initialCadastrarState: CadastrarLinkState = {};
const initialAtribuirState: AtribuirVendedorState = {};

function labelLoja(link: Pick<LinkComVendedorAtual, "tipo" | "filial">): string {
  return link.tipo === "vitrine" ? "Vitrine (todas as lojas)" : link.filial ? FILIAL_LABELS[link.filial] : "—";
}

function LinhaLink({ link }: { link: LinkComVendedorAtual }) {
  const [state, formAction, isPending] = useActionState(atribuirVendedor, initialAtribuirState);
  const [mostrarForm, setMostrarForm] = useState(false);

  return (
    <tr className="border-b align-top last:border-0">
      <td className="py-2 pr-4">{labelLoja(link)}</td>
      <td className="py-2 pr-4">
        <a href={link.shortUrl} target="_blank" rel="noreferrer" className="hover:underline">
          {link.shortUrl}
        </a>
      </td>
      <td className="py-2 pr-4">
        {link.tipo === "vitrine" ? (
          <span className="text-muted-foreground">—</span>
        ) : link.vendedorAtualId ? (
          <div className="flex flex-col">
            <span>{link.vendedorAtualNome}</span>
            <span className="text-muted-foreground text-xs">
              {link.vendedorAtualEmail} · desde {link.vigenteDesde ? formatarDataBr(link.vigenteDesde) : "—"}
            </span>
          </div>
        ) : (
          <Badge variant="outline">Sem vendedor atribuído</Badge>
        )}
      </td>
      <td className="py-2 pr-4">
        {link.tipo === "vendedor" && (
          <div className="flex flex-col gap-2">
            <Button type="button" variant="outline" size="sm" onClick={() => setMostrarForm((v) => !v)} className="w-fit">
              {link.vendedorAtualId ? "Trocar vendedor" : "Atribuir vendedor"}
            </Button>
            {mostrarForm && (
              <form action={formAction} className="flex flex-col gap-2 rounded-md border p-2">
                <input type="hidden" name="linkId" value={link.id} />
                <div className="flex flex-col gap-1">
                  <Label htmlFor={`email-${link.id}`} className="text-xs">
                    E-mail do vendedor
                  </Label>
                  <Input id={`email-${link.id}`} name="email" type="email" placeholder="vendedor@cvc.com.br" required />
                </div>
                <div className="flex flex-col gap-1">
                  <Label htmlFor={`data-${link.id}`} className="text-xs">
                    A partir de (opcional — padrão hoje)
                  </Label>
                  <Input id={`data-${link.id}`} name="vigenteDesde" type="date" />
                </div>
                {state.error && <p className="text-destructive text-xs">{state.error}</p>}
                <Button type="submit" size="sm" disabled={isPending} className="w-fit">
                  {isPending ? "Salvando..." : "Confirmar"}
                </Button>
              </form>
            )}
          </div>
        )}
      </td>
    </tr>
  );
}

export function MapeamentoLista({ links, historico }: { links: LinkComVendedorAtual[]; historico: HistoricoVinculo[] }) {
  const [state, formAction, isPending] = useActionState(cadastrarLink, initialCadastrarState);
  const [tipo, setTipo] = useState("vendedor");

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-xl font-semibold">Mapeamento de links (Linkly)</h1>

      <Card>
        <CardHeader>
          <CardTitle>Links cadastrados</CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          {links.length === 0 ? (
            <p className="text-muted-foreground text-sm">Nenhum link cadastrado ainda.</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-muted-foreground border-b text-left">
                  <th className="py-2 pr-4 font-medium">Loja</th>
                  <th className="py-2 pr-4 font-medium">URL curta</th>
                  <th className="py-2 pr-4 font-medium">Vendedor atual</th>
                  <th className="py-2 pr-4 font-medium">Ação</th>
                </tr>
              </thead>
              <tbody>
                {links.map((link) => (
                  <LinhaLink key={link.id} link={link} />
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Cadastrar novo link</CardTitle>
        </CardHeader>
        <CardContent>
          <form action={formAction} className="flex flex-col gap-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="flex flex-col gap-1">
                <Label htmlFor="tipo">Tipo</Label>
                <Select name="tipo" value={tipo} onValueChange={setTipo}>
                  <SelectTrigger id="tipo">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="vendedor">Vendedor (de uma loja)</SelectItem>
                    <SelectItem value="vitrine">Vitrine (QR comum às lojas)</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {tipo === "vendedor" && (
                <div className="flex flex-col gap-1">
                  <Label htmlFor="filial">Loja</Label>
                  <Select name="filial">
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
              )}
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="flex flex-col gap-1">
                <Label htmlFor="workspaceSecret">Workspace (nome do secret no Vault)</Label>
                <Input id="workspaceSecret" name="workspaceSecret" placeholder="Ex.: linkly_api_key_1730" required />
              </div>
              <div className="flex flex-col gap-1">
                <Label htmlFor="linklyLinkId">Identificador do link no Linkly</Label>
                <Input id="linklyLinkId" name="linklyLinkId" placeholder="Se não souber, repita a URL curta" required />
              </div>
            </div>

            <div className="flex flex-col gap-1">
              <Label htmlFor="shortUrl">URL curta</Label>
              <Input id="shortUrl" name="shortUrl" placeholder="https://linkly.link/2nlst9" required />
            </div>

            {state.error && <p className="text-destructive text-sm">{state.error}</p>}

            <Button type="submit" disabled={isPending} className="w-fit">
              {isPending ? "Salvando..." : "Cadastrar link"}
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Histórico de vínculos</CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          {historico.length === 0 ? (
            <p className="text-muted-foreground text-sm">Nenhum vínculo criado ainda.</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-muted-foreground border-b text-left">
                  <th className="py-2 pr-4 font-medium">Link</th>
                  <th className="py-2 pr-4 font-medium">Vendedor</th>
                  <th className="py-2 pr-4 font-medium">Período</th>
                </tr>
              </thead>
              <tbody>
                {historico.map((h) => (
                  <tr key={h.id} className="border-b last:border-0">
                    <td className="py-2 pr-4">{h.shortUrl}</td>
                    <td className="py-2 pr-4">
                      <div className="flex flex-col">
                        <span>{h.usuarioNome}</span>
                        <span className="text-muted-foreground text-xs">{h.usuarioEmail}</span>
                      </div>
                    </td>
                    <td className="py-2 pr-4">
                      {formatarDataBr(h.vigenteDesde)} — {h.vigenteAte ? formatarDataBr(h.vigenteAte) : "atual"}
                    </td>
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
