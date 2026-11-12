import type { createClient } from "@/lib/supabase/server";
import type { FilialCvc } from "@/lib/supabase/types";
import { hojeSaoPaulo } from "@/lib/linkly/mes";

import type { ResultadoImportacaoVendas } from "./importar";

export type ResultadoAvisoImportacao = {
  /** Quantos usuários da loja foram avisados (undefined = nenhum aviso disparado). */
  avisados?: number;
  /** Falha ao avisar: a importação já foi gravada, então vira aviso, não erro. */
  avisoNotificacao?: string;
};

/**
 * Depois de uma importação bem-sucedida, avisa os usuários ativos da loja
 * (notificar_vendas_importadas, que também registra a importação). Importação
 * sem nenhuma venda nova nem atualizada não avisa ninguém. "Até" é a maior
 * Data Venda importada; sem ela, a data de hoje em São Paulo.
 */
export async function avisarImportacaoVendas(
  supabase: Awaited<ReturnType<typeof createClient>>,
  filial: FilialCvc,
  resultado: ResultadoImportacaoVendas,
  agora: Date = new Date()
): Promise<ResultadoAvisoImportacao> {
  if (resultado.novas === 0 && resultado.atualizadas === 0) return {};

  try {
    const { data, error } = await supabase.rpc("notificar_vendas_importadas", {
      p_filial: filial,
      p_ate: resultado.ate ?? hojeSaoPaulo(agora),
    });
    if (error) throw error;
    return { avisados: data ?? 0 };
  } catch (erro) {
    console.error("Erro ao avisar a loja sobre a importação de vendas:", erro);
    const detalhe = erro instanceof Error ? erro.message : ((erro as { message?: string })?.message ?? String(erro));
    return { avisoNotificacao: `As vendas foram importadas, mas não foi possível avisar os usuários da loja: ${detalhe}` };
  }
}
