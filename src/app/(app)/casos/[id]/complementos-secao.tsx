"use client";

import { useActionState } from "react";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import type { ComplementoComNome } from "@/lib/casos/detalhe";

import { adicionarComplementoAoCaso, type AdicionarComplementoState } from "./actions";

const initialState: AdicionarComplementoState = {};

export function ComplementosSecao({ casoId, complementos }: { casoId: string; complementos: ComplementoComNome[] }) {
  const adicionarAction = adicionarComplementoAoCaso.bind(null, casoId);
  const [state, formAction, isPending] = useActionState(adicionarAction, initialState);

  return (
    <div className="flex flex-col gap-3 border-t pt-4">
      <span className="text-sm font-medium">Comentários</span>

      {complementos.length === 0 ? (
        <p className="text-muted-foreground text-sm">
          Nenhum comentário registrado ainda — use o campo abaixo para registrar o andamento do caso (é preciso ao
          menos um comentário para marcar o caso como Resolvido).
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {complementos.map((c) => (
            <li key={c.id} className="rounded-md border p-2 text-sm">
              <p className="whitespace-pre-wrap">{c.texto}</p>
              <p className="text-muted-foreground mt-1 text-xs">
                {new Date(c.criado_em).toLocaleString("pt-BR")} · {c.criadoPorNome}
              </p>
            </li>
          ))}
        </ul>
      )}

      {/* key remonta o form (limpando o Textarea não controlado) sempre que
          um comentário novo chega via revalidatePath — mesma técnica de
          caso-form.tsx, aqui só precisando da contagem, não do state inteiro. */}
      <form key={complementos.length} action={formAction} className="flex flex-col gap-2">
        <Textarea
          name="texto"
          placeholder="Ex.: retornei o contato com o cliente, aguardando resposta do fornecedor"
          rows={3}
          required
        />
        {state.error && <p className="text-destructive text-sm">{state.error}</p>}
        <Button type="submit" disabled={isPending} className="w-fit">
          {isPending ? "Salvando..." : "Adicionar comentário"}
        </Button>
      </form>
    </div>
  );
}
