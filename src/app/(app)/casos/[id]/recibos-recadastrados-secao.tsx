"use client";

import { useActionState, useState } from "react";

import { CampoNumeros14Digitos } from "@/components/campo-numeros-14-digitos";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { Database } from "@/lib/supabase/types";

import { adicionarRecibosAoCaso, type AdicionarContratoState } from "./actions";

type ReciboRecadastradoRow = Database["public"]["Tables"]["casos_recibos_recadastrados"]["Row"];

const initialState: AdicionarContratoState = {};

/** Só renderizada em casos de Recadastro — mesmo padrão de ContratosAdicionaisSecao. */
export function RecibosRecadastradosSecao({ casoId, recibos }: { casoId: string; recibos: ReciboRecadastradoRow[] }) {
  // Remonta o campo depois de cada envio para limpar as linhas já salvas.
  const [versao, setVersao] = useState(0);
  const [state, formAction, isPending] = useActionState(
    async (prev: AdicionarContratoState, formData: FormData) => {
      const resultado = await adicionarRecibosAoCaso(casoId, prev, formData);
      setVersao((v) => v + 1);
      return resultado;
    },
    initialState
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle>Recibos recadastrados</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {recibos.length === 0 ? (
          <p className="text-muted-foreground text-sm">Nenhum recibo recadastrado informado ainda.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {recibos.map((r) => (
              <li key={r.id} className="flex items-center justify-between gap-2 rounded-md border p-2">
                <span className="text-sm font-medium">{r.recibo_numero}</span>
                <span className="text-muted-foreground text-xs">{new Date(r.criado_em).toLocaleDateString("pt-BR")}</span>
              </li>
            ))}
          </ul>
        )}

        <form action={formAction} className="flex flex-col gap-3 border-t pt-4">
          <CampoNumeros14Digitos
            key={versao}
            name="reciboRecadastrado"
            titulo="Adicionar recibo"
            rotulo="Recibo"
            textoBotao="Adicionar"
          />
          <Button type="submit" disabled={isPending} className="w-fit" variant="outline">
            {isPending ? "Salvando..." : "Salvar recibos"}
          </Button>

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
