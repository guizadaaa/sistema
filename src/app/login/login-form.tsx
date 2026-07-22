"use client";

import { useActionState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SESSAO_INATIVIDADE_MS, SESSAO_TIME_BOX_MS } from "@/lib/auth/sessao";

import { login, type LoginState } from "./actions";

// Deriva do valor configurado de fato em vez de escrever "30 minutos"/"12
// horas" fixo no texto — evita a mensagem mentir quando os valores de
// sessao.ts mudarem (já aconteceu: os de teste ficaram divergentes do texto).
function formatarDuracao(ms: number): string {
  const minutos = Math.round(ms / 60_000);
  if (minutos < 60) return `${minutos} minuto${minutos === 1 ? "" : "s"}`;
  const horas = Math.round(minutos / 60);
  return `${horas} hora${horas === 1 ? "" : "s"}`;
}

const ERRO_MENSAGENS: Record<string, string> = {
  conta_desativada: "Sua conta foi desativada. Fale com o administrador do sistema.",
  perfil_nao_encontrado: "Não encontramos um perfil vinculado a este login. Fale com o administrador.",
  link_invalido: "Este link expirou ou já foi usado. Solicite um novo.",
  sessao_expirada: `Sua sessão expirou após ${formatarDuracao(SESSAO_TIME_BOX_MS)}. Entre novamente.`,
  inatividade: `Sessão encerrada por inatividade (${formatarDuracao(SESSAO_INATIVIDADE_MS)}). Entre novamente.`,
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
