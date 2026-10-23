"use client";

import { useActionState, useState } from "react";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { FILIAL_LABELS } from "@/lib/labels";
import type { FilialCvc } from "@/lib/supabase/types";
import { FILIAIS } from "@/lib/validation/caso";

import { transferirLoja, type TransferirLojaState } from "./actions";

const initialState: TransferirLojaState = {};

export function TransferirLojaForm({
  usuarioId,
  nome,
  lojaAtual,
}: {
  usuarioId: string;
  nome: string;
  lojaAtual: FilialCvc;
}) {
  const [state, formAction, isPending] = useActionState(transferirLoja, initialState);
  const [lojaPara, setLojaPara] = useState<FilialCvc | "">("");
  const [observacao, setObservacao] = useState("");
  const [confirmando, setConfirmando] = useState(false);

  return (
    <div className="flex flex-col gap-3">
      <p className="text-muted-foreground text-sm">
        Hoje em {FILIAL_LABELS[lojaAtual]}. As vendas já feitas continuam na loja onde foram feitas: depois da
        transferência elas passam a ser da gerência dessa loja, e voltam para quem vendeu se a pessoa voltar
        para lá.
      </p>
      <div className="flex flex-wrap items-end gap-3">
        <div className="flex flex-col gap-1">
          <Label htmlFor="loja-para">Loja de destino</Label>
          <Select value={lojaPara} onValueChange={(v) => setLojaPara(v as FilialCvc)}>
            <SelectTrigger id="loja-para" className="w-56">
              <SelectValue placeholder="Selecione" />
            </SelectTrigger>
            <SelectContent>
              {FILIAIS.filter((f) => f !== lojaAtual).map((f) => (
                <SelectItem key={f} value={f}>
                  {FILIAL_LABELS[f]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor="observacao">Observação (opcional)</Label>
          <Input id="observacao" value={observacao} onChange={(e) => setObservacao(e.target.value)} className="w-72" />
        </div>
        <Button type="button" disabled={!lojaPara} onClick={() => setConfirmando(true)}>
          Transferir de loja
        </Button>
      </div>
      {state.error && <p className="text-destructive text-sm">{state.error}</p>}
      {state.ok && <p className="text-sm text-emerald-600 dark:text-emerald-500">Transferência registrada.</p>}

      <Dialog open={confirmando} onOpenChange={setConfirmando}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Transferir {nome}?</DialogTitle>
            <DialogDescription>
              De {FILIAL_LABELS[lojaAtual]} para {lojaPara ? FILIAL_LABELS[lojaPara] : "—"}. O vínculo do Linkly nos links
              de {lojaAtual} é encerrado (fica no histórico) e o posto fica sem vendedor até um novo ser atribuído.
            </DialogDescription>
          </DialogHeader>
          <form
            action={(formData) => {
              setConfirmando(false);
              formAction(formData);
            }}
            className="flex justify-end gap-2"
          >
            <input type="hidden" name="usuarioId" value={usuarioId} />
            <input type="hidden" name="lojaPara" value={lojaPara} />
            <input type="hidden" name="observacao" value={observacao} />
            <Button type="button" variant="ghost" onClick={() => setConfirmando(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={isPending}>
              {isPending ? "Transferindo..." : "Confirmar transferência"}
            </Button>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
