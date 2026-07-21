import "server-only";

import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/lib/supabase/types";

import { precisaAvisoDelegacaoAgendada } from "./status";

export type DelegacaoListada = Database["public"]["Tables"]["delegacoes"]["Row"] & {
  gerenteNome: string;
  admNome: string;
};

/**
 * RLS (delegacoes_select) já restringe as linhas visíveis: adm_master vê
 * todas, gerente só as próprias — nenhum filtro adicional necessário aqui.
 */
export async function listarDelegacoes(): Promise<DelegacaoListada[]> {
  const supabase = await createClient();

  const { data: delegacoes, error } = await supabase
    .from("delegacoes")
    .select("*")
    .order("criado_em", { ascending: false });
  if (error) throw error;
  if (!delegacoes || delegacoes.length === 0) return [];

  const ids = [...new Set(delegacoes.flatMap((d) => [d.adm_id, d.gerente_id]))];
  const { data: usuarios, error: usuariosError } = await supabase
    .from("usuarios")
    .select("id, nome_completo")
    .in("id", ids);
  if (usuariosError) throw usuariosError;

  const nomesPorId = new Map((usuarios ?? []).map((u) => [u.id, u.nome_completo]));

  return delegacoes.map((d) => ({
    ...d,
    admNome: nomesPorId.get(d.adm_id) ?? "—",
    gerenteNome: nomesPorId.get(d.gerente_id) ?? "—",
  }));
}

/**
 * Item 5 (banner "sua delegação começa em breve"): busca a próxima
 * delegação agendada do gerente logado, só quando faltam poucos dias para
 * o início (ver precisaAvisoDelegacaoAgendada). RLS (delegacoes_select) já
 * restringe a leitura às próprias delegações do gerente.
 */
export async function buscarProximaDelegacaoParaAviso(gerenteId: string): Promise<{ inicio: string } | null> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("delegacoes")
    .select("inicio, ativa")
    .eq("gerente_id", gerenteId)
    .eq("ativa", true)
    .gt("inicio", new Date().toISOString())
    .order("inicio", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  if (!data) return null;

  return precisaAvisoDelegacaoAgendada(data) ? { inicio: data.inicio } : null;
}
