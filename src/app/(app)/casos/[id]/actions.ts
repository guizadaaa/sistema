"use server";

import { revalidatePath } from "next/cache";

import { requireCurrentUser } from "@/lib/auth/current-user";
import { validarEEnviarAnexos } from "@/lib/casos/anexos";
import { createClient } from "@/lib/supabase/server";

export type EnviarAnexoState = {
  avisos?: string[];
};

export async function enviarAnexoAoCaso(
  casoId: string,
  _prevState: EnviarAnexoState,
  formData: FormData
): Promise<EnviarAnexoState> {
  await requireCurrentUser();
  const supabase = await createClient();

  const avisos = await validarEEnviarAnexos(supabase, casoId, formData);
  revalidatePath(`/casos/${casoId}`);

  return { avisos: avisos.length > 0 ? avisos : undefined };
}

/**
 * Loga o acesso (LGPD §12 — log de quem baixou documento sensível) e só
 * então gera a signed URL. A checagem de visibilidade acontece dentro da
 * própria função de log (log_anexo_signed_url é SECURITY DEFINER e
 * verifica se o chamador enxerga o anexo antes de gravar); se ela rejeitar,
 * nunca chegamos a gerar a URL.
 */
export async function gerarUrlAssinadaAnexo(
  anexoId: string,
  storagePath: string
): Promise<{ url?: string; error?: string }> {
  await requireCurrentUser();
  const supabase = await createClient();

  const { error: logError } = await supabase.rpc("log_anexo_signed_url", { p_anexo_id: anexoId });
  if (logError) {
    return { error: "Sem permissão para acessar este anexo." };
  }

  const { data, error } = await supabase.storage.from("anexos").createSignedUrl(storagePath, 60);
  if (error || !data) {
    console.error("Erro ao gerar signed URL:", error);
    return { error: "Não foi possível gerar o link de download." };
  }

  return { url: data.signedUrl };
}
