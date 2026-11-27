import "server-only";

import { listarCandidatosVendedor } from "@/lib/casos/nomes";
import type { CandidatoVendedor } from "@/lib/casos/opcoes-vendedor";
import { hojeLocalIso } from "@/lib/casos/prazo";
import { createClient } from "@/lib/supabase/server";

import type { CasoEmAberto } from "./em-aberto";
import type { ContagemCasos } from "./tabela-status";

export type DadosPaginaInicial = {
  /** filial × dono × status (só casos reais que o usuário vê). */
  contagens: ContagemCasos[];
  /** Nomes, loja atual e situação dos donos (vendedores_filtro_casos_lojas). */
  candidatos: CandidatoVendedor[];
  /** Card "Casos em aberto": as duas listas (por grau e por tempo parado). */
  emAberto: { grau: CasoEmAberto[]; parado: CasoEmAberto[] };
};

/**
 * Tudo da página inicial em três consultas pequenas e em paralelo:
 * - dashboard_casos_contagem: uma agregação por (filial, dono, status), com
 *   vencidos / vencem em até 5 dias só de não resolvidos;
 * - vendedores_filtro_casos_lojas: nomes, loja atual e situação dos donos;
 * - casos_em_aberto_inicio: os `limite` primeiros por grau e por tempo
 *   parado, com a quantidade em aberto de cada grau.
 * As três seguem a regra de visibilidade dos casos (auth_pode_ver_caso):
 * vendedor os próprios, gerente a filial, adm/adm_master tudo. "Hoje" é a
 * mesma data que a coluna "Prazo de vigência" usa (hojeLocalIso).
 */
export async function carregarPaginaInicial(limite = 8): Promise<DadosPaginaInicial> {
  const supabase = await createClient();
  const [contagem, candidatos, abertos] = await Promise.all([
    supabase.rpc("dashboard_casos_contagem", { p_hoje: hojeLocalIso() }),
    listarCandidatosVendedor(supabase),
    supabase.rpc("casos_em_aberto_inicio", { p_limite: limite }),
  ]);
  if (contagem.error) throw contagem.error;
  if (abertos.error) throw abertos.error;

  const emAberto: DadosPaginaInicial["emAberto"] = { grau: [], parado: [] };
  for (const c of abertos.data ?? []) {
    emAberto[c.lista].push({
      id: c.id,
      protocolo: Number(c.protocolo),
      clienteNome: c.cliente_nome,
      statusAtual: c.status_atual,
      filial: c.filial,
      prioridade: c.prioridade,
      entrouEm: c.entrou_em,
      totalGrau: Number(c.total_grau),
    });
  }

  return {
    contagens: (contagem.data ?? []).map((c) => ({
      filial: c.filial,
      dono: c.vendedor_dono,
      status: c.status,
      total: Number(c.total),
      vencidos: Number(c.vencidos),
      vencem5: Number(c.vencem_5),
    })),
    candidatos,
    emAberto,
  };
}
