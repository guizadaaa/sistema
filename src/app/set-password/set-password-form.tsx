"use client";

import { useActionState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

import { definirSenha, type DefinirSenhaState } from "./actions";

const initialState: DefinirSenhaState = {};

export function SetPasswordForm() {
  const [state, formAction, isPending] = useActionState(definirSenha, initialState);

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <Label htmlFor="senha">Nova senha</Label>
        <Input id="senha" name="senha" type="password" autoComplete="new-password" required minLength={6} autoFocus />
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="confirmarSenha">Confirmar senha</Label>
        <Input
          id="confirmarSenha"
          name="confirmarSenha"
          type="password"
          autoComplete="new-password"
          required
          minLength={6}
        />
      </div>

      {state.error && <p className="text-destructive text-sm">{state.error}</p>}

      <Button type="submit" disabled={isPending} className="mt-2">
        {isPending ? "Salvando..." : "Definir senha e entrar"}
      </Button>
    </form>
  );
}
