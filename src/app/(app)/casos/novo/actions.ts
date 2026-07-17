"use server";

import { randomUUID } from "node:crypto";

import { requireCurrentUser } from "@/lib/auth/current-user";
import { createClient } from "@/lib/supabase/server";
import {
  ANEXO_MIME_TYPES,
  ANEXO_TAMANHO_MAXIMO_BYTES,
  ANEXO_TIPOS_DOCUMENTO,
  casoSchema,
} from "@/lib/validation/caso";
import type { TipoDocumentoAnexo } from "@/lib/supabase/types";

export type CriarCasoState = {
  error?: string;
  sucesso?: { id: string; protocolo: number; avisosAnexos?: string[] };
};

function isTipoDocumentoAnexo(valor: string): valor is TipoDocumentoAnexo {
  return (ANEXO_TIPOS_DOCUMENTO as readonly string[]).includes(valor);
}

/**
 * Upload é melhor-esforço e não bloqueia a criação do caso: anexo é
 * opcional e pode ser adicionado depois, na tela de detalhe (seção 6).
 * Cada falha vira um aviso não-fatal em vez de reverter o caso já criado.
 */
async function enviarAnexos(
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

export async function criarCaso(_prevState: CriarCasoState, formData: FormData): Promise<CriarCasoState> {
  const usuario = await requireCurrentUser();

  const raw = {
    tipoCaso: formData.get("tipoCaso"),
    vendedorDono: formData.get("vendedorDono"),
    contratoNumero: formData.get("contratoNumero"),
    clienteNome: formData.get("clienteNome"),
    clienteCpf: formData.get("clienteCpf"),
    prazoVigencia: formData.get("prazoVigencia"),
    motivo: formData.get("motivo") || undefined,
    descricao: formData.get("descricao") || undefined,
    parcelasEmAberto: formData.get("parcelasEmAberto") || undefined,
    dataCancelamento: formData.get("dataCancelamento") || undefined,
  };

  const parsed = casoSchema.safeParse(raw);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dados inválidos" };
  }

  const dados = parsed.data;

  const supabase = await createClient();

  const { data, error } = await supabase
    .from("casos")
    .insert({
      tipo_caso: dados.tipoCaso,
      vendedor_dono: dados.vendedorDono,
      criado_por: usuario.id,
      contrato_numero: dados.contratoNumero,
      cliente_nome: dados.clienteNome,
      cliente_cpf: dados.clienteCpf,
      prazo_vigencia: dados.prazoVigencia,
      motivo: "motivo" in dados ? dados.motivo : null,
      descricao: "descricao" in dados ? dados.descricao : null,
      parcelas_em_aberto: "parcelasEmAberto" in dados ? dados.parcelasEmAberto : null,
      data_cancelamento: "dataCancelamento" in dados ? dados.dataCancelamento : null,
    })
    .select("id, protocolo")
    .single();

  if (error) {
    // RLS/CHECK constraints devolvem mensagens técnicas do Postgres; não
    // expor isso direto ao usuário final, só logar para diagnóstico.
    console.error("Erro ao criar caso:", error);
    return { error: "Não foi possível criar o caso. Verifique os dados e tente novamente." };
  }

  const avisosAnexos = await enviarAnexos(supabase, data.id, formData);

  return {
    sucesso: {
      id: data.id,
      protocolo: data.protocolo,
      avisosAnexos: avisosAnexos.length > 0 ? avisosAnexos : undefined,
    },
  };
}
