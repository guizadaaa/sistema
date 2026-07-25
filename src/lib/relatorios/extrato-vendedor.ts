import "server-only";

import { situacaoPrazoVigencia } from "@/lib/casos/prazo";
import { createClient } from "@/lib/supabase/server";
import type { FilialCvc, StatusCaso, TipoCaso } from "@/lib/supabase/types";

export type CasoDoExtrato = {
  id: string;
  protocolo: number;
  tipoCaso: TipoCaso;
  clienteNome: string;
  statusAtual: StatusCaso;
  prazoVigencia: string;
  situacaoPrazo: "vencido" | "vencendo" | "normal";
  multaTotal: number;
};

export type ExtratoVendedor = {
  vendedorId: string;
  vendedorNome: string;
  vendedorFilial: FilialCvc | null;
  geradoEm: string;
  casos: CasoDoExtrato[];
  totalCasos: number;
  multaTotalGeral: number;
  prazosVencidos: number;
  prazosVencendo: number;
};

/**
 * RLS de casos/implicacoes já limita o que a sessão atual pode ler — este
 * carregamento não é a linha de defesa (essa é podeGerarExtratoVendedor +
 * RLS); aqui só filtra explicitamente por vendedor_dono = vendedorId dentro
 * do que a RLS já libera, igual ao restante do app.
 */
export async function carregarExtratoVendedor(vendedorId: string): Promise<ExtratoVendedor | null> {
  const supabase = await createClient();

  const { data: vendedor, error: vendedorError } = await supabase
    .from("usuarios")
    .select("id, nome_completo, filial")
    .eq("id", vendedorId)
    .maybeSingle();
  if (vendedorError) throw vendedorError;
  if (!vendedor) return null;

  const { data: casos, error: casosError } = await supabase
    .from("casos")
    .select("id, protocolo, tipo_caso, cliente_nome, status_atual, prazo_vigencia")
    .eq("vendedor_dono", vendedorId)
    .eq("caso_teste", false)
    .order("criado_em", { ascending: false });
  if (casosError) throw casosError;

  const lista = casos ?? [];
  const casoIds = lista.map((c) => c.id);

  let multaPorCaso = new Map<string, number>();
  if (casoIds.length > 0) {
    const { data: implicacoes, error: implicacoesError } = await supabase
      .from("implicacoes")
      .select("caso_id, multa_contratual_valor, multa_fornecedor_valor")
      .in("caso_id", casoIds);
    if (implicacoesError) throw implicacoesError;

    multaPorCaso = new Map(
      (implicacoes ?? []).map((i) => [i.caso_id, i.multa_contratual_valor + i.multa_fornecedor_valor])
    );
  }

  let multaTotalGeral = 0;
  let prazosVencidos = 0;
  let prazosVencendo = 0;

  const casosDoExtrato: CasoDoExtrato[] = lista.map((c) => {
    const multaTotal = multaPorCaso.get(c.id) ?? 0;
    const situacaoPrazo = situacaoPrazoVigencia(c.prazo_vigencia);
    multaTotalGeral += multaTotal;
    if (situacaoPrazo === "vencido") prazosVencidos += 1;
    if (situacaoPrazo === "vencendo") prazosVencendo += 1;

    return {
      id: c.id,
      protocolo: c.protocolo,
      tipoCaso: c.tipo_caso,
      clienteNome: c.cliente_nome,
      statusAtual: c.status_atual,
      prazoVigencia: c.prazo_vigencia,
      situacaoPrazo,
      multaTotal,
    };
  });

  return {
    vendedorId: vendedor.id,
    vendedorNome: vendedor.nome_completo,
    vendedorFilial: vendedor.filial,
    geradoEm: new Date().toISOString(),
    casos: casosDoExtrato,
    totalCasos: casosDoExtrato.length,
    multaTotalGeral,
    prazosVencidos,
    prazosVencendo,
  };
}
