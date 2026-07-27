"use server";

import { revalidatePath } from "next/cache";

import { requireCurrentUser } from "@/lib/auth/current-user";
import { createClient } from "@/lib/supabase/server";
import { importarVendasPlanilha, type ResultadoImportacaoVendas } from "@/lib/vendas/importar";
import { FILIAIS } from "@/lib/validation/caso";
import type { FilialCvc } from "@/lib/supabase/types";

export type ImportarVendasState = {
  error?: string;
  resultado?: ResultadoImportacaoVendas;
};

/**
 * RLS (vendas_importadas_insert/_update) é a autoridade real (auth_is_admin()
 * — adm e adm_master, nunca gerente/vendedor) — o gate aqui evita o
 * round-trip de upload/parse pra quem nunca teria a gravação aceita, mesmo
 * padrão de enviarMaterialApoio.
 */
export async function importarVendas(_prevState: ImportarVendasState, formData: FormData): Promise<ImportarVendasState> {
  const usuario = await requireCurrentUser();
  if (usuario.perfil !== "adm" && usuario.perfil !== "adm_master") {
    return { error: "Apenas adm ou adm_master pode importar vendas." };
  }

  const filial = String(formData.get("filial") ?? "");
  if (!(FILIAIS as readonly string[]).includes(filial)) {
    return { error: "Selecione uma loja válida." };
  }

  const arquivo = formData.get("arquivo");
  if (!(arquivo instanceof File) || arquivo.size === 0) {
    return { error: "Selecione um arquivo." };
  }
  if (!arquivo.name.toLowerCase().endsWith(".xlsx")) {
    return { error: "Formato não permitido (só .xlsx)." };
  }

  const supabase = await createClient();

  try {
    const buffer = await arquivo.arrayBuffer();
    const resultado = await importarVendasPlanilha(supabase, filial as FilialCvc, buffer);
    revalidatePath("/vendas");
    return { resultado };
  } catch (erro) {
    console.error("Erro ao importar vendas:", erro);
    const mensagem = erro instanceof Error ? erro.message : undefined;
    // Mensagens de localizarColunas() já vêm escritas pra humanos — as demais
    // (erro de banco, arquivo corrompido) caem no genérico.
    return { error: mensagem?.includes("fora do formato esperado") ? mensagem : "Não foi possível importar o arquivo. Verifique se é o .xlsx exportado pela CVC." };
  }
}
