"use client";

import { useActionState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

import { login, type LoginState } from "./actions";

const ERRO_MENSAGENS: Record<string, string> = {
  conta_desativada: "Sua conta foi desativada. Fale com o administrador do sistema.",
  perfil_nao_encontrado: "Não encontramos um perfil vinculado a este login. Fale com o administrador.",
  link_invalido: "Este link expirou ou já foi usado. Solicite um novo.",
  sessao_expirada: "Sua sessão expirou após 12 horas. Entre novamente.",
  inatividade: "Sessão encerrada por inatividade (30 minutos). Entre novamente.",
};

const initialState: LoginState = {};

export function LoginForm() {
  const searchParams = useSearchParams();
  const redirectTo = searchParams.get("redirectTo") ?? "";
  const erroQuery = searchParams.get("erro");

  const [state, formAction, isPending] = useActionState(login, initialState);

  const mensagemErro = state.error ?? (erroQuery ? ERRO_MENSAGENS[erroQuery] : undefined);

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <input type="hidden" name="redirectTo" value={redirectTo} />

      <div className="flex flex-col gap-2">
        <Label htmlFor="email">E-mail</Label>
        <Input id="email" name="email" type="email" autoComplete="email" required autoFocus />
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="senha">Senha</Label>
        <Input id="senha" name="senha" type="password" autoComplete="current-password" required minLength={6} />
      </div>

      {mensagemErro && <p className="text-destructive text-sm">{mensagemErro}</p>}

      <Button type="submit" disabled={isPending} className="mt-2">
        {isPending ? "Entrando..." : "Entrar"}
      </Button>

      <Link href="/forgot-password" className="text-muted-foreground text-center text-sm hover:underline">
        Esqueci minha senha
      </Link>
    </form>
  );
}
