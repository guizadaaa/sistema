"use client";

import { useState, useTransition } from "react";
import { Pencil } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import type { ModeloMensagem } from "@/lib/clientes/base";

import { salvarModeloMensagem } from "./actions";

/** adm/adm_master: texto dos modelos usados em "Copiar mensagem". */
export function ModelosMensagem({ modelos }: { modelos: ModeloMensagem[] }) {
  const [aberto, setAberto] = useState(false);
  const [textos, setTextos] = useState(() => Object.fromEntries(modelos.map((m) => [m.id, m.texto])));
  const [mensagem, setMensagem] = useState<string | undefined>();
  const [pendente, startTransition] = useTransition();

  return (
    <>
      <Button type="button" variant="ghost" size="sm" onClick={() => setAberto(true)}>
        <Pencil className="size-4" /> Modelos de mensagem
      </Button>
      <Dialog open={aberto} onOpenChange={setAberto}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>Modelos de mensagem</DialogTitle>
            <DialogDescription>
              Variáveis: {"{nome}"}, {"{destino}"}, {"{vendedor}"} e {"{data_embarque}"} (da compra que casou no filtro).
            </DialogDescription>
          </DialogHeader>
          {modelos.map((m) => (
            <div key={m.id} className="flex flex-col gap-1">
              <label className="text-sm font-medium" htmlFor={`modelo-${m.id}`}>
                {m.titulo}
              </label>
              <Textarea id={`modelo-${m.id}`} rows={4} value={textos[m.id] ?? ""}
                onChange={(e) => setTextos((t) => ({ ...t, [m.id]: e.target.value }))} />
              <Button type="button" size="sm" className="w-fit" disabled={pendente}
                onClick={() => startTransition(async () => {
                  const r = await salvarModeloMensagem(m.id, textos[m.id] ?? "");
                  setMensagem(r.error ?? `${m.titulo}: salvo.`);
                })}>
                Salvar
              </Button>
            </div>
          ))}
          {mensagem && <p className="text-sm">{mensagem}</p>}
        </DialogContent>
      </Dialog>
    </>
  );
}
