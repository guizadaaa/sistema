"use client";

import { useEffect, useId, useState, useTransition } from "react";
import Link from "next/link";
import { Megaphone, Save, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  atalhosEmbarque,
  atalhosRecompra,
  CAMPOS_FRASE,
  estadoFrase,
  filtrosParaQuery,
  mostraViagemFutura,
  segundoPeriodo,
  type Atalho,
  type Campanha,
  type ChaveFiltro,
  type FiltrosBase,
} from "@/lib/clientes/base-util";
import { TIPO_SERVICO_LABELS, TIPOS_SERVICO } from "@/lib/clientes/tipos-servico";
import { FILIAL_LABELS } from "@/lib/labels";
import type { OpcaoVendedorBase } from "@/lib/clientes/vendedor-opcoes";
import type { FilialCvc } from "@/lib/supabase/types";

import type { FiltroSalvo } from "@/lib/clientes/base";

import { VendedorCombobox } from "./vendedor-combobox";

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

function SelectTipo({
  name,
  valor,
  onChange,
  vazio = "Qualquer",
  nada = false,
  rotulo,
}: {
  name: string;
  valor?: string;
  onChange: (v: string) => void;
  vazio?: string;
  /** Opção "nada" (Recompra: não comprou nada). */
  nada?: boolean;
  rotulo: string;
}) {
  return (
    <select name={name} value={valor ?? ""} onChange={(e) => onChange(e.target.value)} className={`${campoSelect} w-32`} aria-label={rotulo}>
      <option value="">{vazio}</option>
      {nada && <option value="nada">nada</option>}
      {TIPOS_SERVICO.map((t) => (
        <option key={t} value={t}>
          {TIPO_SERVICO_LABELS[t]}
        </option>
      ))}
    </select>
  );
}

function Data({ name, valor, onChange, rotulo }: { name: string; valor?: string; onChange: (v: string) => void; rotulo: string }) {
  return <Input type="date" name={name} value={valor ?? ""} onChange={(e) => onChange(e.target.value)} className="w-36" aria-label={rotulo} />;
}

function Atalhos({ atalhos, aplicar, rotulo = "atalhos" }: { atalhos: Atalho[]; aplicar: (a: Atalho) => void; rotulo?: string }) {
  return (
    <span className="text-muted-foreground flex items-center gap-0.5 text-xs">
      · {rotulo}:
      {atalhos.map((a, i) => (
        <span key={a.rotulo} className="flex items-center">
          {i > 0 && "·"}
          <button type="button" className="hover:text-foreground px-1 underline-offset-2 hover:underline" onClick={() => aplicar(a)} data-atalho={a.rotulo}>
            {a.rotulo}
          </button>
        </span>
      ))}
    </span>
  );
}

/** Uma parte da frase por linha, sem quebrar no meio. */
function Linha({ children }: { children: React.ReactNode }) {
  return <div className="flex flex-nowrap items-center gap-2 overflow-x-auto whitespace-nowrap">{children}</div>;
}

/** Texto com sugestões (datalist) vindas do banco enquanto digita. */
function DestinoComSugestoes({
  name,
  valor,
  buscar,
  onChange,
  className = "w-40",
  rotulo,
}: {
  name: string;
  valor?: string;
  buscar: AcoesFiltros["buscarSugestoesDestino"];
  onChange: (v: string) => void;
  className?: string;
  rotulo: string;
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
        onChange={(e) => {
          setTermo(e.target.value);
          onChange(e.target.value);
        }}
        list={`${id}-destinos`}
        autoComplete="off"
        className={className}
        aria-label={rotulo}
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
  opcoesVendedor,
  salvos,
  acoes,
  hoje,
}: {
  filtros: FiltrosBase;
  /** Lojas que o usuário pode filtrar (só aparece com mais de uma). */
  lojas: FilialCvc[];
  opcoesVendedor: OpcaoVendedorBase[];
  salvos: FiltroSalvo[];
  acoes: AcoesFiltros;
  /** aaaa-mm-dd em São Paulo (atalhos e 2º período da Recompra). */
  hoje: string;
}) {
  const [campanha, setCampanha] = useState<Campanha>(filtros.camp === "recompra" ? "recompra" : "adicional");
  // A frase é controlada: o Filtrar e o "Só com viagem futura" dependem dela.
  const [frase, setFrase] = useState<FiltrosBase>(() =>
    Object.fromEntries([...CAMPOS_FRASE.adicional, ...CAMPOS_FRASE.recompra].map((c) => [c, filtros[c] ?? ""]))
  );
  const [erro, setErro] = useState<string | undefined>();
  const [pendente, startTransition] = useTransition();
  const query = filtrosParaQuery(filtros);
  const atual: FiltrosBase = { camp: campanha, ...Object.fromEntries(Object.entries(frase).filter(([, v]) => v)) };
  const estado = estadoFrase(atual);
  const campo = (chave: ChaveFiltro) => (v: string) => setFrase((f) => ({ ...f, [chave]: v }));
  // 1º período da Recompra escolhido: o 2º vai do dia seguinte até hoje (dá para trocar depois).
  const primeiroPeriodo = (de: string | undefined, ate: string | undefined) =>
    setFrase((f) => {
      const b = segundoPeriodo(ate, hoje);
      return { ...f, cr_a_de: de ?? f.cr_a_de, cr_a_ate: ate ?? f.cr_a_ate, ...(b ? { cr_b_de: b.de, cr_b_ate: b.ate } : {}) };
    });

  return (
    <form method="get" data-testid="filtros-base">
      <Card className="gap-0 py-0">
        <CardContent className="flex flex-col gap-3 border-b py-4">
          <div className="flex flex-wrap items-center gap-3 text-sm">
            <span className="flex items-center gap-1.5 font-medium">
              <Megaphone className="size-4" /> Campanha
            </span>
            {(
              [
                ["adicional", "Venda adicional"],
                ["recompra", "Recompra"],
              ] as const
            ).map(([valor, rotulo]) => (
              <label key={valor} className="flex items-center gap-1.5">
                <input type="radio" name="camp" value={valor} checked={campanha === valor} onChange={() => setCampanha(valor)} />
                {rotulo}
              </label>
            ))}
          </div>

          {campanha === "adicional" && (
            <div className="flex flex-col gap-2 text-sm" data-testid="campanha-adicional">
              <Linha>
                Comprou
                <SelectTipo name="ca_tipo" valor={frase.ca_tipo} onChange={campo("ca_tipo")} rotulo="comprou (tipo)" />
                para
                <DestinoComSugestoes name="ca_destino" valor={frase.ca_destino} onChange={campo("ca_destino")} buscar={acoes.buscarSugestoesDestino} rotulo="destino" />
              </Linha>
              <Linha>
                com embarque entre
                <Data name="ca_de" valor={frase.ca_de} onChange={campo("ca_de")} rotulo="embarque de" />e
                <Data name="ca_ate" valor={frase.ca_ate} onChange={campo("ca_ate")} rotulo="embarque até" />
                <Atalhos atalhos={atalhosEmbarque(hoje)} aplicar={(a) => setFrase((f) => ({ ...f, ca_de: a.de, ca_ate: a.ate }))} />
              </Linha>
              <Linha>
                e <strong>não comprou</strong>
                <SelectTipo name="ca_sem_tipo" valor={frase.ca_sem_tipo} onChange={campo("ca_sem_tipo")} vazio="—" rotulo="não comprou (tipo)" />
                na mesma viagem.
              </Linha>
            </div>
          )}

          {campanha === "recompra" && (
            <div className="flex flex-col gap-2 text-sm" data-testid="campanha-recompra">
              <Linha>
                Comprou
                <SelectTipo name="cr_tipo" valor={frase.cr_tipo} onChange={campo("cr_tipo")} rotulo="comprou (tipo)" />
                para
                <DestinoComSugestoes name="cr_destino" valor={frase.cr_destino} onChange={campo("cr_destino")} buscar={acoes.buscarSugestoesDestino} rotulo="destino" />
                entre
                <Data name="cr_a_de" valor={frase.cr_a_de} onChange={(v) => primeiroPeriodo(v, undefined)} rotulo="1º período de" />e
                <Data name="cr_a_ate" valor={frase.cr_a_ate} onChange={(v) => primeiroPeriodo(undefined, v)} rotulo="1º período até" />
                <Atalhos atalhos={atalhosRecompra(hoje)} aplicar={(a) => primeiroPeriodo(a.de, a.ate)} />
              </Linha>
              <Linha>
                e <strong>não comprou</strong>
                <SelectTipo name="cr_sem" valor={frase.cr_sem} onChange={campo("cr_sem")} vazio="—" nada rotulo="não comprou (tipo)" />
                <select
                  name="cr_mesmo_destino"
                  value={frase.cr_mesmo_destino ?? ""}
                  onChange={(e) => campo("cr_mesmo_destino")(e.target.value)}
                  className={campoSelect}
                  aria-label="destino do não comprou"
                >
                  <option value="">para qualquer destino</option>
                  <option value="1">para o mesmo destino</option>
                </select>
              </Linha>
              <Linha>
                entre
                <Data name="cr_b_de" valor={frase.cr_b_de} onChange={campo("cr_b_de")} rotulo="2º período de" />e
                <Data name="cr_b_ate" valor={frase.cr_b_ate} onChange={campo("cr_b_ate")} rotulo="2º período até" />
                <span className="text-muted-foreground text-xs">· padrão: do dia seguinte ao fim do 1º período até hoje</span>
              </Linha>
            </div>
          )}
        </CardContent>
        <CardContent className="flex flex-col gap-3 py-4">
          <div className="flex flex-wrap items-end gap-3" data-testid="bloco-baixo">
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
              <VendedorCombobox opcoes={opcoesVendedor} valor={filtros.vendedor} />
            </Campo>
            <Campo rotulo="Total do cliente (R$)">
              <div className="flex items-center gap-1">
                <Input type="number" min="0" step="0.01" name="total_de" defaultValue={filtros.total_de ?? ""} placeholder="de" className="w-24" aria-label="total de" />
                <Input type="number" min="0" step="0.01" name="total_ate" defaultValue={filtros.total_ate ?? ""} placeholder="até" className="w-24" aria-label="total até" />
              </div>
            </Campo>
            <Campo rotulo={estado === "vazia" ? "Valor da compra (R$)" : "Valor da compra do \"Comprou\" (R$)"}>
              <div className="flex items-center gap-1">
                <Input type="number" min="0" step="0.01" name="valor_de" defaultValue={filtros.valor_de ?? ""} placeholder="de" className="w-24" aria-label="valor de" />
                <Input type="number" min="0" step="0.01" name="valor_ate" defaultValue={filtros.valor_ate ?? ""} placeholder="até" className="w-24" aria-label="valor até" />
              </div>
            </Campo>
            {mostraViagemFutura(atual) && (
              <label className="flex h-9 items-center gap-2 text-sm">
                <input type="checkbox" name="futura" value="1" defaultChecked={filtros.futura === "1"} />
                Só com viagem futura
              </label>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button type="submit" disabled={estado === "incompleta"}>
              Filtrar
            </Button>
            {estado === "incompleta" && (
              <span className="text-muted-foreground text-sm" data-testid="dica-nao-comprou">
                escolha o que o cliente não comprou
              </span>
            )}
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
