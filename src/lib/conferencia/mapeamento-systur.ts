import "server-only";

import { createClient } from "@/lib/supabase/server";
import type { FilialCvc, PerfilUsuario } from "@/lib/supabase/types";

import type { GrupoMapeamento } from "./mapeamento-grupos";

export type LinhaMapeamentoSystur = {
  id: string;
  nomeSystur: string;
  loja: FilialCvc;
  usuarioId: string | null;
  /** Nome do usuário vinculado (também quando ele está inativo). */
  usuarioNome: string | null;
  loginSystur: string | null;
  grupo: GrupoMapeamento;
  /** Sem vínculo e com o mesmo nome (sem acento/caixa) de um usuário ativo. */
  pareceAtivo: boolean;
  /** Sugestão de vínculo (nome igual sem acento/caixa) — só quando usuarioId é null. */
  sugestaoUsuarioId: string | null;
  sugestaoOrigem: "usuario" | "linkly" | null;
};

export type UsuarioParaVinculo = { id: string; nome: string; perfil: PerfilUsuario; filial: FilialCvc | null };

/** Todos os nomes (da loja, se informada) com o grupo da tela; o filtro "Mostrar" é aplicado na tela. */
export async function listarMapeamentoSystur(filtros: { loja?: FilialCvc } = {}): Promise<LinhaMapeamentoSystur[]> {
  const supabase = await createClient();

  const [{ data, error }, { data: sugestoes, error: erroSugestoes }] = await Promise.all([
    supabase.rpc("systur_mapeamento_grupos", { p_loja: filtros.loja ?? null }),
    supabase.rpc("systur_sugestoes_vinculo"),
  ]);
  if (error) throw error;
  if (erroSugestoes) throw erroSugestoes;

  const sugestaoPorId = new Map((sugestoes ?? []).map((s) => [s.mapeamento_id, s]));
  return (data ?? []).map((m) => ({
    id: m.id,
    nomeSystur: m.nome_systur,
    loja: m.loja,
    usuarioId: m.usuario_id,
    usuarioNome: m.usuario_nome,
    loginSystur: m.login_systur,
    grupo: m.grupo,
    pareceAtivo: m.parece_ativo,
    sugestaoUsuarioId: sugestaoPorId.get(m.id)?.usuario_id ?? null,
    sugestaoOrigem: sugestaoPorId.get(m.id)?.origem ?? null,
  }));
}

export async function listarUsuariosParaVinculo(): Promise<UsuarioParaVinculo[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("usuarios")
    .select("id, nome_completo, perfil, filial")
    .eq("ativo", true)
    .order("nome_completo");
  if (error) throw error;
  return (data ?? []).map((u) => ({ id: u.id, nome: u.nome_completo, perfil: u.perfil, filial: u.filial }));
}
