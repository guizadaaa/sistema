import "server-only";

import { diasAteVencimento, situacaoPrazoVigencia } from "@/lib/casos/prazo";
import { TIPOS_CASO } from "@/lib/validation/caso";
import { createClient } from "@/lib/supabase/server";
import type { FilialCvc, StatusCaso, TipoCaso } from "@/lib/supabase/types";

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
};

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
 * Painel de Gestão só agrega o que ela libera. Sem SQL de agregação: no
 * volume desta operação (uma franquia, 3 filiais) uma soma em memória sobre
 * as linhas já filtradas é simples e rápida o suficiente — ver decisão
 * registrada na conversa que introduziu o Painel de Gestão.
 */
export async function carregarMetricasPainel(): Promise<MetricasPainel> {
  const supabase = await createClient();

  const { data: casos, error } = await supabase
    .from("casos")
    .select("id, protocolo, cliente_nome, status_atual, tipo_caso, filial, vendedor_dono, prazo_vigencia");
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

  return {
    total: lista.length,
    porStatus,
    porTipo,
    tipoMaisComumPorFilial,
    tipoMaisComumPorVendedor,
    prazoVencidos,
    prazoVencendo,
    casosAtencaoPrazo: casosAtencaoPrazo.map(({ diasAteVencimento: _d, ...resto }) => resto),
  };
}
