import "server-only";

import { diasAteVencimento, situacaoPrazoVigencia } from "@/lib/casos/prazo";
import { TIPOS_CASO } from "@/lib/validation/caso";
import { createClient } from "@/lib/supabase/server";
import type { FilialCvc, QuemPagaMulta, StatusCaso, TipoCaso } from "@/lib/supabase/types";

export const STATUS_ORDEM: readonly StatusCaso[] = [
  "inicial",
  "recepcionado",
  "em_andamento_interno",
  "reavaliacao",
  "resolvido",
  "ouvidoria",
];

export type TipoMaisComumPorFilial = {
  filial: FilialCvc;
  tipo: TipoCaso;
  quantidade: number;
};

export type TipoMaisComumPorVendedor = {
  vendedorId: string;
  vendedorNome: string;
  tipo: TipoCaso;
  totalCasos: number;
};

export type CasoAtencaoPrazo = {
  id: string;
  protocolo: number;
  clienteNome: string;
  vendedorNome: string;
  prazoVigencia: string;
  situacao: "vencido" | "vencendo";
};

export type MetricasPainel = {
  total: number;
  porStatus: Record<StatusCaso, number>;
  porTipo: Record<TipoCaso, number>;
  /** Só populado quando há mais de uma filial nos dados (perfil admin). */
  tipoMaisComumPorFilial: TipoMaisComumPorFilial[];
  tipoMaisComumPorVendedor: TipoMaisComumPorVendedor[];
  prazoVencidos: number;
  prazoVencendo: number;
  /** Vencidos primeiro (mais atrasado primeiro), depois vencendo (mais próximo primeiro). */
  casosAtencaoPrazo: CasoAtencaoPrazo[];
  multaTotal: number;
  multaPorQuemPaga: Record<QuemPagaMulta, number>;
  /** Natureza diferente de multa contratual — nunca somada junto (confirmado com o cliente). */
  taxasRemarcacao: { taxas: number; diferencaTarifaria: number };
};

export type FiltrosPainel = {
  filial?: FilialCvc;
  vendedorId?: string;
};

export type VendedorOpcao = { id: string; nome: string };

/**
 * Opções pro filtro de vendedor — RLS de usuarios (usuarios_select_admin /
 * usuarios_select_filial_gerente) já restringe a lista à filial de quem
 * consulta quando é gerente; passar filial explicitamente só importa pro
 * admin, que enxerga todas.
 */
export async function listarVendedoresParaFiltro(filial?: FilialCvc): Promise<VendedorOpcao[]> {
  const supabase = await createClient();

  let query = supabase.from("usuarios").select("id, nome_completo").eq("perfil", "vendedor").order("nome_completo");
  if (filial) query = query.eq("filial", filial);

  const { data, error } = await query;
  if (error) throw error;

  return (data ?? []).map((u) => ({ id: u.id, nome: u.nome_completo }));
}

type CasoParaMetricas = {
  status_atual: StatusCaso;
  tipo_caso: TipoCaso;
  filial: FilialCvc;
  vendedor_dono: string;
};

/** Tipo com maior contagem dentro de um grupo já separado por chave (filial ou vendedor). */
function tipoMaisComum(casosDoGrupo: CasoParaMetricas[]): { tipo: TipoCaso; quantidade: number } {
  const contagem = Object.fromEntries(TIPOS_CASO.map((t) => [t, 0])) as Record<TipoCaso, number>;
  for (const c of casosDoGrupo) contagem[c.tipo_caso] += 1;

  return TIPOS_CASO.reduce(
    (melhor, tipo) => (contagem[tipo] > melhor.quantidade ? { tipo, quantidade: contagem[tipo] } : melhor),
    { tipo: TIPOS_CASO[0], quantidade: -1 }
  );
}

/**
 * Mesma base de dados do Dashboard (Acompanhar Casos) — a RLS já decide o
 * escopo por perfil (vendedor: próprios; gerente: filial; admin: tudo), o
 * Painel de Gestão só agrega o que ela libera. Filtros (filial/vendedor) são
 * só um recorte dentro do que a RLS já libera — nunca uma forma de ver mais
 * do que o perfil já pode. Sem SQL de agregação: no volume desta operação
 * (uma franquia, 3 filiais) uma soma em memória sobre as linhas já
 * filtradas é simples e rápida o suficiente — ver decisão registrada na
 * conversa que introduziu o Painel de Gestão.
 */
export async function carregarMetricasPainel(filtros: FiltrosPainel = {}): Promise<MetricasPainel> {
  const supabase = await createClient();

  let query = supabase
    .from("casos")
    .select("id, protocolo, cliente_nome, status_atual, tipo_caso, filial, vendedor_dono, prazo_vigencia");
  if (filtros.filial) query = query.eq("filial", filtros.filial);
  if (filtros.vendedorId) query = query.eq("vendedor_dono", filtros.vendedorId);

  const { data: casos, error } = await query;
  if (error) throw error;

  const lista = casos ?? [];

  const porStatus = Object.fromEntries(STATUS_ORDEM.map((s) => [s, 0])) as Record<StatusCaso, number>;
  const porTipo = Object.fromEntries(TIPOS_CASO.map((t) => [t, 0])) as Record<TipoCaso, number>;
  for (const c of lista) {
    porStatus[c.status_atual] += 1;
    porTipo[c.tipo_caso] += 1;
  }

  const filiaisPresentes = [...new Set(lista.map((c) => c.filial))];
  const tipoMaisComumPorFilial: TipoMaisComumPorFilial[] =
    filiaisPresentes.length > 1
      ? filiaisPresentes.map((filial) => {
          const { tipo, quantidade } = tipoMaisComum(lista.filter((c) => c.filial === filial));
          return { filial, tipo, quantidade };
        })
      : [];

  const vendedorIds = [...new Set(lista.map((c) => c.vendedor_dono))];
  let nomesPorVendedor = new Map<string, string>();
  if (vendedorIds.length > 0) {
    const { data: vendedores, error: vendedoresError } = await supabase
      .from("usuarios")
      .select("id, nome_completo")
      .in("id", vendedorIds);
    if (vendedoresError) throw vendedoresError;
    nomesPorVendedor = new Map((vendedores ?? []).map((v) => [v.id, v.nome_completo]));
  }

  const tipoMaisComumPorVendedor: TipoMaisComumPorVendedor[] = vendedorIds
    .map((vendedorId) => {
      const casosDoVendedor = lista.filter((c) => c.vendedor_dono === vendedorId);
      const { tipo } = tipoMaisComum(casosDoVendedor);
      return {
        vendedorId,
        vendedorNome: nomesPorVendedor.get(vendedorId) ?? "—",
        tipo,
        totalCasos: casosDoVendedor.length,
      };
    })
    .sort((a, b) => b.totalCasos - a.totalCasos);

  let prazoVencidos = 0;
  let prazoVencendo = 0;
  const casosAtencaoPrazo: (CasoAtencaoPrazo & { diasAteVencimento: number })[] = [];
  for (const c of lista) {
    const situacao = situacaoPrazoVigencia(c.prazo_vigencia);
    if (situacao === "vencido") prazoVencidos += 1;
    if (situacao === "vencendo") prazoVencendo += 1;
    if (situacao !== "normal") {
      casosAtencaoPrazo.push({
        id: c.id,
        protocolo: c.protocolo,
        clienteNome: c.cliente_nome,
        vendedorNome: nomesPorVendedor.get(c.vendedor_dono) ?? "—",
        prazoVigencia: c.prazo_vigencia,
        situacao,
        diasAteVencimento: diasAteVencimento(c.prazo_vigencia),
      });
    }
  }
  casosAtencaoPrazo.sort((a, b) => a.diasAteVencimento - b.diasAteVencimento);

  // implicacoes/desfechos não têm filial/vendedor_dono — o recorte por
  // filtro passa pelos ids de `lista` (já filtrada acima), não por uma
  // condição própria nessas tabelas. RLS delas espelha a de casos de
  // qualquer forma, então mesmo sem filtro nunca vaza mais que `lista`.
  const casoIds = lista.map((c) => c.id);

  let multaTotal = 0;
  const multaPorQuemPaga: Record<QuemPagaMulta, number> = { cliente: 0, vendedor: 0 };
  const taxasRemarcacao = { taxas: 0, diferencaTarifaria: 0 };

  if (casoIds.length > 0) {
    const { data: implicacoes, error: implicacoesError } = await supabase
      .from("implicacoes")
      .select("multa_contratual_valor, multa_fornecedor_valor, quem_paga")
      .in("caso_id", casoIds);
    if (implicacoesError) throw implicacoesError;

    for (const i of implicacoes ?? []) {
      const valor = i.multa_contratual_valor + i.multa_fornecedor_valor;
      multaTotal += valor;
      multaPorQuemPaga[i.quem_paga] += valor;
    }

    // Só desfechos ativos (não substituídos/cancelados) — correção com
    // histórico (20260722000001) significa que um caso pode ter várias
    // linhas de remarcação ao longo do tempo; somar todas contaria valor
    // já corrigido.
    const { data: remarcacoes, error: remarcacoesError } = await supabase
      .from("desfechos_visivel")
      .select("valor_taxas, valor_diferenca_tarifaria, substituido_por, cancelado_em")
      .eq("tipo", "remarcacao")
      .in("caso_id", casoIds);
    if (remarcacoesError) throw remarcacoesError;

    for (const r of remarcacoes ?? []) {
      // Boolean(...), não "!== null": mesma lição do bug de "Invalid Date"
      // em desfechos-secao.tsx — se a coluna não existir na linha (schema
      // desatualizado), ela vem undefined, e undefined !== null é true em JS.
      if (Boolean(r.substituido_por) || Boolean(r.cancelado_em)) continue;
      taxasRemarcacao.taxas += r.valor_taxas ?? 0;
      taxasRemarcacao.diferencaTarifaria += r.valor_diferenca_tarifaria ?? 0;
    }
  }

  return {
    total: lista.length,
    porStatus,
    porTipo,
    tipoMaisComumPorFilial,
    tipoMaisComumPorVendedor,
    prazoVencidos,
    prazoVencendo,
    casosAtencaoPrazo: casosAtencaoPrazo.map(({ diasAteVencimento: _d, ...resto }) => resto),
    multaTotal,
    multaPorQuemPaga,
    taxasRemarcacao,
  };
}
