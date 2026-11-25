"use client";

import { useState } from "react";

import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectSeparator, SelectTrigger, SelectValue } from "@/components/ui/select";
import { gruposVendedor, vendedorNaFilial, type CandidatoVendedor } from "@/lib/casos/opcoes-vendedor";
import { FILIAL_LABELS } from "@/lib/labels";
import type { FilialCvc } from "@/lib/supabase/types";

/**
 * Filial e Vendedor ligados: o Vendedor lista só quem cabe na Filial
 * escolhida (ativos da loja + "Outros com casos nesta filial") e volta para
 * "Todos" sozinho quando a Filial muda e o selecionado não existe na lista
 * nova. Sem select de Filial (gerente/vendedor), vale a filial do usuário.
 */
export function FiltroFilialVendedor({
  candidatos,
  filialInicial,
  vendedorInicial,
  mostrarFiltroFilial,
  filialFixa,
  filiais,
}: {
  candidatos: CandidatoVendedor[];
  filialInicial?: FilialCvc;
  vendedorInicial?: string;
  mostrarFiltroFilial: boolean;
  /** Filial do gerente/vendedor (sem select de Filial). */
  filialFixa?: FilialCvc;
  filiais: readonly FilialCvc[];
}) {
  const [filial, setFilial] = useState<FilialCvc | undefined>(filialInicial);
  const [vendedor, setVendedor] = useState(vendedorInicial ?? "todos");
  const filialEfetiva = mostrarFiltroFilial ? filial : filialFixa;
  const { grupos, outros } = gruposVendedor(candidatos, filialEfetiva);
  const selecionadoEmOutros = outros.some((o) => o.id === vendedor);
  const [verOutros, setVerOutros] = useState(selecionadoEmOutros);
  const outrosAbertos = verOutros || selecionadoEmOutros;

  return (
    <>
      {mostrarFiltroFilial && (
        <div className="flex flex-col gap-1">
          <label className="text-sm font-medium">Filial</label>
          <Select
            name="filial"
            value={filial ?? "todas"}
            onValueChange={(v) => {
              const nova = v === "todas" ? undefined : (v as FilialCvc);
              setFilial(nova);
              // Vendedor que não existe na lista da nova Filial volta para "Todos".
              if (vendedor !== "todos" && !vendedorNaFilial(candidatos, nova, vendedor)) setVendedor("todos");
              setVerOutros(false);
            }}
          >
            <SelectTrigger className="w-40" aria-label="Filial">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="todas">Todas</SelectItem>
              {filiais.map((f) => (
                <SelectItem key={f} value={f}>
                  {FILIAL_LABELS[f]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      <div className="flex flex-col gap-1">
        <label className="text-sm font-medium">Vendedor</label>
        <Select name="vendedor" value={vendedor} onValueChange={setVendedor}>
          <SelectTrigger className="w-56" aria-label="Vendedor">
            <SelectValue />
          </SelectTrigger>
          <SelectContent data-testid="opcoes-vendedor">
            <SelectItem value="todos">Todos</SelectItem>
            {grupos.map((g) => (
              <SelectGroup key={g.loja}>
                <SelectSeparator />
                <SelectLabel>{FILIAL_LABELS[g.loja]}</SelectLabel>
                {g.opcoes.map((o) => (
                  <SelectItem key={o.id} value={o.id}>
                    {o.nome}
                  </SelectItem>
                ))}
              </SelectGroup>
            ))}
            {outros.length > 0 && (
              <SelectGroup>
                <SelectSeparator />
                <button
                  type="button"
                  className="text-muted-foreground hover:text-foreground flex w-full items-center justify-between gap-2 px-2 py-1.5 text-left text-xs font-medium"
                  aria-expanded={outrosAbertos}
                  data-testid="outros-com-casos"
                  onPointerDown={(e) => e.preventDefault()}
                  onClick={() => setVerOutros((v) => !v)}
                >
                  Outros com casos nesta filial ({outros.length})
                  <span aria-hidden>{outrosAbertos ? "▾" : "▸"}</span>
                </button>
                {outrosAbertos &&
                  outros.map((o) => (
                    <SelectItem key={o.id} value={o.id}>
                      {o.nome} <span className="text-muted-foreground text-xs">· {o.etiqueta}</span>
                    </SelectItem>
                  ))}
              </SelectGroup>
            )}
          </SelectContent>
        </Select>
      </div>
    </>
  );
}
