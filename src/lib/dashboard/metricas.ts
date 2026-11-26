import "server-only";

import { listarCandidatosVendedor } from "@/lib/casos/nomes";
import type { CandidatoVendedor } from "@/lib/casos/opcoes-vendedor";
import { hojeLocalIso } from "@/lib/casos/prazo";
import { createClient } from "@/lib/supabase/server";
import type { FilialCvc, StatusCaso } from "@/lib/supabase/types";

import type { ContagemCasos } from "./tabela-status";

export type CasoParado = {
  id: string;
  protocolo: number;
  clienteNome: string;
  statusAtual: StatusCaso;
  filial: FilialCvc;
  /** Quando entrou na etapa atual. */
  entrouEm: string;
};

export type DadosPaginaInicial = {
  /** filial × dono × status (só casos reais que o usuário vê). */
  contagens: ContagemCasos[];
  /** Nomes, loja atual e situação dos donos (vendedores_filtro_casos_lojas). */
  candidatos: CandidatoVendedor[];
  /** Os mais parados na etapa atual (não resolvidos). */
  parados: CasoParado[];
};

/**
 * Tudo da página inicial em três consultas pequenas e em paralelo:
 * - dashboard_casos_contagem: uma agregação por (filial, dono, status), com
 *   vencidos / vencem em até 5 dias só de não resolvidos;
 * - vendedores_filtro_casos_lojas: nomes, loja atual e situação dos donos;
 * - casos_tempo_etapa: os `limiteParados` mais parados.
 * As três seguem a regra de visibilidade dos casos (auth_pode_ver_caso):
 * vendedor os próprios, gerente a filial, adm/adm_master tudo. "Hoje" é a
 * mesma data que a coluna "Prazo de vigência" usa (hojeLocalIso).
 */
export async function carregarPaginaInicial(limiteParados = 8): Promise<DadosPaginaInicial> {
  const supabase = await createClient();
  const [contagem, candidatos, parados] = await Promise.all([
    supabase.rpc("dashboard_casos_contagem", { p_hoje: hojeLocalIso() }),
    listarCandidatosVendedor(supabase),
    supabase.rpc("casos_tempo_etapa", { p_limite: limiteParados }),
  ]);
  if (contagem.error) throw contagem.error;
  if (parados.error) throw parados.error;

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
    parados: (parados.data ?? []).map((p) => ({
      id: p.id,
      protocolo: Number(p.protocolo),
      clienteNome: p.cliente_nome,
      statusAtual: p.status_atual,
      filial: p.filial,
      entrouEm: p.entrou_em,
    })),
  };
}
