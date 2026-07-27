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
            <p className="text-sm">
              Importação concluída: <strong>{state.resultado.novas}</strong> nova(s),{" "}
              <strong>{state.resultado.atualizadas}</strong> atualizada(s), {state.resultado.ignoradas} linha(s)
              ignorada(s) (rodapé/dados incompletos).
            </p>
          )}

          <Button type="submit" disabled={isPending} className="w-fit">
            {isPending ? "Importando..." : "Importar"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
