"use client";

import { useState, useTransition } from "react";

import { Button } from "@/components/ui/button";

import { marcarCasoTeste } from "./actions";

export function CasoTesteAcoes({ casoId, casoTeste }: { casoId: string; casoTeste: boolean }) {
  const [erro, setErro] = useState<string | undefined>();
  const [isPending, startTransition] = useTransition();

  const alternar = () => {
    setErro(undefined);
    startTransition(async () => {
      const resultado = await marcarCasoTeste(casoId, !casoTeste);
      if (resultado.error) setErro(resultado.error);
    });
  };

  return (
    <div className="flex flex-col items-start gap-1">
      <Button size="sm" variant="outline" onClick={alternar} disabled={isPending}>
        {isPending ? "Salvando..." : casoTeste ? "Reverter categoria de teste" : "Marcar como caso de teste"}
      </Button>
      {erro && <p className="text-destructive text-sm">{erro}</p>}
    </div>
  );
}
