"use server";

import { revalidatePath } from "next/cache";

import { requireCurrentUser } from "@/lib/auth/current-user";
import { createClient } from "@/lib/supabase/server";
import { criarDelegacaoSchema, editarDelegacaoSchema } from "@/lib/validation/delegacao";

export type CriarDelegacaoState = {
  error?: string;
};

/**
 * A RLS (delegacoes_insert) já restringe o INSERT a adm_master, e o trigger
 * validate_delegacao garante que gerente_id é de fato um gerente e que não
 * há sobreposição com outra delegação vigente/agendada — este action só
 * repassa esses erros de forma legível.
 */
export async function criarDelegacao(
  _prevState: CriarDelegacaoState,
  formData: FormData
): Promise<CriarDelegacaoState> {
  const usuario = await requireCurrentUser();

  const parsed = criarDelegacaoSchema.safeParse({
    gerenteId: formData.get("gerenteId"),
    inicio: formData.get("inicio") || undefined,
    fim: formData.get("fim") || undefined,
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dados inválidos" };
  }

  const supabase = await createClient();
  const { error } = await supabase.from("delegacoes").insert({
    adm_id: usuario.id,
    gerente_id: parsed.data.gerenteId,
    // Em branco, omite a coluna e deixa o default now() do banco assumir —
    // mesmo comportamento de sempre (começa imediatamente). Só definimos
    // explicitamente quando o adm_master escolhe uma data futura (agendamento).
    inicio: parsed.data.inicio ? new Date(`${parsed.data.inicio}T00:00:00`).toISOString() : undefined,
    // Fim do dia selecionado, não meia-noite — evita a delegação aparecer
    // encerrada antes do fim do próprio dia escolhido como término.
    fim: parsed.data.fim ? new Date(`${parsed.data.fim}T23:59:59`).toISOString() : null,
  });

  if (error) {
    console.error("Erro ao criar delegação:", error);
    return {
      error: error.message.includes("delegação vigente")
        ? "Já existe uma delegação vigente ou agendada que se sobrepõe a este período para este gerente."
        : "Não foi possível criar a delegação. Verifique se você tem permissão para esta ação.",
    };
  }

  revalidatePath("/delegacoes");
  return {};
}

export type EditarDelegacaoState = {
  error?: string;
};

/**
 * Só permite editar uma delegação que ainda não começou (WHERE inicio > now()
 * na própria query de update, avaliado contra o valor atual da linha antes
 * do UPDATE) — se 0 linhas voltarem, ela já começou (ou não existe/RLS
 * bloqueou) e devolvemos um erro claro em vez de um sucesso silencioso.
 * validate_delegacao roda de novo aqui (before update), revalidando perfil
 * e sobreposição com outras delegações do mesmo gerente.
 */
export async function atualizarDelegacaoAgendada(
  delegacaoId: string,
  _prevState: EditarDelegacaoState,
  formData: FormData
): Promise<EditarDelegacaoState> {
  await requireCurrentUser();

  const parsed = editarDelegacaoSchema.safeParse({
    gerenteId: formData.get("gerenteId"),
    inicio: formData.get("inicio") || undefined,
    fim: formData.get("fim") || undefined,
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dados inválidos" };
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("delegacoes")
    .update({
      gerente_id: parsed.data.gerenteId,
      inicio: new Date(`${parsed.data.inicio}T00:00:00`).toISOString(),
      fim: parsed.data.fim ? new Date(`${parsed.data.fim}T23:59:59`).toISOString() : null,
    })
    .eq("id", delegacaoId)
    .gt("inicio", new Date().toISOString())
    .select("id");

  if (error) {
    console.error("Erro ao editar delegação:", error);
    return {
      error: error.message.includes("delegação vigente")
        ? "Já existe uma delegação vigente ou agendada que se sobrepõe a este período para este gerente."
        : "Não foi possível editar a delegação. Verifique se você tem permissão para esta ação.",
    };
  }

  if (!data || data.length === 0) {
    return { error: "Esta delegação já começou e não pode mais ser editada." };
  }

  revalidatePath("/delegacoes");
  return {};
}

/**
 * Cancelar (delegação ainda não iniciada) é diferente de encerrar (delegação
 * em andamento): não mexe em fim — setar fim = now() aqui violaria a
 * constraint delegacoes_fim_apos_inicio, já que now() < inicio (futuro)
 * numa delegação agendada. Só desativa; mesma guarda de "ainda não começou"
 * de atualizarDelegacaoAgendada.
 */
export async function cancelarDelegacaoAgendada(delegacaoId: string): Promise<{ error?: string }> {
  await requireCurrentUser();
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("delegacoes")
    .update({ ativa: false })
    .eq("id", delegacaoId)
    .gt("inicio", new Date().toISOString())
    .select("id");

  if (error) {
    console.error("Erro ao cancelar delegação:", error);
    return { error: "Não foi possível cancelar a delegação." };
  }

  if (!data || data.length === 0) {
    return { error: "Esta delegação já começou e não pode mais ser cancelada — use Encerrar." };
  }

  revalidatePath("/delegacoes");
  return {};
}

export async function encerrarDelegacao(delegacaoId: string): Promise<{ error?: string }> {
  await requireCurrentUser();
  const supabase = await createClient();

  const { error } = await supabase
    .from("delegacoes")
    .update({ ativa: false, fim: new Date().toISOString() })
    .eq("id", delegacaoId);

  if (error) {
    console.error("Erro ao encerrar delegação:", error);
    return { error: "Não foi possível encerrar a delegação." };
  }

  revalidatePath("/delegacoes");
  return {};
}
