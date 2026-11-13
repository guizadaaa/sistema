"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { ChevronDown, ChevronRight, Copy, Download, MessageCircle, MessageSquareText } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { dataBr, filtrosParaQuery, linkWhatsapp, montarMensagem, type FiltrosBase } from "@/lib/clientes/base-util";
import type { ClienteBase, CompraCliente, ModeloMensagem } from "@/lib/clientes/base";
import { isTipoServico, TIPO_SERVICO_LABELS } from "@/lib/clientes/tipos-servico";
import { formatarMoeda } from "@/lib/formatacao";

export type AcoesLista = {
  buscarComprasCliente: (id: string) => Promise<{ compras?: CompraCliente[]; error?: string }>;
};

const moeda = (v: number | string | null | undefined) => (v === null || v === undefined ? "—" : formatarMoeda(Number(v)));

export function TiposBadges({ tipos }: { tipos: string[] }) {
  return (
    <span className="flex flex-wrap gap-1">
      {tipos.filter(isTipoServico).map((t) => (
        <Badge key={t} variant="secondary" data-testid="tipo">
          {TIPO_SERVICO_LABELS[t]}
        </Badge>
      ))}
    </span>
  );
}

function BotaoCopiar({ texto, rotulo, children }: { texto: string; rotulo: string; children?: React.ReactNode }) {
  const [copiado, setCopiado] = useState(false);
  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      className="h-7 px-2"
      aria-label={rotulo}
      title={rotulo}
      onClick={async () => {
        await navigator.clipboard.writeText(texto);
        setCopiado(true);
        setTimeout(() => setCopiado(false), 1500);
      }}
    >
      <Copy className="size-3.5" />
      {copiado ? "Copiado!" : children}
    </Button>
  );
}

function ComprasCliente({ compras }: { compras: CompraCliente[] }) {
  if (compras.length === 0) return <p className="text-muted-foreground text-sm">Nenhuma compra visível.</p>;
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm" data-testid="compras">
        <thead className="text-muted-foreground text-left text-xs">
          <tr className="border-b">
            <th className="py-1 pr-3 font-medium">Compra</th>
            <th className="py-1 pr-3 font-medium">Produto</th>
            <th className="py-1 pr-3 font-medium">Destino</th>
            <th className="py-1 pr-3 font-medium">Embarque → retorno</th>
            <th className="py-1 pr-3 font-medium">Tipos</th>
            <th className="py-1 pr-3 text-right font-medium">Valor</th>
            <th className="py-1 pr-3 font-medium">Recibo</th>
            <th className="py-1 pr-3 font-medium">Vendedor</th>
            <th className="py-1 font-medium">Loja</th>
          </tr>
        </thead>
        <tbody>
          {compras.map((c) => (
            <tr key={c.reserva} className="border-b last:border-0 align-top">
              <td className="py-1.5 pr-3 whitespace-nowrap">{dataBr(c.data_confirmacao) || "—"}</td>
              <td className="py-1.5 pr-3">
                <div className="font-medium">{c.descricao ?? c.tipo_produto ?? `Reserva ${c.reserva}`}</div>
                <div className="text-muted-foreground text-xs">
                  {c.tipo_produto && c.descricao ? `${c.tipo_produto} · ` : ""}reserva {c.reserva}
                </div>
              </td>
              <td className="py-1.5 pr-3">{[c.destino_cidade, c.destino_pais].filter(Boolean).join(" · ") || "—"}</td>
              <td className="py-1.5 pr-3 whitespace-nowrap">
                {dataBr(c.data_viagem) || "—"}
                {c.data_retorno && c.data_retorno !== c.data_viagem ? ` → ${dataBr(c.data_retorno)}` : ""}
              </td>
              <td className="py-1.5 pr-3">
                <TiposBadges tipos={c.tipos_servico} />
              </td>
              <td className="py-1.5 pr-3 text-right whitespace-nowrap">{moeda(c.valor)}</td>
              <td className="py-1.5 pr-3 whitespace-nowrap">{c.recibo ?? "—"}</td>
              <td className="py-1.5 pr-3">{c.vendedor ?? "—"}</td>
              <td className="py-1.5">{c.loja}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function LinhaCliente({
  cliente,
  mostrarCompraFiltro,
  modelo,
  acoes,
  abertoInicial = false,
  comprasIniciais,
}: {
  cliente: ClienteBase;
  mostrarCompraFiltro: boolean;
  modelo?: ModeloMensagem;
  acoes: AcoesLista;
  abertoInicial?: boolean;
  comprasIniciais?: CompraCliente[];
}) {
  const [aberto, setAberto] = useState(abertoInicial);
  const [compras, setCompras] = useState<CompraCliente[] | undefined>(comprasIniciais);
  const [erro, setErro] = useState<string | undefined>();
  const [carregando, startTransition] = useTransition();

  const alternar = () => {
    const abrir = !aberto;
    setAberto(abrir);
    if (abrir && !compras) {
      startTransition(async () => {
        const r = await acoes.buscarComprasCliente(cliente.cliente_id);
        if (r.error) setErro(r.error);
        else setCompras(r.compras ?? []);
      });
    }
  };

  const mensagem =
    modelo && modelo.texto.trim()
      ? montarMensagem(modelo.texto, {
          nome: cliente.nome,
          destino: cliente.compra_destino,
          vendedor: cliente.compra_vendedor,
          data_embarque: cliente.compra_embarque,
        })
      : null;

  return (
    <li className="rounded-lg border" data-testid="cliente">
      <div className="flex flex-wrap items-start gap-3 p-3">
        <button type="button" onClick={alternar} aria-expanded={aberto} aria-label={`${aberto ? "Recolher" : "Expandir"} ${cliente.nome}`}
          className="text-muted-foreground hover:text-foreground mt-0.5">
          {aberto ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}
        </button>
        <div className="flex min-w-0 flex-1 flex-col gap-1.5">
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" onClick={alternar} className="font-medium hover:underline">
              {cliente.nome}
            </button>
            {cliente.lojas.map((l) => (
              <Badge key={l} variant="outline">
                {l}
              </Badge>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
            {(cliente.telefones ?? []).length === 0 && <span className="text-muted-foreground">Sem telefone</span>}
            {(cliente.telefones ?? []).map((t) => {
              const wa = linkWhatsapp(t.numero);
              return (
                <span key={t.numero} className="inline-flex items-center gap-0.5">
                  <span>{t.numero}</span>
                  <BotaoCopiar texto={t.numero} rotulo={`Copiar ${t.numero}`} />
                  {wa && (
                    <Button asChild variant="ghost" size="sm" className="h-7 px-2 text-green-700 dark:text-green-400">
                      <a href={wa} target="_blank" rel="noopener noreferrer" aria-label={`WhatsApp ${t.numero}`} title="Abrir no WhatsApp">
                        <MessageCircle className="size-3.5" />
                      </a>
                    </Button>
                  )}
                </span>
              );
            })}
          </div>
          <div className="text-muted-foreground flex flex-wrap gap-x-4 gap-y-1 text-sm">
            <span>
              <strong className="text-foreground">{cliente.qtd_viagens}</strong> {cliente.qtd_viagens === 1 ? "viagem" : "viagens"}
            </span>
            <span>
              Total <strong className="text-foreground">{moeda(cliente.total_comprado)}</strong>
            </span>
            <span>Última compra {dataBr(cliente.ultima_compra) || "—"}</span>
            <span>
              Próxima viagem{" "}
              {cliente.proxima_viagem ? <strong className="text-foreground">{dataBr(cliente.proxima_viagem)}</strong> : "—"}
            </span>
          </div>
          <TiposBadges tipos={cliente.tipos} />
          {mostrarCompraFiltro && (
            <p className="bg-muted/60 rounded-md px-2 py-1 text-sm" data-testid="compra-filtro">
              Compra do filtro: <strong>{cliente.compra_destino ?? "—"}</strong> · embarque {dataBr(cliente.compra_embarque) || "—"}
              {cliente.compra_retorno ? ` → ${dataBr(cliente.compra_retorno)}` : ""} · {moeda(cliente.compra_valor)}
              {cliente.compra_vendedor ? ` · ${cliente.compra_vendedor}` : ""} · {cliente.compra_loja}
            </p>
          )}
        </div>
        {mensagem && (
          <BotaoCopiar texto={mensagem} rotulo={`Copiar mensagem para ${cliente.nome}`}>
            Copiar mensagem
          </BotaoCopiar>
        )}
      </div>
      {aberto && (
        <div className="border-t px-3 py-2">
          {carregando && <p className="text-muted-foreground text-sm">Carregando compras...</p>}
          {erro && <p className="text-destructive text-sm">{erro}</p>}
          {compras && <ComprasCliente compras={compras} />}
        </div>
      )}
    </li>
  );
}

export function ListaClientes({
  clientes,
  filtros,
  pagina,
  porPagina,
  modelos,
  acoes,
  expandido,
}: {
  clientes: ClienteBase[];
  filtros: FiltrosBase;
  pagina: number;
  porPagina: number;
  modelos: ModeloMensagem[];
  acoes: AcoesLista;
  /** Só para teste/visualização: cliente que já abre expandido. */
  expandido?: { clienteId: string; compras: CompraCliente[] };
}) {
  const [modeloId, setModeloId] = useState<string>(
    () => modelos.find((m) => m.chave === (filtros.camp === "recompra" ? "recompra" : "venda_adicional"))?.id ?? modelos[0]?.id ?? ""
  );
  const total = Number(clientes[0]?.total_clientes ?? 0);
  const soma = Number(clientes[0]?.soma_valores ?? 0);
  const paginas = Math.max(1, Math.ceil(total / porPagina));
  const modelo = modelos.find((m) => m.id === modeloId);
  const temFiltro = Object.keys(filtros).length > 0;

  return (
    <Card>
      <CardContent className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm" data-testid="resumo">
            <strong>{total.toLocaleString("pt-BR")}</strong> {total === 1 ? "cliente" : "clientes"} ·{" "}
            {temFiltro ? "compras do filtro" : "compras"} somam <strong>{formatarMoeda(soma)}</strong>
          </p>
          <div className="flex flex-wrap items-center gap-2">
            {modelos.length > 0 && (
              <label className="flex items-center gap-1.5 text-sm">
                <MessageSquareText className="size-4" /> Mensagem:
                <select value={modeloId} onChange={(e) => setModeloId(e.target.value)}
                  className="border-input h-8 rounded-md border bg-transparent px-2 text-sm" aria-label="Modelo de mensagem">
                  {modelos.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.titulo}
                      {m.texto.trim() ? "" : " (sem texto)"}
                    </option>
                  ))}
                </select>
              </label>
            )}
            <Button asChild variant="outline" size="sm">
              <a href={`/clientes/exportar?${filtrosParaQuery(filtros)}`} download>
                <Download className="size-4" /> Exportar CSV
              </a>
            </Button>
          </div>
        </div>

        {clientes.length === 0 ? (
          <p className="text-muted-foreground text-sm">Nenhum cliente com esses filtros.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {clientes.map((c) => (
              <LinhaCliente
                key={c.cliente_id}
                cliente={c}
                mostrarCompraFiltro={temFiltro}
                modelo={modelo}
                acoes={acoes}
                abertoInicial={expandido?.clienteId === c.cliente_id}
                comprasIniciais={expandido?.clienteId === c.cliente_id ? expandido.compras : undefined}
              />
            ))}
          </ul>
        )}

        {paginas > 1 && (
          <nav className="flex items-center justify-between text-sm">
            {pagina > 1 ? (
              <Link className="hover:underline" href={`/clientes?${filtrosParaQuery(filtros, { pagina: String(pagina - 1) })}`}>
                ← Anterior
              </Link>
            ) : (
              <span />
            )}
            <span className="text-muted-foreground">
              Página {pagina} de {paginas}
            </span>
            {pagina < paginas ? (
              <Link className="hover:underline" href={`/clientes?${filtrosParaQuery(filtros, { pagina: String(pagina + 1) })}`}>
                Próxima →
              </Link>
            ) : (
              <span />
            )}
          </nav>
        )}
      </CardContent>
    </Card>
  );
}
