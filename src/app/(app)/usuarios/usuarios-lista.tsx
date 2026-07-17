"use client";

import { useActionState, useState, useTransition } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { FILIAL_LABELS, PERFIL_LABELS } from "@/lib/labels";
import type { UsuarioListado } from "@/lib/usuarios/listar";
import { FILIAIS_USUARIO, PERFIS_USUARIO } from "@/lib/validation/usuario";
import type { FilialCvc, PerfilUsuario } from "@/lib/supabase/types";

import { atualizarUsuario, convidarUsuario, type ConvidarUsuarioState } from "./actions";

const initialConvidarState: ConvidarUsuarioState = {};

function exigeFilial(perfil: PerfilUsuario) {
  return perfil === "vendedor" || perfil === "gerente";
}

function UsuarioRow({ usuario, podeEditar }: { usuario: UsuarioListado; podeEditar: boolean }) {
  const [editando, setEditando] = useState(false);
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
            <Button size="sm" variant="outline" onClick={() => setEditando(true)}>
              Editar
            </Button>
          </td>
        )}
      </tr>
    );
  }

  const salvar = () => {
    setErro(undefined);
    startTransition(async () => {
      const resultado = await atualizarUsuario(usuario.id, {
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
      <td className="py-2 pr-4">{usuario.nome_completo}</td>
      <td className="py-2 pr-4">{usuario.email}</td>
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
          <div className="flex gap-2">
            <Button size="sm" onClick={salvar} disabled={isPending}>
              {isPending ? "Salvando..." : "Salvar"}
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setEditando(false)} disabled={isPending}>
              Cancelar
            </Button>
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
                  <Label htmlFor="nomeCompleto">Nome completo</Label>
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
