"use client";

import { useActionState, useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { CategoriaMaterialApoio } from "@/lib/materiais-apoio/listar";

import {
  criarCategoriaMaterialApoio,
  excluirCategoriaMaterialApoio,
  renomearCategoriaMaterialApoio,
  type MaterialApoioFormState,
} from "./actions";

const initialState: MaterialApoioFormState = {};

function LinhaCategoria({ categoria }: { categoria: CategoriaMaterialApoio }) {
  const [renomeState, renomearAction, renomeando] = useActionState(renomearCategoriaMaterialApoio, initialState);
  const [erroExclusao, setErroExclusao] = useState<string | undefined>();
  const [excluindo, startExclusao] = useTransition();

  const excluir = () => {
    if (!window.confirm(`Excluir a categoria "${categoria.nome}"?`)) return;
    setErroExclusao(undefined);
    startExclusao(async () => {
      const resultado = await excluirCategoriaMaterialApoio(categoria.id);
      if (resultado.error) setErroExclusao(resultado.error);
    });
  };

  return (
    <li className="flex flex-col gap-1 rounded-md border p-2">
      {/* key pelo nome: depois de renomear, o input volta a refletir o valor salvo */}
      <form key={categoria.nome} action={renomearAction} className="flex flex-wrap items-center gap-2">
        <input type="hidden" name="id" value={categoria.id} />
        <Input
          name="nome"
          defaultValue={categoria.nome}
          aria-label={`Nome da categoria ${categoria.nome}`}
          className="w-64"
          required
        />
        <Button type="submit" size="sm" variant="outline" disabled={renomeando}>
          {renomeando ? "Salvando..." : "Renomear"}
        </Button>
        <Button type="button" size="sm" variant="ghost" className="text-destructive" onClick={excluir} disabled={excluindo}>
          {excluindo ? "Excluindo..." : "Excluir"}
        </Button>
      </form>
      {renomeState.error && <p className="text-destructive text-xs">{renomeState.error}</p>}
      {erroExclusao && <p className="text-destructive text-xs">{erroExclusao}</p>}
    </li>
  );
}

/** Só renderizada para adm_master — mesma regra da RLS de materiais_apoio_categorias. */
export function CategoriasSecao({ categorias }: { categorias: CategoriaMaterialApoio[] }) {
  const [versao, setVersao] = useState(0);
  const [state, formAction, isPending] = useActionState(async (prev: MaterialApoioFormState, formData: FormData) => {
    const resultado = await criarCategoriaMaterialApoio(prev, formData);
    if (resultado.ok) setVersao((v) => v + 1);
    return resultado;
  }, initialState);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Categorias</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <form key={versao} action={formAction} className="flex flex-wrap items-end gap-2">
          <div className="flex flex-col gap-1">
            <Label htmlFor="nova-categoria">Nova categoria</Label>
            <Input id="nova-categoria" name="nome" placeholder="Ex.: Manuais" className="w-64" required />
          </div>
          <Button type="submit" disabled={isPending}>
            {isPending ? "Criando..." : "Criar"}
          </Button>
        </form>
        {state.error && <p className="text-destructive text-sm">{state.error}</p>}

        {categorias.length === 0 ? (
          <p className="text-muted-foreground text-sm">Nenhuma categoria criada ainda.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {categorias.map((c) => (
              <LinhaCategoria key={c.id} categoria={c} />
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
