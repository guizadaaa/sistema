"use client";

import { useId, useMemo, useRef, useState } from "react";
import { Check, ChevronsUpDown, Search } from "lucide-react";

import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import {
  filtrarOpcoesVendedor,
  ROTULOS_GRUPO_VENDEDOR,
  rotuloVendedor,
  VENDEDOR_EX,
  VENDEDOR_SITE,
  type OpcaoVendedorBase,
} from "@/lib/clientes/vendedor-opcoes";

type Item = { valor: string; rotulo: string; detalhe?: string };

/**
 * Filtro "Vendedor" com busca. Grupos: Todos · Equipe atual (da loja
 * escolhida no formulário) · Ex-vendedores (todos) · Site / Internet. Os
 * ex-vendedores individuais só aparecem quando se digita parte do nome.
 * Grava o valor num input escondido "vendedor" (o formulário é GET).
 */
export function VendedorCombobox({ opcoes, valor }: { opcoes: OpcaoVendedorBase[]; valor?: string }) {
  const [aberto, setAberto] = useState(false);
  const [selecionado, setSelecionado] = useState(valor ?? "");
  const [termo, setTermo] = useState("");
  const [loja, setLoja] = useState<string | null>(null);
  const [ativo, setAtivo] = useState(0);
  const hiddenRef = useRef<HTMLInputElement>(null);
  const listaId = useId();

  const grupos = useMemo(() => filtrarOpcoesVendedor(opcoes, termo, loja), [opcoes, termo, loja]);

  const secoes: { titulo?: string; itens: Item[] }[] = [];
  if (grupos.todos) secoes.push({ itens: [{ valor: "", rotulo: "Todos" }] });
  if (grupos.atuais.length) {
    secoes.push({ titulo: loja ? `Equipe atual · ${loja}` : "Equipe atual", itens: grupos.atuais.map((o) => ({ valor: o.valor, rotulo: o.rotulo })) });
  }
  if (grupos.exTodos || grupos.exIndividuais.length) {
    secoes.push({
      titulo: "Ex-vendedores",
      itens: [
        ...(grupos.exTodos ? [{ valor: VENDEDOR_EX, rotulo: ROTULOS_GRUPO_VENDEDOR.ex }] : []),
        ...grupos.exIndividuais.map((o) => ({ valor: o.valor, rotulo: o.rotulo, detalhe: "ex-vendedor" })),
      ],
    });
  }
  if (grupos.site) secoes.push({ titulo: "Vendas pela internet", itens: [{ valor: VENDEDOR_SITE, rotulo: ROTULOS_GRUPO_VENDEDOR.site }] });
  const planos = secoes.flatMap((s) => s.itens);

  const escolher = (v: string) => {
    setSelecionado(v);
    setAberto(false);
    setTermo("");
  };

  return (
    <>
      <input ref={hiddenRef} type="hidden" name="vendedor" value={selecionado} />
      <Popover
        open={aberto}
        onOpenChange={(abrir) => {
          setAberto(abrir);
          if (abrir) {
            // Loja escolhida no mesmo formulário (ainda não enviado).
            const campo = hiddenRef.current?.form?.elements.namedItem("loja") as HTMLSelectElement | null;
            setLoja(campo?.value || null);
            setAtivo(0);
          }
        }}
      >
        <PopoverTrigger asChild>
          <button
            type="button"
            role="combobox"
            aria-expanded={aberto}
            aria-controls={listaId}
            aria-label="Vendedor"
            className="border-input dark:bg-input/30 flex h-9 w-56 items-center justify-between gap-2 rounded-md border bg-transparent px-3 text-left text-sm shadow-xs"
          >
            <span className="truncate">{rotuloVendedor(selecionado || undefined, opcoes)}</span>
            <ChevronsUpDown className="text-muted-foreground size-4 shrink-0" />
          </button>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-72 p-0">
          <div className="flex items-center gap-2 border-b px-3">
            <Search className="text-muted-foreground size-4" />
            <input
              autoFocus
              value={termo}
              onChange={(e) => {
                setTermo(e.target.value);
                setAtivo(0);
              }}
              onKeyDown={(e) => {
                if (e.key === "ArrowDown") {
                  e.preventDefault();
                  setAtivo((i) => Math.min(i + 1, planos.length - 1));
                } else if (e.key === "ArrowUp") {
                  e.preventDefault();
                  setAtivo((i) => Math.max(i - 1, 0));
                } else if (e.key === "Enter") {
                  e.preventDefault();
                  if (planos[ativo]) escolher(planos[ativo].valor);
                }
              }}
              placeholder="Buscar vendedor (inclui ex-vendedores)"
              aria-label="Buscar vendedor"
              className="placeholder:text-muted-foreground h-9 w-full bg-transparent text-sm outline-none"
            />
          </div>
          <div id={listaId} role="listbox" aria-label="Vendedores" className="max-h-80 overflow-y-auto p-1">
            {planos.length === 0 && <p className="text-muted-foreground px-2 py-3 text-sm">Nenhum vendedor com esse nome.</p>}
            {secoes.map((secao, si) => (
              <div key={secao.titulo ?? si} role="group" aria-label={secao.titulo}>
                {secao.titulo && <p className="text-muted-foreground px-2 pt-2 pb-1 text-xs font-medium">{secao.titulo}</p>}
                {secao.itens.map((item) => {
                  const indice = planos.indexOf(item);
                  return (
                    <button
                      key={item.valor || "todos"}
                      type="button"
                      role="option"
                      aria-selected={selecionado === item.valor}
                      onMouseEnter={() => setAtivo(indice)}
                      onClick={() => escolher(item.valor)}
                      className={cn(
                        "flex w-full items-center justify-between gap-2 rounded-sm px-2 py-1.5 text-left text-sm",
                        indice === ativo && "bg-accent text-accent-foreground"
                      )}
                    >
                      <span className="truncate">
                        {item.rotulo}
                        {item.detalhe && <span className="text-muted-foreground text-xs"> · {item.detalhe}</span>}
                      </span>
                      {selecionado === item.valor && <Check className="size-4 shrink-0" />}
                    </button>
                  );
                })}
              </div>
            ))}
            {!termo && <p className="text-muted-foreground border-t px-2 pt-2 pb-1 text-xs">Digite para achar um ex-vendedor específico.</p>}
          </div>
        </PopoverContent>
      </Popover>
    </>
  );
}
