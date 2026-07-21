import "server-only";

import type { createClient } from "@/lib/supabase/server";
import { contratoAdicionalSchema } from "@/lib/validation/caso";

/**
 * Melhor-esforço, mesmo princípio de validarEEnviarAnexos: uma falha em um
 * número não reverte o caso já criado nem os outros números da mesma leva —
 * contrato adicional sempre pode ser reenviado depois, na tela de detalhe.
 *
 * Lê os números de formData.getAll("contratoAdicional") — convenção
 * compartilhada com o componente de formulário (múltiplos campos com o
 * mesmo name, um por linha adicionada).
 */
export async function validarEInserirContratosAdicionais(
  supabase: Awaited<ReturnType<typeof createClient>>,
  casoId: string,
  formData: FormData
): Promise<string[]> {
  const valoresBrutos = formData
    .getAll("contratoAdicional")
    .map(String)
    .filter((v) => v.trim() !== "");

  const avisos: string[] = [];

  for (const bruto of valoresBrutos) {
    const parsed = contratoAdicionalSchema.safeParse(bruto);
    if (!parsed.success) {
      avisos.push(`${bruto}: ${parsed.error.issues[0]?.message ?? "número de contrato inválido"}.`);
      continue;
    }

    const { error } = await supabase.from("casos_contratos_adicionais").insert({
      caso_id: casoId,
      contrato_numero: parsed.data,
    });

    if (error) {
      console.error("Erro ao registrar contrato adicional:", error);
      // 23505 = unique_violation (já vinculado a este caso); P0001 = raise
      // exception do trigger de duplicidade com o contrato principal.
      const mensagem =
        error.code === "23505"
          ? "este número já está vinculado a este caso."
          : error.code === "P0001"
            ? "é o mesmo número do contrato principal deste caso."
            : "não foi possível registrar, tente novamente na tela do caso.";
      avisos.push(`${parsed.data}: ${mensagem}`);
    }
  }

  return avisos;
}
