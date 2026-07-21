"use server";

import type { PostgrestError } from "@supabase/supabase-js";

import { requireCurrentUser } from "@/lib/auth/current-user";
import { createClient } from "@/lib/supabase/server";
import { validarEEnviarAnexos } from "@/lib/casos/anexos";
import { validarEInserirContratosAdicionais } from "@/lib/casos/contratos-adicionais";
import { casoSchema, tiposCasoPermitidos } from "@/lib/validation/caso";

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
  sucesso?: { id: string; protocolo: number; avisosAnexos?: string[]; avisosContratos?: string[] };
};

/** Para reidratar o formulário após um erro — nunca undefined, mesmo vazio. */
function comoTexto(valor: FormDataEntryValue | null): string {
  return typeof valor === "string" ? valor : "";
}

const MENSAGEM_GENERICA = "Não foi possível criar o caso. Verifique os dados e tente novamente.";

type ErroAnalisado = {
  error: string;
  fieldErrors?: CriarCasoState["fieldErrors"];
};

/**
 * Traduz os erros de banco mais comuns nesse insert para uma mensagem clara
 * em português, em vez do JSON técnico do Postgres (nunca expondo detalhe
 * interno como o uuid do dono). Cobre só os casos conhecidos deste schema;
 * qualquer coisa fora daqui cai na mensagem genérica, para nunca vazar
 * detalhe técnico não mapeado ao usuário final.
 */
function analisarErroCaso(error: PostgrestError): ErroAnalisado {
  // P0001 = "raise exception" de um trigger nosso.
  if (error.code === "P0001") {
    // set_caso_defaults: dono sem filial própria (adm/adm_master) e o
    // contrato não começa com um código de filial válido — a mensagem
    // crua do trigger inclui o uuid do dono, técnico demais para o usuário
    // final; aqui vira uma mensagem direta, presa ao campo Contrato.
    if (error.message.includes("não tem filial definida")) {
      const mensagem = "O número de contrato não começa com um código de filial válido (1710, 1714 ou 1730).";
      return { error: mensagem, fieldErrors: { contratoNumero: mensagem } };
    }
    // Outras exceções (ex.: transferência de casos) já vêm escritas para
    // humanos em português, seguras para mostrar direto.
    return { error: error.message };
  }

  // 23502 = not_null_violation. O único caso esperado aqui é "filial", que a
  // trigger set_caso_defaults deriva do dono escolhido — só fica nula quando
  // o dono é um adm/adm_master (que não tem filial própria) e o contrato
  // também não permite derivar uma. Na prática deveria sempre cair no
  // P0001 acima; este é só um fallback caso a trigger mude no futuro.
  if (error.code === "23502" && error.message.includes('"filial"')) {
    return {
      error: "Não é possível registrar o caso: não foi possível determinar a filial. Verifique o dono do caso e o número do contrato.",
    };
  }

  // 23514 = check_violation — cada constraint aqui já é validada em
  // dobro no client/zod antes do insert, então só chega aqui em caso de bug
  // ou uso direto da API; ainda assim vale traduzir as conhecidas.
  if (error.code === "23514") {
    if (error.message.includes("casos_cpf_formato")) {
      return { error: "CPF do cliente em formato inválido.", fieldErrors: { clienteCpf: "CPF inválido." } };
    }
    if (error.message.includes("casos_contrato_numero_formato")) {
      const mensagem = "Contrato deve ter exatamente 14 números.";
      return { error: mensagem, fieldErrors: { contratoNumero: mensagem } };
    }
    if (error.message.includes("casos_campos_por_tipo")) {
      return { error: "Os dados informados não correspondem ao tipo de caso selecionado." };
    }
  }

  return { error: MENSAGEM_GENERICA };
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

  // Defesa em profundidade: a UI já esconde "Cancelamento" para vendedor e a
  // policy casos_insert (RLS) bloqueia o insert no banco de qualquer forma —
  // esta checagem só evita um round-trip desnecessário e devolve o erro
  // preso ao campo, como as demais validações deste action.
  if (!tiposCasoPermitidos(usuario.perfil).includes(dados.tipoCaso)) {
    const mensagem = "Você não tem permissão para criar um caso deste tipo.";
    return { error: mensagem, fieldErrors: { tipoCaso: mensagem }, valores: valoresSubmetidos };
  }

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
    const analisado = analisarErroCaso(error);
    return { error: analisado.error, fieldErrors: analisado.fieldErrors, valores: valoresSubmetidos };
  }

  const avisosAnexos = await validarEEnviarAnexos(supabase, data.id, formData);
  const avisosContratos = await validarEInserirContratosAdicionais(supabase, data.id, formData);

  return {
    sucesso: {
      id: data.id,
      protocolo: data.protocolo,
      avisosAnexos: avisosAnexos.length > 0 ? avisosAnexos : undefined,
      avisosContratos: avisosContratos.length > 0 ? avisosContratos : undefined,
    },
  };
}
