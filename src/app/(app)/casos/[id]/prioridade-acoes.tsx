"use client";

import { useState, useTransition } from "react";

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PRIORIDADES_DESC, SEM_GRAU } from "@/lib/casos/prioridade";
import type { GrauPrioridade } from "@/lib/supabase/types";

import { alterarPrioridade } from "./actions";

/** Select do grau de prioridade — só para admin e gerente da filial (o banco impõe). */
export function PrioridadeAcoes({ casoId, grau }: { casoId: string; grau: GrauPrioridade | null }) {
  const [erro, setErro] = useState<string | undefined>();
  const [pendente, iniciar] = useTransition();

  return (
    <div className="flex items-center gap-2">
      <Select
        value={grau ? String(grau) : ""}
        disabled={pendente}
        onValueChange={(valor) => {
          setErro(undefined);
          iniciar(async () => {
            const resultado = await alterarPrioridade(casoId, Number(valor));
            if (resultado.error) setErro(resultado.error);
          });
        }}
      >
        <SelectTrigger className="h-8 w-36" aria-label="Alterar prioridade" data-testid="select-prioridade">
          <SelectValue placeholder={SEM_GRAU} />
        </SelectTrigger>
        <SelectContent>
          {PRIORIDADES_DESC.map((p) => (
            <SelectItem key={p.grau} value={String(p.grau)}>
              {p.nome}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {pendente && <span className="text-muted-foreground text-xs">Salvando...</span>}
      {erro && <span className="text-destructive text-xs">{erro}</span>}
    </div>
  );
}
