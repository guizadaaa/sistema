"use client";

import { useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { STATUS_LABELS } from "@/lib/labels";
import { proximosStatusValidos } from "@/lib/casos/status";
import type { StatusCaso } from "@/lib/supabase/types";

import { avancarStatus } from "./actions";

export function StatusAcoes({
  casoId,
  statusAtual,
  podeConduzirFluxo,
  ehAdmin,
}: {
  casoId: string;
  statusAtual: StatusCaso;
  podeConduzirFluxo: boolean;
  ehAdmin: boolean;
}) {
  const opcoes = proximosStatusValidos(statusAtual, ehAdmin);
  const [novoStatus, setNovoStatus] = useState<StatusCaso | "">("");
  const [erro, setErro] = useState<string | undefined>();
  const [isPending, startTransition] = useTransition();

  if (!podeConduzirFluxo && !ehAdmin) {
    return (
      <p className="text-muted-foreground text-sm">
        Somente o adm ou o gerente em delegação ativa pode avançar o status deste caso.
      </p>
    );
  }

  const confirmarAvanco = () => {
    if (!novoStatus) return;
    setErro(undefined);
    startTransition(async () => {
      const resultado = await avancarStatus(casoId, novoStatus);
      if (resultado.error) {
        setErro(resultado.error);
      } else {
        setNovoStatus("");
      }
    });
  };

  return (
    <div className="flex flex-col gap-3">
      {podeConduzirFluxo && opcoes.length > 0 && (
        <div className="flex items-end gap-2">
          <div className="flex flex-col gap-1">
            <span className="text-sm font-medium">Avançar status</span>
            <Select value={novoStatus} onValueChange={(v) => setNovoStatus(v as StatusCaso)}>
              <SelectTrigger className="w-56">
                <SelectValue placeholder="Selecione o próximo status" />
              </SelectTrigger>
              <SelectContent>
                {opcoes.map((s) => (
                  <SelectItem key={s} value={s}>
                    {STATUS_LABELS[s]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button onClick={confirmarAvanco} disabled={!novoStatus || isPending}>
            {isPending ? "Salvando..." : "Confirmar"}
          </Button>
        </div>
      )}

      {podeConduzirFluxo && opcoes.length === 0 && (
        <p className="text-muted-foreground text-sm">Nenhuma transição de status disponível no momento.</p>
      )}

      {erro && <p className="text-destructive text-sm">{erro}</p>}
    </div>
  );
}
