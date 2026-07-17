import "server-only";

import { randomUUID } from "node:crypto";

import type { createClient } from "@/lib/supabase/server";
import { ANEXO_MIME_TYPES, ANEXO_TAMANHO_MAXIMO_BYTES, ANEXO_TIPOS_DOCUMENTO } from "@/lib/validation/caso";
import type { TipoDocumentoAnexo } from "@/lib/supabase/types";

export function isTipoDocumentoAnexo(valor: string): valor is TipoDocumentoAnexo {
  return (ANEXO_TIPOS_DOCUMENTO as readonly string[]).includes(valor);
}

/**
 * Upload é melhor-esforço: uma falha em um arquivo vira um aviso não-fatal
 * em vez de reverter o que já foi feito (criação do caso, ou os outros
 * anexos da mesma leva) — anexo é sempre opcional e pode ser reenviado
 * depois, na tela de detalhe do caso (seção 6).
 *
 * Lê os arquivos de formData.getAll("anexoArquivo") e os tipos pareados de
 * formData.getAll("anexoTipo"), na mesma ordem em que os campos aparecem no
 * formulário (convenção compartilhada com os componentes de upload).
 */
export async function validarEEnviarAnexos(
  supabase: Awaited<ReturnType<typeof createClient>>,
  casoId: string,
  formData: FormData
): Promise<string[]> {
  const arquivos = formData.getAll("anexoArquivo").filter((v): v is File => v instanceof File && v.size > 0);
  const tipos = formData.getAll("anexoTipo").map(String);

  const avisos: string[] = [];

  for (let i = 0; i < arquivos.length; i++) {
    const arquivo = arquivos[i];
    const tipoBruto = tipos[i];

    if (!tipoBruto || !isTipoDocumentoAnexo(tipoBruto)) {
      avisos.push(`${arquivo.name}: tipo de documento inválido, não enviado.`);
      continue;
    }

    if (!(ANEXO_MIME_TYPES as readonly string[]).includes(arquivo.type)) {
      avisos.push(`${arquivo.name}: formato não permitido (só PDF, JPG ou PNG).`);
      continue;
    }

    if (arquivo.size > ANEXO_TAMANHO_MAXIMO_BYTES) {
      avisos.push(`${arquivo.name}: maior que 10 MB, não enviado.`);
      continue;
    }

    const storagePath = `${casoId}/${randomUUID()}-${arquivo.name}`;

    const { error: uploadError } = await supabase.storage.from("anexos").upload(storagePath, arquivo, {
      contentType: arquivo.type,
    });

    if (uploadError) {
      console.error("Erro ao enviar anexo:", uploadError);
      avisos.push(`${arquivo.name}: falha no envio, tente novamente na tela do caso.`);
      continue;
    }

    const { error: insertError } = await supabase.from("anexos").insert({
      caso_id: casoId,
      tipo_documento: tipoBruto,
      storage_path: storagePath,
      nome_arquivo: arquivo.name,
    });

    if (insertError) {
      console.error("Erro ao registrar anexo:", insertError);
      avisos.push(`${arquivo.name}: enviado mas não registrado, tente novamente na tela do caso.`);
    }
  }

  return avisos;
}
