import "server-only";

import { createClient } from "@/lib/supabase/server";
import type { FilialCvc } from "@/lib/supabase/types";

import type { GrupoMapeamento } from "./mapeamento-grupos";
import type { UsuarioParaVinculo } from "./usuarios-vinculo";

export type { UsuarioParaVinculo } from "./usuarios-vinculo";

export type SugestaoVinculo = {
  usuarioId: string;
  criterio: "nome_igual" | "nome_sobrenome" | "parecido";
  /** 1º lugar único por nome igual ou primeiro nome + sobrenome. */
  forte: boolean;
};

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
  vinculoOrigem: "automatico" | "manual" | null;
  /** Um adm desvinculou: o vínculo automático não volta. */
  vinculoBloqueado: boolean;
  /** Até 3 sugestões (só sem vínculo), na ordem do ranking. */
  sugestoes: SugestaoVinculo[];
};

/** Todos os nomes (da loja, se informada) com o grupo da tela; o filtro "Mostrar" é aplicado na tela. */
export async function listarMapeamentoSystur(filtros: { loja?: FilialCvc } = {}): Promise<LinhaMapeamentoSystur[]> {
  const supabase = await createClient();

  const [{ data, error }, { data: sugestoes, error: erroSugestoes }] = await Promise.all([
    supabase.rpc("systur_mapeamento_grupos", { p_loja: filtros.loja ?? null }),
    supabase.rpc("systur_sugestoes_usuarios", { p_loja: filtros.loja ?? null }),
  ]);
  if (error) throw error;
  if (erroSugestoes) throw erroSugestoes;

  const sugestoesPorId = new Map<string, SugestaoVinculo[]>();
  for (const s of [...(sugestoes ?? [])].sort((a, b) => a.posicao - b.posicao)) {
    const lista = sugestoesPorId.get(s.mapeamento_id) ?? [];
    lista.push({ usuarioId: s.usuario_id, criterio: s.criterio, forte: s.forte });
    sugestoesPorId.set(s.mapeamento_id, lista);
  }

  return (data ?? []).map((m) => ({
    id: m.id,
    nomeSystur: m.nome_systur,
    loja: m.loja,
    usuarioId: m.usuario_id,
    usuarioNome: m.usuario_nome,
    loginSystur: m.login_systur,
    grupo: m.grupo,
    pareceAtivo: m.parece_ativo,
    vinculoOrigem: m.vinculo_origem,
    vinculoBloqueado: m.vinculo_automatico_bloqueado,
    sugestoes: m.usuario_id ? [] : (sugestoesPorId.get(m.id) ?? []),
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
