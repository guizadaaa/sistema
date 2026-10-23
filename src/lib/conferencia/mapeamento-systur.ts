import "server-only";

import { createClient } from "@/lib/supabase/server";
import type { FilialCvc, PerfilUsuario } from "@/lib/supabase/types";

export type LinhaMapeamentoSystur = {
  id: string;
  nomeSystur: string;
  loja: FilialCvc;
  usuarioId: string | null;
  loginSystur: string | null;
  ativo: boolean;
  /** Sugestão de vínculo (nome igual sem acento/caixa) — só quando usuarioId é null. */
  sugestaoUsuarioId: string | null;
  sugestaoOrigem: "usuario" | "linkly" | null;
};

export type UsuarioParaVinculo = { id: string; nome: string; perfil: PerfilUsuario; filial: FilialCvc | null };

/** Roda como o próprio admin (RLS de systur_vendedor_mapeamento). */
export async function listarMapeamentoSystur(filtros: { loja?: FilialCvc; semVinculo?: boolean } = {}): Promise<LinhaMapeamentoSystur[]> {
  const supabase = await createClient();

  let consulta = supabase
    .from("systur_vendedor_mapeamento")
    .select("id, nome_systur, loja, usuario_id, login_systur, ativo")
    .order("loja")
    .order("nome_systur");
  if (filtros.loja) consulta = consulta.eq("loja", filtros.loja);
  if (filtros.semVinculo) consulta = consulta.is("usuario_id", null);

  const [{ data, error }, { data: sugestoes, error: erroSugestoes }] = await Promise.all([
    consulta,
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
    loginSystur: m.login_systur,
    ativo: m.ativo,
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
