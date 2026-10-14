import "server-only";

import type { createClient } from "@/lib/supabase/server";
import { reciboRecadastradoSchema } from "@/lib/validation/caso";

/**
 * Mesmo melhor-esforço de validarEInserirContratosAdicionais: uma falha num
 * número vira aviso, sem desfazer o caso já criado nem os outros números —
 * dá para reenviar depois, na tela do caso.
 *
 * Lê os números de formData.getAll("reciboRecadastrado") (um campo por
 * linha adicionada, mesmo name).
 */
export async function validarEInserirRecibosRecadastrados(
  supabase: Awaited<ReturnType<typeof createClient>>,
  casoId: string,
  formData: FormData
): Promise<string[]> {
  const valoresBrutos = formData
    .getAll("reciboRecadastrado")
    .map(String)
    .filter((v) => v.trim() !== "");

  const avisos: string[] = [];

  for (const bruto of valoresBrutos) {
    const parsed = reciboRecadastradoSchema.safeParse(bruto);
    if (!parsed.success) {
      avisos.push(`${bruto}: ${parsed.error.issues[0]?.message ?? "número de recibo inválido"}.`);
      continue;
    }

    const { error } = await supabase.from("casos_recibos_recadastrados").insert({
      caso_id: casoId,
      recibo_numero: parsed.data,
    });

    if (error) {
      console.error("Erro ao registrar recibo recadastrado:", error);
      // 23505 = já vinculado a este caso; P0001 = trigger (caso não é Recadastro).
      const mensagem =
        error.code === "23505"
          ? "este recibo já está vinculado a este caso."
          : error.code === "P0001"
            ? "recibo recadastrado só pode ser informado em caso do tipo Recadastro."
            : "não foi possível registrar, tente novamente na tela do caso.";
      avisos.push(`${parsed.data}: ${mensagem}`);
    }
  }

  return avisos;
}
