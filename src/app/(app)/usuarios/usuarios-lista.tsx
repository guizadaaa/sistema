"use client";

import { useActionState, useState, useTransition } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { FILIAL_LABELS, PERFIL_LABELS } from "@/lib/labels";
import type { UsuarioListado } from "@/lib/usuarios/listar";
import { FILIAIS_USUARIO, PERFIS_USUARIO } from "@/lib/validation/usuario";
import type { FilialCvc, PerfilUsuario } from "@/lib/supabase/types";

import { atualizarUsuario, convidarUsuario, gerarLinkAcesso, type ConvidarUsuarioState } from "./actions";

const initialConvidarState: ConvidarUsuarioState = {};

function exigeFilial(perfil: PerfilUsuario) {
  return perfil === "vendedor" || perfil === "gerente";
}

function GerarLinkBotao({ usuarioId }: { usuarioId: string }) {
  const [link, setLink] = useState<string | undefined>();
  const [erro, setErro] = useState<string | undefined>();
  const [copiado, setCopiado] = useState(false);
  const [isPending, startTransition] = useTransition();

  const gerar = () => {
    setErro(undefined);
    setCopiado(false);
    startTransition(async () => {
      const resultado = await gerarLinkAcesso(usuarioId);
      if (resultado.error) {
        setErro(resultado.error);
      } else {
        setLink(resultado.link);
      }
    });
  };

  const copiar = async () => {
    if (!link) return;
    await navigator.clipboard.writeText(link);
    setCopiado(true);
  };

  return (
    <>
      <Button size="sm" variant="outline" onClick={gerar} disabled={isPending}>
        {isPending ? "Gerando..." : "Gerar link de acesso"}
      </Button>
      {erro && <p className="text-destructive text-sm">{erro}</p>}

      <Dialog open={link !== undefined} onOpenChange={(open) => !open && setLink(undefined)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Link de acesso gerado</DialogTitle>
            <DialogDescription>
              Envie por WhatsApp ou outro canal — a pessoa cai direto na tela de definir senha. Validade
              limitada; se expirar, gere um novo aqui.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-2">
            <Input readOnly value={link ?? ""} onFocus={(e) => e.currentTarget.select()} />
            <Button onClick={copiar} className="w-fit">
              {copiado ? "Copiado!" : "Copiar link"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

function ExcluirUsuarioBotao({ usuario }: { usuario: UsuarioListado }) {
  const [aberto, setAberto] = useState(false);
  const [erro, setErro] = useState<string | undefined>();
  const [isPending, startTransition] = useTransition();

  const confirmar = () => {
    setErro(undefined);
    startTransition(async () => {
      const resultado = await atualizarUsuario(usuario.id, {
        nomeCompleto: usuario.nome_completo,
        email: usuario.email,
        perfil: usuario.perfil,
        filial: usuario.filial,
        ativo: false,
      });
      if (resultado.error) {
        setErro(resultado.error);
      } else {
        setAberto(false);
      }
    });
  };

  return (
    <>
      <Button
        size="sm"
        variant="destructive"
        onClick={() => {
          setErro(undefined);
          setAberto(true);
        }}
      >
        Excluir
      </Button>
      <Dialog open={aberto} onOpenChange={setAberto}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Excluir {usuario.nome_completo}?</DialogTitle>
            <DialogDescription>
              É uma exclusão lógica: a pessoa fica marcada como inativa e perde o acesso ao sistema, mas nada
              é apagado — histórico e auditoria continuam preservados. Os casos que ela possuir são
              transferidos automaticamente: se for vendedor, vão para o gerente ativo da filial; se for
              gerente, vão para quem confirmar esta ação.
            </DialogDescription>
          </DialogHeader>
          {erro && <p className="text-destructive text-sm">{erro}</p>}
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setAberto(false)} disabled={isPending}>
              Cancelar
            </Button>
            <Button variant="destructive" onClick={confirmar} disabled={isPending}>
              {isPending ? "Excluindo..." : "Confirmar exclusão"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

function UsuarioRow({ usuario, podeEditar }: { usuario: UsuarioListado; podeEditar: boolean }) {
  const [editando, setEditando] = useState(false);
  const [nomeCompleto, setNomeCompleto] = useState(usuario.nome_completo);
  const [email, setEmail] = useState(usuario.email);
  const [perfil, setPerfil] = useState<PerfilUsuario>(usuario.perfil);
  const [filial, setFilial] = useState<FilialCvc | "">(usuario.filial ?? "");
  const [ativo, setAtivo] = useState(usuario.ativo);
  const [erro, setErro] = useState<string | undefined>();
  const [isPending, startTransition] = useTransition();

  if (!editando) {
    return (
      <tr className="border-b last:border-0">
        <td className="py-2 pr-4">{usuario.nome_completo}</td>
        <td className="py-2 pr-4">{usuario.email}</td>
        <td className="py-2 pr-4">{PERFIL_LABELS[usuario.perfil]}</td>
        <td className="py-2 pr-4">{usuario.filial ? FILIAL_LABELS[usuario.filial] : "—"}</td>
        <td className="py-2 pr-4">
          <Badge variant={usuario.ativo ? "secondary" : "outline"}>
            {usuario.ativo ? "Ativo" : "Inativo"}
          </Badge>
        </td>
        {podeEditar && (
          <td className="py-2 pr-4">
            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant="outline" onClick={() => setEditando(true)}>
                Editar
              </Button>
              <GerarLinkBotao usuarioId={usuario.id} />
            </div>
          </td>
        )}
      </tr>
    );
  }

  const salvar = () => {
    setErro(undefined);
    startTransition(async () => {
      const resultado = await atualizarUsuario(usuario.id, {
        nomeCompleto,
        email,
        perfil,
        filial: exigeFilial(perfil) ? filial || null : null,
        ativo,
      });
      if (resultado.error) {
        setErro(resultado.error);
      } else {
        setEditando(false);
      }
    });
  };

  return (
    <tr className="border-b last:border-0 align-top">
      <td className="py-2 pr-4">
        <Input value={nomeCompleto} onChange={(e) => setNomeCompleto(e.target.value)} className="min-w-40" />
      </td>
      <td className="py-2 pr-4">
        <Input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="min-w-48"
        />
      </td>
      <td className="py-2 pr-4">
        <Select value={perfil} onValueChange={(v) => setPerfil(v as PerfilUsuario)}>
          <SelectTrigger className="w-36">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {PERFIS_USUARIO.map((p) => (
              <SelectItem key={p} value={p}>
                {PERFIL_LABELS[p]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </td>
      <td className="py-2 pr-4">
        {exigeFilial(perfil) ? (
          <Select value={filial} onValueChange={(v) => setFilial(v as FilialCvc)}>
            <SelectTrigger className="w-32">
              <SelectValue placeholder="Selecione" />
            </SelectTrigger>
            <SelectContent>
              {FILIAIS_USUARIO.map((f) => (
                <SelectItem key={f} value={f}>
                  {FILIAL_LABELS[f]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : (
          <span className="text-muted-foreground text-sm">—</span>
        )}
      </td>
      <td className="py-2 pr-4">
        <Select value={ativo ? "true" : "false"} onValueChange={(v) => setAtivo(v === "true")}>
          <SelectTrigger className="w-28">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="true">Ativo</SelectItem>
            <SelectItem value="false">Inativo</SelectItem>
          </SelectContent>
        </Select>
      </td>
      <td className="py-2 pr-4">
        <div className="flex flex-col gap-2">
          <div className="flex flex-wrap gap-2">
            <Button size="sm" onClick={salvar} disabled={isPending}>
              {isPending ? "Salvando..." : "Salvar"}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                setNomeCompleto(usuario.nome_completo);
                setEmail(usuario.email);
                setPerfil(usuario.perfil);
                setFilial(usuario.filial ?? "");
                setAtivo(usuario.ativo);
                setErro(undefined);
                setEditando(false);
              }}
              disabled={isPending}
            >
              Cancelar
            </Button>
            {usuario.ativo && <ExcluirUsuarioBotao usuario={usuario} />}
          </div>
          {erro && <p className="text-destructive text-sm">{erro}</p>}
        </div>
      </td>
    </tr>
  );
}

export function UsuariosLista({
  usuarios,
  podeEditar,
}: {
  usuarios: UsuarioListado[];
  podeEditar: boolean;
}) {
  const [state, formAction, isPending] = useActionState(convidarUsuario, initialConvidarState);
  const [perfilConvite, setPerfilConvite] = useState<PerfilUsuario>("vendedor");

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-xl font-semibold">Gestão de Usuários</h1>

      {podeEditar && (
        <Card className="max-w-2xl">
          <CardHeader>
            <CardTitle>Convidar usuário</CardTitle>
            <CardDescription>
              Um e-mail de convite é enviado; o próprio usuário define a senha no primeiro acesso.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form action={formAction} className="flex flex-col gap-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="flex flex-col gap-2">
                  <Label htmlFor="nomeCompleto">Nome</Label>
                  <Input id="nomeCompleto" name="nomeCompleto" required />
                </div>
                <div className="flex flex-col gap-2">
                  <Label htmlFor="email">E-mail</Label>
                  <Input id="email" name="email" type="email" required />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="flex flex-col gap-2">
                  <Label htmlFor="perfil">Perfil</Label>
                  <Select
                    name="perfil"
                    value={perfilConvite}
                    onValueChange={(v) => setPerfilConvite(v as PerfilUsuario)}
                  >
                    <SelectTrigger id="perfil">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {PERFIS_USUARIO.map((p) => (
                        <SelectItem key={p} value={p}>
                          {PERFIL_LABELS[p]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                {exigeFilial(perfilConvite) && (
                  <div className="flex flex-col gap-2">
                    <Label htmlFor="filial">Filial</Label>
                    <Select name="filial" required>
                      <SelectTrigger id="filial">
                        <SelectValue placeholder="Selecione" />
                      </SelectTrigger>
                      <SelectContent>
                        {FILIAIS_USUARIO.map((f) => (
                          <SelectItem key={f} value={f}>
                            {FILIAL_LABELS[f]}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}
              </div>

              {state.error && <p className="text-destructive text-sm">{state.error}</p>}
              {state.sucesso && (
                <p className="text-sm text-emerald-600 dark:text-emerald-500">Convite enviado.</p>
              )}

              <Button type="submit" disabled={isPending} className="w-fit">
                {isPending ? "Enviando..." : "Enviar convite"}
              </Button>
            </form>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardContent className="overflow-x-auto">
          {usuarios.length === 0 ? (
            <p className="text-muted-foreground text-sm">Nenhum usuário encontrado.</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-muted-foreground border-b text-left">
                  <th className="py-2 pr-4 font-medium">Nome</th>
                  <th className="py-2 pr-4 font-medium">E-mail</th>
                  <th className="py-2 pr-4 font-medium">Perfil</th>
                  <th className="py-2 pr-4 font-medium">Filial</th>
                  <th className="py-2 pr-4 font-medium">Status</th>
                  {podeEditar && <th className="py-2 pr-4 font-medium">Ações</th>}
                </tr>
              </thead>
              <tbody>
                {usuarios.map((u) => (
                  <UsuarioRow key={u.id} usuario={u} podeEditar={podeEditar} />
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
