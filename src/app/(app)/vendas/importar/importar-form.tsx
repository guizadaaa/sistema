"use client";

import { useActionState } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { FILIAL_LABELS } from "@/lib/labels";
import { FILIAIS } from "@/lib/validation/caso";

import { importarVendas, type ImportarVendasState } from "./actions";

const initialState: ImportarVendasState = {};

export function ImportarForm() {
  const [state, formAction, isPending] = useActionState(importarVendas, initialState);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Importar vendas</CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-muted-foreground mb-4 text-sm">
          Envie o arquivo .xlsx da loja com todas as vendas do dia 1 do mês até a data do envio (cumulativo). Vendas
          já importadas (mesmo &ldquo;Venda Nº&rdquo;) são atualizadas, não duplicadas; vendas novas são adicionadas.
        </p>

        <form action={formAction} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1">
            <Label htmlFor="filial">Loja</Label>
            <Select name="filial" required>
              <SelectTrigger id="filial" className="w-48">
                <SelectValue placeholder="Selecione" />
              </SelectTrigger>
              <SelectContent>
                {FILIAIS.map((f) => (
                  <SelectItem key={f} value={f}>
                    {FILIAL_LABELS[f]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex flex-col gap-1">
            <Label htmlFor="arquivo">Arquivo (.xlsx)</Label>
            <Input id="arquivo" name="arquivo" type="file" accept=".xlsx" required />
          </div>

          {state.error && <p className="text-destructive text-sm">{state.error}</p>}

          {state.resultado && (
            <div className="flex flex-col gap-2 text-sm">
              <p>
                Importação concluída: <strong>{state.resultado.novas}</strong> nova(s),{" "}
                <strong>{state.resultado.atualizadas}</strong> atualizada(s).
              </p>
              {state.resultado.avisos.length > 0 && (
                <div className="rounded-md border border-amber-300 bg-amber-50 p-3 text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200">
                  <p className="font-medium">{state.resultado.avisos.length} linha(s) não importada(s):</p>
                  <ul className="mt-1 list-disc pl-5">
                    {state.resultado.avisos.map((aviso) => (
                      <li key={aviso}>{aviso}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}

          <Button type="submit" disabled={isPending} className="w-fit">
            {isPending ? "Importando..." : "Importar"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
