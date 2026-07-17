"use client";

import { useActionState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

import { solicitarRecuperacaoSenha, type EsqueciSenhaState } from "./actions";

const initialState: EsqueciSenhaState = {};

export function ForgotPasswordForm() {
  const [state, formAction, isPending] = useActionState(solicitarRecuperacaoSenha, initialState);

  if (state.enviado) {
    return (
      <p className="text-sm">
        Se houver uma conta com este e-mail, enviamos um link para redefinir a senha. Confira sua caixa de
        entrada.
      </p>
    );
  }

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <Label htmlFor="email">E-mail</Label>
        <Input id="email" name="email" type="email" autoComplete="email" required autoFocus />
      </div>

      {state.error && <p className="text-destructive text-sm">{state.error}</p>}

      <Button type="submit" disabled={isPending} className="mt-2">
        {isPending ? "Enviando..." : "Enviar link de recuperação"}
      </Button>
    </form>
  );
}
