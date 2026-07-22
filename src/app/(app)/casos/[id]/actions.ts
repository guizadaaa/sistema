"use server";

import { revalidatePath } from "next/cache";

import { requireCurrentUser } from "@/lib/auth/current-user";
import { validarEEnviarAnexos } from "@/lib/casos/anexos";
import { validarEInserirContratosAdicionais } from "@/lib/casos/contratos-adicionais";
import { createClient } from "@/lib/supabase/server";
import { bancoPorCodigo, CODIGO_BANCO_OUTRO } from "@/lib/validation/bancos";
import { anexoObrigatorioFaltando, desfechoSchema } from "@/lib/validation/desfecho";
import { implicacaoSchema } from "@/lib/validation/implicacao";
import { ANEXO_TIPO_LABELS } from "@/lib/labels";
import type {
  OrigemReembolsoIntegral,
  OrigemRemarcacaoComCusto,
  StatusCaso,
  SubtipoReembolso,
  SubtipoRemarcacao,
  TipoDesfecho,
} from "@/lib/supabase/types";

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

export type AdicionarContratoState = {
  avisos?: string[];
};

export async function adicionarContratosAoCaso(
  casoId: string,
  _prevState: AdicionarContratoState,
  formData: FormData
): Promise<AdicionarContratoState> {
  await requireCurrentUser();
  const supabase = await createClient();

  const avisos = await validarEInserirContratosAdicionais(supabase, casoId, formData);
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

/**
 * A RLS de status_historico é a autoridade real sobre quem pode inserir o
 * quê (admin, ou gerente com delegação ativa restrito à própria filial, e
 * Ouvidoria só admin) — este action não reimplementa essa checagem, só
 * repassa o erro do Postgres de forma legível quando ela rejeitar.
 */
export async function avancarStatus(casoId: string, novoStatus: StatusCaso): Promise<{ error?: string }> {
  await requireCurrentUser();
  const supabase = await createClient();

  const { error } = await supabase.from("status_historico").insert({ caso_id: casoId, status: novoStatus });

  if (error) {
    console.error("Erro ao avançar status:", error);
    return { error: "Não foi possível avançar o status. Verifique se você tem permissão para esta ação." };
  }

  revalidatePath(`/casos/${casoId}`);
  return {};
}

export async function marcarElegivelOuvidoria(casoId: string): Promise<{ error?: string }> {
  await requireCurrentUser();
  const supabase = await createClient();

  const { error } = await supabase.from("casos").update({ elegivel_ouvidoria: true }).eq("id", casoId);

  if (error) {
    console.error("Erro ao marcar elegível a Ouvidoria:", error);
    return { error: "Não foi possível marcar o caso como elegível a Ouvidoria." };
  }

  revalidatePath(`/casos/${casoId}`);
  return {};
}

export type RegistrarDesfechoState = {
  error?: string;
};

type DesfechoParaGravar = {
  tipo: TipoDesfecho;
  subtipo_reembolso: SubtipoReembolso | null;
  origem_reembolso_integral: OrigemReembolsoIntegral | null;
  banco_codigo: string | null;
  banco_nome_completo: string | null;
  banco_agencia: string | null;
  banco_conta: string | null;
  banco_cpf: string | null;
  valor: number | null;
  subtipo_remarcacao: SubtipoRemarcacao | null;
  origem_remarcacao_com_custo: OrigemRemarcacaoComCusto | null;
  valor_taxas: number | null;
  valor_diferenca_tarifaria: number | null;
};

/**
 * Parsing + validação compartilhados entre registrar um desfecho novo e
 * corrigir um existente (mesmos campos, mesmas regras — só o destino da
 * escrita muda). A exigência de anexo (seção 3: remarcação com_custo exige
 * atestado de saúde; reembolso integral por saúde exige atestado ou
 * certidão de óbito) é revalidada aqui contra o banco, nunca contra o que o
 * client alega ter carregado — o mesmo princípio de "nunca confiar só no
 * client" que já aplicamos a CPF e ao tipo/tamanho de arquivo.
 */
async function parseDesfechoFormData(
  casoId: string,
  formData: FormData
): Promise<{ error: string } | { dados: DesfechoParaGravar }> {
  const tipo = formData.get("tipo");
  const raw =
    tipo === "reembolso"
      ? {
          tipo,
          subtipoReembolso: formData.get("subtipoReembolso") || undefined,
          origemReembolsoIntegral: formData.get("origemReembolsoIntegral") || undefined,
          bancoCodigo: formData.get("bancoCodigo") || undefined,
          bancoNomeCompleto: formData.get("bancoNomeCompleto") || undefined,
          bancoAgencia: formData.get("bancoAgencia") || undefined,
          bancoConta: formData.get("bancoConta") || undefined,
          bancoCpf: formData.get("bancoCpf") || undefined,
          valor: formData.get("valor") || undefined,
        }
      : tipo === "remarcacao"
        ? {
            tipo,
            subtipoRemarcacao: formData.get("subtipoRemarcacao") || undefined,
            origemRemarcacaoComCusto: formData.get("origemRemarcacaoComCusto") || undefined,
            valorTaxas: formData.get("valorTaxas") || undefined,
            valorDiferencaTarifaria: formData.get("valorDiferencaTarifaria") || undefined,
          }
        : { tipo, valor: formData.get("valor") || undefined };

  const parsed = desfechoSchema.safeParse(raw);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dados inválidos" };
  }

  const dados = parsed.data;
  const supabase = await createClient();

  const { data: anexosAtuais, error: anexosError } = await supabase
    .from("anexos")
    .select("tipo_documento")
    .eq("caso_id", casoId);
  if (anexosError) throw anexosError;

  const tiposFaltando = anexoObrigatorioFaltando(dados, (anexosAtuais ?? []).map((a) => a.tipo_documento));
  if (tiposFaltando) {
    return {
      error: `Anexe ${tiposFaltando.map((t) => ANEXO_TIPO_LABELS[t]).join(" ou ")} ao caso antes de registrar este desfecho.`,
    };
  }

  // banco_nome_completo nunca vem direto do que o client digitou para um
  // código conhecido — é derivado aqui a partir de BANCOS, a mesma lista que
  // alimentou o <select>. Só em "outro" o texto livre do client é usado.
  const banco =
    "bancoCodigo" in dados && dados.bancoCodigo
      ? dados.bancoCodigo === CODIGO_BANCO_OUTRO
        ? { banco_codigo: null, banco_nome_completo: dados.bancoNomeCompleto ?? null }
        : { banco_codigo: dados.bancoCodigo, banco_nome_completo: bancoPorCodigo(dados.bancoCodigo)?.nome ?? null }
      : { banco_codigo: null, banco_nome_completo: null };

  return {
    dados: {
      tipo: dados.tipo,
      subtipo_reembolso: "subtipoReembolso" in dados ? dados.subtipoReembolso : null,
      origem_reembolso_integral: "origemReembolsoIntegral" in dados ? (dados.origemReembolsoIntegral ?? null) : null,
      banco_codigo: banco.banco_codigo,
      banco_nome_completo: banco.banco_nome_completo,
      banco_agencia: "bancoAgencia" in dados ? (dados.bancoAgencia ?? null) : null,
      banco_conta: "bancoConta" in dados ? (dados.bancoConta ?? null) : null,
      banco_cpf: "bancoCpf" in dados ? (dados.bancoCpf ?? null) : null,
      valor: "valor" in dados ? (dados.valor ?? null) : null,
      subtipo_remarcacao: "subtipoRemarcacao" in dados ? dados.subtipoRemarcacao : null,
      origem_remarcacao_com_custo: "origemRemarcacaoComCusto" in dados ? (dados.origemRemarcacaoComCusto ?? null) : null,
      valor_taxas: "valorTaxas" in dados ? (dados.valorTaxas ?? null) : null,
      valor_diferenca_tarifaria: "valorDiferencaTarifaria" in dados ? (dados.valorDiferencaTarifaria ?? null) : null,
    },
  };
}

export async function registrarDesfecho(
  casoId: string,
  _prevState: RegistrarDesfechoState,
  formData: FormData
): Promise<RegistrarDesfechoState> {
  await requireCurrentUser();

  const resultado = await parseDesfechoFormData(casoId, formData);
  if ("error" in resultado) return { error: resultado.error };

  const supabase = await createClient();
  const { error } = await supabase.from("desfechos").insert({ caso_id: casoId, ...resultado.dados });

  if (error) {
    console.error("Erro ao registrar desfecho:", error);
    return { error: "Não foi possível registrar o desfecho. Verifique se você tem permissão para esta ação." };
  }

  revalidatePath(`/casos/${casoId}`);
  return {};
}

export type CorrigirDesfechoState = {
  error?: string;
};

/**
 * Desfechos são imutáveis (dado bancário/financeiro — mesmo racional de
 * casos nunca serem apagados fisicamente): corrigir não faz UPDATE no
 * registro existente, cria um novo e marca o antigo como substituído, via
 * RPC (registrar_correcao_desfecho, 20260722000001_desfechos_correcao_com_historico.sql)
 * — a mesma elegibilidade de registrar (admin, ou gerente com delegação
 * ativa na filial do caso) é checada dentro da função, não por RLS.
 */
export async function corrigirDesfecho(
  casoId: string,
  desfechoAnteriorId: string,
  _prevState: CorrigirDesfechoState,
  formData: FormData
): Promise<CorrigirDesfechoState> {
  await requireCurrentUser();

  const resultado = await parseDesfechoFormData(casoId, formData);
  if ("error" in resultado) return { error: resultado.error };

  const supabase = await createClient();
  const { error } = await supabase.rpc("registrar_correcao_desfecho", {
    p_desfecho_anterior_id: desfechoAnteriorId,
    p_tipo: resultado.dados.tipo,
    p_subtipo_reembolso: resultado.dados.subtipo_reembolso,
    p_origem_reembolso_integral: resultado.dados.origem_reembolso_integral,
    p_banco_codigo: resultado.dados.banco_codigo,
    p_banco_nome_completo: resultado.dados.banco_nome_completo,
    p_banco_agencia: resultado.dados.banco_agencia,
    p_banco_conta: resultado.dados.banco_conta,
    p_banco_cpf: resultado.dados.banco_cpf,
    p_valor: resultado.dados.valor,
    p_subtipo_remarcacao: resultado.dados.subtipo_remarcacao,
    p_origem_remarcacao_com_custo: resultado.dados.origem_remarcacao_com_custo,
    p_valor_taxas: resultado.dados.valor_taxas,
    p_valor_diferenca_tarifaria: resultado.dados.valor_diferenca_tarifaria,
  });

  if (error) {
    console.error("Erro ao corrigir desfecho:", error);
    return { error: "Não foi possível corrigir o desfecho. Verifique se você tem permissão para esta ação." };
  }

  revalidatePath(`/casos/${casoId}`);
  return {};
}

/**
 * Cancela (anula) um desfecho registrado por engano, sem substituto — via
 * RPC cancelar_desfecho, mesma elegibilidade e mesma regra de "só
 * transiciona uma vez" de corrigirDesfecho.
 */
export async function cancelarDesfecho(casoId: string, desfechoId: string): Promise<{ error?: string }> {
  await requireCurrentUser();
  const supabase = await createClient();

  const { error } = await supabase.rpc("cancelar_desfecho", { p_desfecho_id: desfechoId });

  if (error) {
    console.error("Erro ao cancelar desfecho:", error);
    return { error: "Não foi possível cancelar o desfecho. Verifique se você tem permissão para esta ação." };
  }

  revalidatePath(`/casos/${casoId}`);
  return {};
}

export type RegistrarImplicacaoState = {
  error?: string;
};

/**
 * Upsert por caso_id (unique em implicacoes — um registro por caso): a
 * mesma condição vale tanto pro INSERT (primeiro lançamento) quanto pro
 * UPDATE (correção posterior — implicacoes_insert e implicacoes_update têm
 * a mesma regra de RLS: admin, ou gerente com delegação ativa na própria
 * filial). Reduções (markup/comissão/cortesia) só existem quando
 * quem_paga = vendedor — a constraint implicacoes_reducoes_apenas_vendedor
 * já impede o resto no banco, aqui só evitamos oferecer os campos.
 */
export async function registrarImplicacao(
  casoId: string,
  _prevState: RegistrarImplicacaoState,
  formData: FormData
): Promise<RegistrarImplicacaoState> {
  await requireCurrentUser();

  const quemPaga = formData.get("quemPaga");
  const raw =
    quemPaga === "vendedor"
      ? {
          quemPaga,
          multaContratualValor: formData.get("multaContratualValor"),
          multaFornecedorValor: formData.get("multaFornecedorValor"),
          reducaoMarkup: formData.get("reducaoMarkup") === "on",
          reducaoComissao: formData.get("reducaoComissao") === "on",
          reducaoComissaoValor: formData.get("reducaoComissaoValor") || undefined,
          utilizacaoCortesia: formData.get("utilizacaoCortesia") === "on",
          utilizacaoCortesiaValor: formData.get("utilizacaoCortesiaValor") || undefined,
        }
      : {
          quemPaga,
          multaContratualValor: formData.get("multaContratualValor"),
          multaFornecedorValor: formData.get("multaFornecedorValor"),
        };

  const parsed = implicacaoSchema.safeParse(raw);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dados inválidos" };
  }

  const dados = parsed.data;
  const supabase = await createClient();

  const { error } = await supabase.from("implicacoes").upsert(
    {
      caso_id: casoId,
      multa_contratual_valor: dados.multaContratualValor,
      multa_fornecedor_valor: dados.multaFornecedorValor,
      quem_paga: dados.quemPaga,
      reducao_markup: "reducaoMarkup" in dados ? dados.reducaoMarkup : false,
      reducao_comissao: "reducaoComissao" in dados ? dados.reducaoComissao : false,
      reducao_comissao_valor: "reducaoComissaoValor" in dados ? (dados.reducaoComissaoValor ?? null) : null,
      utilizacao_cortesia: "utilizacaoCortesia" in dados ? dados.utilizacaoCortesia : false,
      utilizacao_cortesia_valor: "utilizacaoCortesiaValor" in dados ? (dados.utilizacaoCortesiaValor ?? null) : null,
    },
    { onConflict: "caso_id" }
  );

  if (error) {
    console.error("Erro ao registrar implicações:", error);
    return { error: "Não foi possível registrar as implicações. Verifique se você tem permissão para esta ação." };
  }

  revalidatePath(`/casos/${casoId}`);
  return {};
}
