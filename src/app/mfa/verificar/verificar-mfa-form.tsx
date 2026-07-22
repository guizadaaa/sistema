"use client";

import { useActionState } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

import { verificarCodigoMfa, type ConfirmarMfaState } from "../actions";
import { SairLink } from "../sair-link";

const initialState: ConfirmarMfaState = {};

export function VerificarMfaForm({ factorId }: { factorId: string }) {
  const verificarAction = verificarCodigoMfa.bind(null, factorId, "/");
  const [state, formAction, isPending] = useActionState(verificarAction, initialState);

  return (
    <div className="flex min-h-svh items-center justify-center p-4">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle className="text-xl">Verificação em duas etapas</CardTitle>
          <CardDescription>Digite o código gerado pelo seu app autenticador.</CardDescription>
        </CardHeader>
        <CardContent>
          <form action={formAction} className="flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <Label htmlFor="codigo">Código</Label>
              <Input
                id="codigo"
                name="codigo"
                inputMode="numeric"
                maxLength={6}
                autoComplete="one-time-code"
                placeholder="000000"
                required
                autoFocus
              />
            </div>
            {state.error && <p className="text-destructive text-sm">{state.error}</p>}
            <Button type="submit" disabled={isPending} className="w-fit">
              {isPending ? "Verificando..." : "Confirmar"}
            </Button>
          </form>
          <div className="mt-3">
            <SairLink />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
