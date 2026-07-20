"use server";

import type { PostgrestError } from "@supabase/supabase-js";

import { requireCurrentUser } from "@/lib/auth/current-user";
import { createClient } from "@/lib/supabase/server";
import { validarEEnviarAnexos } from "@/lib/casos/anexos";
import { casoSchema } from "@/lib/validation/caso";

export type CasoFormValores = {
  tipoCaso?: string;
  vendedorDono?: string;
  contratoNumero?: string;
  clienteNome?: string;
  clienteCpf?: string;
  prazoVigencia?: string;
  motivo?: string;
  descricao?: string;
  parcelasEmAberto?: string;
  dataCancelamento?: string;
};

export type CriarCasoState = {
  error?: string;
  fieldErrors?: Partial<Record<keyof CasoFormValores, string>>;
  valores?: CasoFormValores;
  sucesso?: { id: string; protocolo: number; avisosAnexos?: string[] };
};

/** Para reidratar o formulário após um erro — nunca undefined, mesmo vazio. */
function comoTexto(valor: FormDataEntryValue | null): string {
  return typeof valor === "string" ? valor : "";
}

const MENSAGEM_GENERICA = "Não foi possível criar o caso. Verifique os dados e tente novamente.";

/**
 * Traduz os erros de banco mais comuns nesse insert para uma mensagem clara
 * em português, em vez do JSON técnico do Postgres. Cobre só os casos
 * conhecidos deste schema; qualquer coisa fora daqui cai na mensagem
 * genérica, para nunca vazar detalhe técnico não mapeado ao usuário final.
 */
function mensagemErroCaso(error: PostgrestError): string {
  // P0001 = "raise exception" de um trigger nosso (ex.: transferência de
  // casos) — mensagem já escrita para humanos em português, segura para
  // mostrar direto.
  if (error.code === "P0001") return error.message;

  // 23502 = not_null_violation. O único caso esperado aqui é "filial", que a
  // trigger set_caso_defaults deriva do dono escolhido — só fica nula quando
  // o dono é um adm/adm_master (que não tem filial própria), cenário ainda
  // não suportado para criação de caso.
  if (error.code === "23502" && error.message.includes('"filial"')) {
    return "Não é possível registrar o caso: o dono selecionado não tem filial definida. Escolha um vendedor ou gerente como dono do caso.";
  }

  // 23514 = check_violation — cada constraint aqui já é validada em
  // dobro no client/zod antes do insert, então só chega aqui em caso de bug
  // ou uso direto da API; ainda assim vale traduzir as conhecidas.
  if (error.code === "23514") {
    if (error.message.includes("casos_cpf_formato")) return "CPF do cliente em formato inválido.";
    if (error.message.includes("casos_contrato_numero_formato")) {
      return "Contrato deve ter exatamente 14 números.";
    }
    if (error.message.includes("casos_campos_por_tipo")) {
      return "Os dados informados não correspondem ao tipo de caso selecionado.";
    }
  }

  return MENSAGEM_GENERICA;
}

export async function criarCaso(_prevState: CriarCasoState, formData: FormData): Promise<CriarCasoState> {
  const usuario = await requireCurrentUser();

  const valoresSubmetidos: CasoFormValores = {
    tipoCaso: comoTexto(formData.get("tipoCaso")),
    vendedorDono: comoTexto(formData.get("vendedorDono")),
    contratoNumero: comoTexto(formData.get("contratoNumero")),
    clienteNome: comoTexto(formData.get("clienteNome")),
    clienteCpf: comoTexto(formData.get("clienteCpf")),
    prazoVigencia: comoTexto(formData.get("prazoVigencia")),
    motivo: comoTexto(formData.get("motivo")),
    descricao: comoTexto(formData.get("descricao")),
    parcelasEmAberto: comoTexto(formData.get("parcelasEmAberto")),
    dataCancelamento: comoTexto(formData.get("dataCancelamento")),
  };

  // Campos obrigatórios vão para o zod como string (mesmo vazia — a própria
  // mensagem de "obrigatório" do schema cobre isso); os exclusivos de cada
  // tipo de caso são omitidos quando ausentes, exatamente como antes.
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
    const fieldErrors: CriarCasoState["fieldErrors"] = {};
    for (const issue of parsed.error.issues) {
      const campo = issue.path[0];
      if (typeof campo === "string" && !(campo in fieldErrors)) {
        fieldErrors[campo as keyof CasoFormValores] = issue.message;
      }
    }
    return {
      error: parsed.error.issues[0]?.message ?? "Dados inválidos",
      fieldErrors,
      valores: valoresSubmetidos,
    };
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
    console.error("Erro ao criar caso:", error);
    return { error: mensagemErroCaso(error), valores: valoresSubmetidos };
  }

  const avisosAnexos = await validarEEnviarAnexos(supabase, data.id, formData);

  return {
    sucesso: {
      id: data.id,
      protocolo: data.protocolo,
      avisosAnexos: avisosAnexos.length > 0 ? avisosAnexos : undefined,
    },
  };
}
