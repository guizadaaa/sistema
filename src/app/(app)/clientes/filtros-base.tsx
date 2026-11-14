"use client";

import { useEffect, useId, useState, useTransition } from "react";
import Link from "next/link";
import { Megaphone, Save, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { filtrosParaQuery, type FiltrosBase } from "@/lib/clientes/base-util";
import { TIPO_SERVICO_LABELS, TIPOS_SERVICO } from "@/lib/clientes/tipos-servico";
import { FILIAL_LABELS } from "@/lib/labels";
import type { FilialCvc } from "@/lib/supabase/types";

import type { FiltroSalvo } from "@/lib/clientes/base";

export type AcoesFiltros = {
  buscarSugestoesDestino: (termo: string) => Promise<string[]>;
  salvarFiltroCliente: (nome: string, query: string) => Promise<{ error?: string }>;
  excluirFiltroCliente: (id: string) => Promise<{ error?: string }>;
};

const campoSelect =
  "border-input dark:bg-input/30 h-9 rounded-md border bg-transparent px-2 text-sm shadow-xs outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50";

function Campo({ rotulo, children, htmlFor }: { rotulo: string; children: React.ReactNode; htmlFor?: string }) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-sm font-medium" htmlFor={htmlFor}>
        {rotulo}
      </label>
      {children}
    </div>
  );
}

function SelectTipo({ name, valor, vazio = "Qualquer" }: { name: string; valor?: string; vazio?: string }) {
  return (
    <select name={name} defaultValue={valor ?? ""} className={`${campoSelect} w-36`} aria-label={name}>
      <option value="">{vazio}</option>
      {TIPOS_SERVICO.map((t) => (
        <option key={t} value={t}>
          {TIPO_SERVICO_LABELS[t]}
        </option>
      ))}
    </select>
  );
}

function Periodo({ prefixo, filtros, rotulo }: { prefixo: string; filtros: FiltrosBase; rotulo: string }) {
  const f = filtros as Record<string, string | undefined>;
  return (
    <Campo rotulo={rotulo}>
      <div className="flex items-center gap-1">
        <Input type="date" name={`${prefixo}_de`} defaultValue={f[`${prefixo}_de`] ?? ""} className="w-38" aria-label={`${rotulo} de`} />
        <span className="text-muted-foreground text-xs">até</span>
        <Input type="date" name={`${prefixo}_ate`} defaultValue={f[`${prefixo}_ate`] ?? ""} className="w-38" aria-label={`${rotulo} até`} />
      </div>
    </Campo>
  );
}

/** Texto com sugestões (datalist) vindas do banco enquanto digita. */
function DestinoComSugestoes({
  name,
  valor,
  buscar,
  className = "w-48",
}: {
  name: string;
  valor?: string;
  buscar: AcoesFiltros["buscarSugestoesDestino"];
  className?: string;
}) {
  const id = useId();
  const [termo, setTermo] = useState(valor ?? "");
  const [sugestoes, setSugestoes] = useState<string[]>([]);

  useEffect(() => {
    if (termo.trim().length < 2) return;
    let cancelado = false;
    const t = setTimeout(async () => {
      const lista = await buscar(termo);
      if (!cancelado) setSugestoes(lista);
    }, 250);
    return () => {
      cancelado = true;
      clearTimeout(t);
    };
  }, [termo, buscar]);

  return (
    <>
      <Input
        name={name}
        value={termo}
        onChange={(e) => setTermo(e.target.value)}
        list={`${id}-destinos`}
        placeholder="Ex.: orlando"
        autoComplete="off"
        className={className}
        aria-label={name}
      />
      <datalist id={`${id}-destinos`}>
        {sugestoes.map((s) => (
          <option key={s} value={s} />
        ))}
      </datalist>
    </>
  );
}

export function FiltrosBaseClientes({
  filtros,
  lojas,
  vendedores,
  salvos,
  acoes,
}: {
  filtros: FiltrosBase;
  /** Lojas que o usuário pode filtrar (só aparece com mais de uma). */
  lojas: FilialCvc[];
  vendedores: { vendedor: string; loja: string }[];
  salvos: FiltroSalvo[];
  acoes: AcoesFiltros;
}) {
  const [campanha, setCampanha] = useState(filtros.camp ?? "");
  const [erro, setErro] = useState<string | undefined>();
  const [pendente, startTransition] = useTransition();
  const query = filtrosParaQuery(filtros);
  const nomesVendedores = [...new Set(vendedores.map((v) => v.vendedor))];

  return (
    <form method="get" className="flex flex-col gap-4" data-testid="filtros-base">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Megaphone className="size-4" /> Campanha
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <div className="flex flex-wrap gap-3 text-sm">
            {[
              ["", "Nenhuma"],
              ["adicional", "Venda adicional"],
              ["recompra", "Recompra"],
            ].map(([valor, rotulo]) => (
              <label key={valor} className="flex items-center gap-1.5">
                <input type="radio" name="camp" value={valor} checked={campanha === valor} onChange={() => setCampanha(valor)} />
                {rotulo}
              </label>
            ))}
          </div>

          {campanha === "adicional" && (
            <div className="flex flex-wrap items-end gap-2 text-sm" data-testid="campanha-adicional">
              <span className="pb-2">Comprou</span>
              <SelectTipo name="ca_tipo" valor={filtros.ca_tipo} />
              <span className="pb-2">para</span>
              <DestinoComSugestoes name="ca_destino" valor={filtros.ca_destino} buscar={acoes.buscarSugestoesDestino} className="w-40" />
              <span className="pb-2">com embarque entre</span>
              <Input type="date" name="ca_de" defaultValue={filtros.ca_de ?? ""} className="w-38" aria-label="embarque de" />
              <span className="pb-2">e</span>
              <Input type="date" name="ca_ate" defaultValue={filtros.ca_ate ?? ""} className="w-38" aria-label="embarque até" />
              <span className="pb-2">e não comprou</span>
              <SelectTipo name="ca_sem_tipo" valor={filtros.ca_sem_tipo} vazio="—" />
              <span className="pb-2">para o mesmo destino na mesma viagem.</span>
            </div>
          )}

          {campanha === "recompra" && (
            <div className="flex flex-wrap items-end gap-2 text-sm" data-testid="campanha-recompra">
              <span className="pb-2">Comprou</span>
              <SelectTipo name="cr_tipo" valor={filtros.cr_tipo} />
              <span className="pb-2">para</span>
              <DestinoComSugestoes name="cr_destino" valor={filtros.cr_destino} buscar={acoes.buscarSugestoesDestino} className="w-40" />
              <span className="pb-2">entre</span>
              <Input type="date" name="cr_a_de" defaultValue={filtros.cr_a_de ?? ""} className="w-38" aria-label="período A de" />
              <span className="pb-2">e</span>
              <Input type="date" name="cr_a_ate" defaultValue={filtros.cr_a_ate ?? ""} className="w-38" aria-label="período A até" />
              <span className="pb-2">e não comprou</span>
              <select name="cr_escopo" defaultValue={filtros.cr_escopo ?? "nada"} className={campoSelect} aria-label="escopo">
                <option value="nada">nada</option>
                <option value="mesmo">nada daquele tipo/destino</option>
              </select>
              <span className="pb-2">entre</span>
              <Input type="date" name="cr_b_de" defaultValue={filtros.cr_b_de ?? ""} className="w-38" aria-label="período B de" />
              <span className="pb-2">e</span>
              <Input type="date" name="cr_b_ate" defaultValue={filtros.cr_b_ate ?? ""} className="w-38" aria-label="período B até" />
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardContent className="flex flex-col gap-3">
          <div className="flex flex-wrap items-end gap-3">
            {lojas.length > 1 && (
              <Campo rotulo="Loja">
                <select name="loja" defaultValue={filtros.loja ?? ""} className={`${campoSelect} w-44`} aria-label="loja">
                  <option value="">Todas</option>
                  {lojas.map((l) => (
                    <option key={l} value={l}>
                      {FILIAL_LABELS[l]}
                    </option>
                  ))}
                </select>
              </Campo>
            )}
            <Campo rotulo="Vendedor">
              <select name="vendedor" defaultValue={filtros.vendedor ?? ""} className={`${campoSelect} w-52`} aria-label="vendedor">
                <option value="">Todos</option>
                {nomesVendedores.map((v) => (
                  <option key={v} value={v}>
                    {v}
                  </option>
                ))}
              </select>
            </Campo>
            <Campo rotulo="Destino">
              <DestinoComSugestoes name="destino" valor={filtros.destino} buscar={acoes.buscarSugestoesDestino} />
            </Campo>
            <Campo rotulo="Tipo de serviço">
              <SelectTipo name="tipo" valor={filtros.tipo} vazio="Todos" />
            </Campo>
            <Campo rotulo="Valor da compra (R$)">
              <div className="flex items-center gap-1">
                <Input type="number" min="0" step="0.01" name="valor_de" defaultValue={filtros.valor_de ?? ""} placeholder="de" className="w-24" aria-label="valor de" />
                <Input type="number" min="0" step="0.01" name="valor_ate" defaultValue={filtros.valor_ate ?? ""} placeholder="até" className="w-24" aria-label="valor até" />
              </div>
            </Campo>
            <Campo rotulo="Total do cliente (R$)">
              <div className="flex items-center gap-1">
                <Input type="number" min="0" step="0.01" name="total_de" defaultValue={filtros.total_de ?? ""} placeholder="de" className="w-24" aria-label="total de" />
                <Input type="number" min="0" step="0.01" name="total_ate" defaultValue={filtros.total_ate ?? ""} placeholder="até" className="w-24" aria-label="total até" />
              </div>
            </Campo>
            <Periodo prefixo="embarque" filtros={filtros} rotulo="Embarque" />
            <Periodo prefixo="compra" filtros={filtros} rotulo="Data da compra" />
            <label className="flex h-9 items-center gap-2 text-sm">
              <input type="checkbox" name="futura" value="1" defaultChecked={filtros.futura === "1"} />
              Só com viagem futura
            </label>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button type="submit">Filtrar</Button>
            <Button asChild variant="ghost">
              <Link href="/clientes">Limpar</Link>
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={pendente || query === ""}
              onClick={() => {
                const nome = window.prompt("Nome do filtro");
                if (!nome) return;
                setErro(undefined);
                startTransition(async () => {
                  const r = await acoes.salvarFiltroCliente(nome, query);
                  if (r.error) setErro(r.error);
                });
              }}
            >
              <Save className="size-4" /> Salvar filtro
            </Button>
            {salvos.length > 0 && <span className="text-muted-foreground ml-2 text-sm">Salvos:</span>}
            {salvos.map((s) => (
              <span key={s.id} className="bg-muted inline-flex items-center gap-1 rounded-md px-2 py-1 text-sm">
                <Link href={`/clientes?${filtrosParaQuery(s.filtros)}`} className="hover:underline">
                  {s.nome}
                </Link>
                <button
                  type="button"
                  aria-label={`Excluir filtro ${s.nome}`}
                  className="text-muted-foreground hover:text-foreground"
                  onClick={() => window.confirm(`Excluir o filtro "${s.nome}"?`) && startTransition(async () => void (await acoes.excluirFiltroCliente(s.id)))}
                >
                  <X className="size-3" />
                </button>
              </span>
            ))}
            {erro && <span className="text-destructive text-sm">{erro}</span>}
          </div>
        </CardContent>
      </Card>
    </form>
  );
}
