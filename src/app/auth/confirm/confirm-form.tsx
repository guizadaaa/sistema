"use client";

import { useActionState } from "react";

import { Button } from "@/components/ui/button";

import { confirmarAcesso, type ConfirmarAcessoState } from "./actions";

const initialState: ConfirmarAcessoState = {};

export function ConfirmForm({
  tokenHash,
  type,
  next,
}: {
  tokenHash?: string;
  type?: string;
  next: string;
}) {
  const [state, formAction, isPending] = useActionState(confirmarAcesso, initialState);

  if (!tokenHash || !type) {
    return <p className="text-destructive text-sm">Link inválido ou incompleto. Peça um novo.</p>;
  }

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <input type="hidden" name="tokenHash" value={tokenHash} />
      <input type="hidden" name="type" value={type} />
      <input type="hidden" name="next" value={next} />

      {state.error && <p className="text-destructive text-sm">{state.error}</p>}

      <Button type="submit" disabled={isPending} className="w-full">
        {isPending ? "Confirmando..." : "Confirmar acesso"}
      </Button>
    </form>
  );
}
