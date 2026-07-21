"use client";

import { useActionState, useId, useState } from "react";
import { Plus, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { somenteDigitos } from "@/lib/validation/cpf";
import type { Database } from "@/lib/supabase/types";

import { adicionarContratosAoCaso, type AdicionarContratoState } from "./actions";

type ContratoAdicionalRow = Database["public"]["Tables"]["casos_contratos_adicionais"]["Row"];

function validarContratoAdicional(valor: string): string | undefined {
  if (valor.length === 0) return "Informe o número do contrato ou remova esta linha";
  if (valor.length < 14) return "Contrato deve ter exatamente 14 números";
  return undefined;
}

const initialState: AdicionarContratoState = {};

export function ContratosAdicionaisSecao({
  casoId,
  contratos,
}: {
  casoId: string;
  contratos: ContratoAdicionalRow[];
}) {
  const adicionarAction = adicionarContratosAoCaso.bind(null, casoId);
  const [state, formAction, isPending] = useActionState(adicionarAction, initialState);
  const [rows, setRows] = useState<string[]>([]);
  const [valores, setValores] = useState<Record<string, string>>({});
  const [erros, setErros] = useState<Record<string, string | undefined>>({});
  const idBase = useId();

  const adicionarRow = () => setRows((prev) => [...prev, `${idBase}-${prev.length}-${Date.now()}`]);
  const removerRow = (rowId: string) => {
    setRows((prev) => prev.filter((id) => id !== rowId));
    setValores((prev) => {
      const { [rowId]: _removido, ...resto } = prev;
      return resto;
    });
    setErros((prev) => {
      const { [rowId]: _removido, ...resto } = prev;
      return resto;
    });
  };

  const bloquearSeInvalido = (event: React.FormEvent<HTMLFormElement>) => {
    if (Object.values(erros).some(Boolean)) {
      event.preventDefault();
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Contratos adicionais</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {contratos.length === 0 ? (
          <p className="text-muted-foreground text-sm">Nenhum contrato adicional vinculado ainda.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {contratos.map((c) => (
              <li key={c.id} className="flex items-center justify-between gap-2 rounded-md border p-2">
                <span className="text-sm font-medium">{c.contrato_numero}</span>
                <span className="text-muted-foreground text-xs">
                  {new Date(c.criado_em).toLocaleDateString("pt-BR")}
                </span>
              </li>
            ))}
          </ul>
        )}

        <form action={formAction} onSubmit={bloquearSeInvalido} className="flex flex-col gap-3 border-t pt-4">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium">Adicionar contrato</span>
            <Button type="button" variant="outline" size="sm" onClick={adicionarRow}>
              <Plus /> Adicionar
            </Button>
          </div>

          {rows.map((rowId) => (
            <div key={rowId} className="grid grid-cols-[1fr_auto] items-start gap-2">
              <div className="flex flex-col gap-1">
                <Input
                  inputMode="numeric"
                  maxLength={14}
                  name="contratoAdicional"
                  placeholder="Número do contrato"
                  value={valores[rowId] ?? ""}
                  aria-invalid={Boolean(erros[rowId])}
                  onChange={(e) => {
                    const novoValor = somenteDigitos(e.target.value).slice(0, 14);
                    setValores((prev) => ({ ...prev, [rowId]: novoValor }));
                    setErros((prev) => ({ ...prev, [rowId]: validarContratoAdicional(novoValor) }));
                  }}
                />
                {erros[rowId] && <p className="text-destructive text-sm">{erros[rowId]}</p>}
              </div>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label="Remover contrato adicional"
                onClick={() => removerRow(rowId)}
              >
                <Trash2 />
              </Button>
            </div>
          ))}

          {rows.length > 0 && (
            <Button type="submit" disabled={isPending} className="w-fit">
              {isPending ? "Salvando..." : "Salvar contratos"}
            </Button>
          )}

          {state.avisos && (
            <ul className="text-destructive list-disc pl-4 text-sm">
              {state.avisos.map((aviso) => (
                <li key={aviso}>{aviso}</li>
              ))}
            </ul>
          )}
        </form>
      </CardContent>
    </Card>
  );
}
