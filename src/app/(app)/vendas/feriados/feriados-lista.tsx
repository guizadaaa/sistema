"use client";

import { useActionState, useState, useTransition } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import type { FeriadoLinha } from "@/lib/feriados/listar";
import { FILIAL_LABELS } from "@/lib/labels";
import { FILIAIS } from "@/lib/validation/caso";

import { excluirFeriado, salvarFeriado, type FeriadoFormState } from "./actions";

const campo = "border-input dark:bg-input/30 h-9 rounded-md border bg-transparent px-2 text-sm";
const ABRANGENCIA_LABEL = { nacional: "Nacional", estadual_PR: "Estadual (PR)", municipal: "Municipal" } as const;

function dataBr(iso: string) {
  const [a, m, d] = iso.split("-");
  return `${d}/${m}/${a}`;
}

function FormFeriado({ feriado, aoSalvar }: { feriado?: FeriadoLinha; aoSalvar?: () => void }) {
  const [state, action, pendente] = useActionState(async (prev: FeriadoFormState, fd: FormData) => {
    const r = await salvarFeriado(prev, fd);
    if (r.ok) aoSalvar?.();
    return r;
  }, {});
  return (
    <form action={action} className="flex flex-wrap items-end gap-2">
      {feriado && <input type="hidden" name="id" value={feriado.id} />}
      <Input type="date" name="data" defaultValue={feriado?.data} required className="w-40" aria-label="Data" />
      <Input name="nome" defaultValue={feriado?.nome} placeholder="Nome" required className="w-64" aria-label="Nome" />
      <select name="abrangencia" defaultValue={feriado?.abrangencia ?? "municipal"} className={campo} aria-label="Abrangência">
        {Object.entries(ABRANGENCIA_LABEL).map(([v, l]) => (
          <option key={v} value={v}>
            {l}
          </option>
        ))}
      </select>
      <select name="filial" defaultValue={feriado?.filial ?? ""} className={campo} aria-label="Filial">
        <option value="">Todas as filiais</option>
        {FILIAIS.map((f) => (
          <option key={f} value={f}>
            {FILIAL_LABELS[f]}
          </option>
        ))}
      </select>
      <label className="flex h-9 items-center gap-1.5 text-sm">
        <input type="checkbox" name="facultativo" value="1" defaultChecked={feriado?.facultativo} /> Ponto facultativo
      </label>
      <Button type="submit" size="sm" disabled={pendente}>
        {feriado ? "Salvar" : "Incluir"}
      </Button>
      {state.error && <span className="text-destructive text-sm">{state.error}</span>}
    </form>
  );
}

function LinhaFeriado({ feriado }: { feriado: FeriadoLinha }) {
  const [editando, setEditando] = useState(false);
  const [erro, setErro] = useState<string | undefined>();
  const [pendente, startTransition] = useTransition();
  if (editando) {
    return (
      <li className="rounded-md border p-2">
        <FormFeriado feriado={feriado} aoSalvar={() => setEditando(false)} />
        <Button type="button" variant="ghost" size="sm" onClick={() => setEditando(false)}>
          Cancelar
        </Button>
      </li>
    );
  }
  return (
    <li className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b py-1.5 text-sm last:border-0" data-testid="feriado-linha">
      <span className="w-24 tabular-nums">{dataBr(feriado.data)}</span>
      <span className="font-medium">{feriado.nome}</span>
      <Badge variant="outline">{ABRANGENCIA_LABEL[feriado.abrangencia]}</Badge>
      <span className="text-muted-foreground">{feriado.filial ? FILIAL_LABELS[feriado.filial] : "todas as filiais"}</span>
      {feriado.facultativo && <Badge variant="secondary">facultativo</Badge>}
      <span className="ml-auto flex gap-1">
        <Button type="button" variant="ghost" size="sm" onClick={() => setEditando(true)}>
          Editar
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="text-destructive"
          disabled={pendente}
          onClick={() =>
            window.confirm(`Excluir "${feriado.nome}" (${dataBr(feriado.data)})?`) &&
            startTransition(async () => setErro((await excluirFeriado(feriado.id)).error))
          }
        >
          Excluir
        </Button>
      </span>
      {erro && <span className="text-destructive w-full text-xs">{erro}</span>}
    </li>
  );
}

export function FeriadosLista({ feriados }: { feriados: FeriadoLinha[] }) {
  const anos = [...new Set(feriados.map((f) => f.data.slice(0, 4)))];
  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardHeader>
          <CardTitle>Incluir feriado</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-2">
          <p className="text-muted-foreground text-sm">
            Fins de semana, feriados e pontos facultativos não cobram importação no calendário (Vendas → Importar).
          </p>
          <FormFeriado />
        </CardContent>
      </Card>
      {anos.map((ano) => (
        <Card key={ano}>
          <CardHeader>
            <CardTitle>{ano}</CardTitle>
          </CardHeader>
          <CardContent>
            <ul>
              {feriados
                .filter((f) => f.data.startsWith(ano))
                .map((f) => (
                  <LinhaFeriado key={f.id} feriado={f} />
                ))}
            </ul>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
