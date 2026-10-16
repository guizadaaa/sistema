"use server";

import { revalidatePath } from "next/cache";

import { requireCurrentUser } from "@/lib/auth/current-user";
import { consultarLinklyDesdeDia1, type ResultadoConsultaLinkly } from "@/lib/linkly/base-mes";
import { hojeSaoPaulo, mesAtualSaoPaulo } from "@/lib/linkly/mes";
import { createClient } from "@/lib/supabase/server";

async function exigirAdmMaster(): Promise<string | undefined> {
  const usuario = await requireCurrentUser();
  return usuario.perfil === "adm_master" ? undefined : "Apenas Adm Master pode definir a base do mês.";
}

/** Consulta o Linkly (uma chamada de contadores por workspace). Não grava nada. */
export async function consultarLinklyAction(): Promise<{ error?: string; resultado?: ResultadoConsultaLinkly }> {
  const bloqueio = await exigirAdmMaster();
  if (bloqueio) return { error: bloqueio };

  try {
    return { resultado: await consultarLinklyDesdeDia1(mesAtualSaoPaulo(), hojeSaoPaulo()) };
  } catch (erro) {
    console.error("Erro ao consultar o Linkly para a base do mês:", erro);
    return { error: "Não foi possível consultar o Linkly agora. Use os campos manuais." };
  }
}

export type ItemBase = { linkId: string; cliquesNoMes: number };
export type ResultadoGravacao = { linkId: string; ok: boolean; base?: number; erro?: string };

/**
 * Grava a base de cada link confirmado na prévia. Roda como o próprio
 * usuário: linkly_definir_base_mes checa adm_master e revalida tudo (mês
 * atual, 0 <= cliques <= total atual, sem sobrescrever snapshot real).
 */
export async function gravarBasesAction(itens: ItemBase[]): Promise<{ error?: string; resultados?: ResultadoGravacao[] }> {
  const bloqueio = await exigirAdmMaster();
  if (bloqueio) return { error: bloqueio };
  if (itens.length === 0) return { error: "Nenhum link selecionado." };

  const supabase = await createClient();
  const mes = mesAtualSaoPaulo();
  const resultados: ResultadoGravacao[] = [];

  for (const item of itens) {
    const { data, error } = await supabase.rpc("linkly_definir_base_mes", {
      p_link_id: item.linkId,
      p_mes: mes,
      p_cliques_no_mes: item.cliquesNoMes,
    });
    resultados.push(error ? { linkId: item.linkId, ok: false, erro: error.message } : { linkId: item.linkId, ok: true, base: Number(data) });
  }

  revalidatePath("/cliques");
  revalidatePath("/cliques/base");
  return { resultados };
}
