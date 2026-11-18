"use server";

import { revalidatePath } from "next/cache";

import { requireCurrentUser } from "@/lib/auth/current-user";
import { createClient } from "@/lib/supabase/server";
import type { FilialCvc } from "@/lib/supabase/types";
import { FILIAIS } from "@/lib/validation/caso";

export type FeriadoFormState = { error?: string; ok?: boolean };

const ABRANGENCIAS = ["nacional", "estadual_PR", "municipal"] as const;

function lerFormulario(formData: FormData) {
  const data = String(formData.get("data") ?? "");
  const nome = String(formData.get("nome") ?? "").trim();
  const abrangencia = String(formData.get("abrangencia") ?? "");
  const filial = String(formData.get("filial") ?? "");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(data)) return { error: "Informe a data." } as const;
  if (!nome) return { error: "Informe o nome do feriado." } as const;
  if (!(ABRANGENCIAS as readonly string[]).includes(abrangencia)) return { error: "Abrangência inválida." } as const;
  if (filial && !(FILIAIS as readonly string[]).includes(filial)) return { error: "Filial inválida." } as const;
  if (abrangencia === "municipal" && !filial) return { error: "Feriado municipal precisa da filial." } as const;
  return {
    valores: {
      data,
      nome: nome.slice(0, 120),
      abrangencia: abrangencia as (typeof ABRANGENCIAS)[number],
      filial: (filial || null) as FilialCvc | null,
      facultativo: formData.get("facultativo") === "1",
    },
  } as const;
}

async function exigirAdmin() {
  const usuario = await requireCurrentUser();
  return usuario.perfil === "adm" || usuario.perfil === "adm_master";
}

function mensagemErro(error: { code?: string }) {
  return error.code === "23505" ? "Já existe um feriado nesse dia para essa filial." : "Não foi possível salvar o feriado.";
}

/** RLS (feriados_*) também exige adm/adm_master. */
export async function salvarFeriado(_prev: FeriadoFormState, formData: FormData): Promise<FeriadoFormState> {
  if (!(await exigirAdmin())) return { error: "Só adm/adm_master editam feriados." };
  const lido = lerFormulario(formData);
  if ("error" in lido) return { error: lido.error };

  const supabase = await createClient();
  const id = String(formData.get("id") ?? "");
  const { error } = id
    ? await supabase.from("feriados").update(lido.valores).eq("id", id)
    : await supabase.from("feriados").insert(lido.valores);
  if (error) {
    console.error("Erro ao salvar feriado:", error);
    return { error: mensagemErro(error) };
  }
  revalidatePath("/vendas/feriados");
  revalidatePath("/vendas/importar");
  return { ok: true };
}

export async function excluirFeriado(id: string): Promise<{ error?: string }> {
  if (!(await exigirAdmin())) return { error: "Só adm/adm_master editam feriados." };
  const supabase = await createClient();
  const { error } = await supabase.from("feriados").delete().eq("id", id);
  if (error) {
    console.error("Erro ao excluir feriado:", error);
    return { error: "Não foi possível excluir o feriado." };
  }
  revalidatePath("/vendas/feriados");
  revalidatePath("/vendas/importar");
  return {};
}
