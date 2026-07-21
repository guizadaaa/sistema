import { z } from "zod";

import { bancoPorCodigo, CODIGO_BANCO_OUTRO } from "./bancos";
import { cpfValido, somenteDigitos } from "./cpf";
import { moedaParaNumero } from "./moeda";
import type { TipoDocumentoAnexo } from "@/lib/supabase/types";

export const TIPOS_DESFECHO = ["reembolso", "remarcacao", "carta_credito"] as const;
export const SUBTIPOS_REEMBOLSO = ["integral", "parcial", "sem_reembolso"] as const;
export const ORIGENS_REEMBOLSO_INTEGRAL = ["fornecedor", "saude"] as const;
export const SUBTIPOS_REMARCACAO = ["sem_custo", "com_custo"] as const;
export const ORIGENS_REMARCACAO_COM_CUSTO = ["saude", "outro"] as const;

// Espelha a constraint desfechos_campos_por_tipo
// (supabase/migrations/20260716000001_schema.sql, atualizada em
// 20260721000003 e 20260721000004) nos dois lados — client (UX) e server
// action (defesa em profundidade) — igual fizemos com casos_campos_por_tipo
// no formulário de criação de caso.
const reembolsoSchema = z
  .object({
    tipo: z.literal("reembolso"),
    subtipoReembolso: z.enum(SUBTIPOS_REEMBOLSO, { message: "Selecione o subtipo de reembolso" }),
    origemReembolsoIntegral: z.enum(ORIGENS_REEMBOLSO_INTEGRAL).optional(),
    // Um dos códigos de BANCOS, ou CODIGO_BANCO_OUTRO — banco_nome_completo
    // final é decidido no server action (registrarDesfecho), nunca confiando
    // no texto que o client mandar para um código já conhecido.
    bancoCodigo: z.string().optional(),
    bancoNomeCompleto: z.string().trim().optional(),
    bancoAgencia: z.string().trim().optional(),
    bancoConta: z.string().trim().optional(),
    bancoCpf: z
      .string()
      .optional()
      .transform((v) => (v ? somenteDigitos(v) : v)),
    valor: z
      .string()
      .optional()
      .transform((v) => (v ? moedaParaNumero(v) : undefined)),
  })
  .superRefine((data, ctx) => {
    if (data.subtipoReembolso === "integral" && !data.origemReembolsoIntegral) {
      ctx.addIssue({ code: "custom", message: "Selecione a origem do reembolso integral", path: ["origemReembolsoIntegral"] });
    }
    if (data.subtipoReembolso !== "integral" && data.origemReembolsoIntegral) {
      ctx.addIssue({ code: "custom", message: "Origem só se aplica ao reembolso integral", path: ["origemReembolsoIntegral"] });
    }
    if (data.subtipoReembolso !== "sem_reembolso") {
      if (!data.bancoCodigo) {
        ctx.addIssue({ code: "custom", message: "Selecione o banco", path: ["bancoCodigo"] });
      } else if (data.bancoCodigo === CODIGO_BANCO_OUTRO) {
        if (!data.bancoNomeCompleto) {
          ctx.addIssue({ code: "custom", message: "Informe o nome do banco", path: ["bancoNomeCompleto"] });
        }
      } else if (!bancoPorCodigo(data.bancoCodigo)) {
        ctx.addIssue({ code: "custom", message: "Banco inválido", path: ["bancoCodigo"] });
      }
      if (!data.bancoAgencia) {
        ctx.addIssue({ code: "custom", message: "Informe a agência", path: ["bancoAgencia"] });
      }
      if (!data.bancoConta) {
        ctx.addIssue({ code: "custom", message: "Informe a conta", path: ["bancoConta"] });
      }
      if (!data.bancoCpf || !cpfValido(data.bancoCpf)) {
        ctx.addIssue({ code: "custom", message: "CPF inválido", path: ["bancoCpf"] });
      }
      if (!data.valor) {
        ctx.addIssue({ code: "custom", message: "Informe o valor", path: ["valor"] });
      }
    }
  });

const remarcacaoSchema = z
  .object({
    tipo: z.literal("remarcacao"),
    subtipoRemarcacao: z.enum(SUBTIPOS_REMARCACAO, { message: "Selecione o subtipo de remarcação" }),
    // Só relevante para com_custo — gate da exigência de atestado_saude
    // (anexoObrigatorioFaltando abaixo), não mais o subtipo em si.
    origemRemarcacaoComCusto: z.enum(ORIGENS_REMARCACAO_COM_CUSTO).optional(),
    valorTaxas: z
      .string()
      .optional()
      .transform((v) => (v ? moedaParaNumero(v) : undefined)),
    valorDiferencaTarifaria: z
      .string()
      .optional()
      .transform((v) => (v ? moedaParaNumero(v) : undefined)),
  })
  .superRefine((data, ctx) => {
    if (data.subtipoRemarcacao === "com_custo") {
      if (data.valorTaxas === undefined) {
        ctx.addIssue({ code: "custom", message: "Informe o valor das taxas", path: ["valorTaxas"] });
      }
      if (data.valorDiferencaTarifaria === undefined) {
        ctx.addIssue({ code: "custom", message: "Informe a diferença tarifária", path: ["valorDiferencaTarifaria"] });
      }
      if (!data.origemRemarcacaoComCusto) {
        ctx.addIssue({ code: "custom", message: "Selecione o motivo", path: ["origemRemarcacaoComCusto"] });
      }
    } else if (data.origemRemarcacaoComCusto) {
      ctx.addIssue({ code: "custom", message: "Motivo só se aplica quando há custo", path: ["origemRemarcacaoComCusto"] });
    }
  });

const cartaCreditoSchema = z.object({
  tipo: z.literal("carta_credito"),
  valor: z
    .string()
    .transform(moedaParaNumero)
    .refine((v) => v > 0, "Informe o valor"),
});

export const desfechoSchema = z.discriminatedUnion("tipo", [
  reembolsoSchema,
  remarcacaoSchema,
  cartaCreditoSchema,
]);

export type DesfechoFormValues = z.infer<typeof desfechoSchema>;

/**
 * Anexo obrigatório por regra de negócio (seção 3, ajustada em
 * 20260721000004): remarcação com_custo exige atestado de saúde só quando o
 * motivo é saúde (origemRemarcacaoComCusto === "saude" — "outro" motivo
 * voluntário não exige nada); reembolso integral por saúde exige atestado
 * de saúde OU certidão de óbito. Retorna os tipos aceitos quando a
 * exigência se aplica e nenhum dos anexos já enviados a satisfaz — null
 * caso não haja exigência ou ela já esteja satisfeita.
 */
export function anexoObrigatorioFaltando(
  dados: Pick<DesfechoFormValues, "tipo"> & Partial<DesfechoFormValues>,
  tiposAnexosExistentes: TipoDocumentoAnexo[]
): TipoDocumentoAnexo[] | null {
  let tiposAceitos: TipoDocumentoAnexo[] | null = null;

  if (
    dados.tipo === "remarcacao" &&
    "subtipoRemarcacao" in dados &&
    dados.subtipoRemarcacao === "com_custo" &&
    "origemRemarcacaoComCusto" in dados &&
    dados.origemRemarcacaoComCusto === "saude"
  ) {
    tiposAceitos = ["atestado_saude"];
  }

  if (
    dados.tipo === "reembolso" &&
    "subtipoReembolso" in dados &&
    dados.subtipoReembolso === "integral" &&
    "origemReembolsoIntegral" in dados &&
    dados.origemReembolsoIntegral === "saude"
  ) {
    tiposAceitos = ["atestado_saude", "certidao_obito"];
  }

  if (!tiposAceitos) return null;

  const satisfeito = tiposAceitos.some((t) => tiposAnexosExistentes.includes(t));
  return satisfeito ? null : tiposAceitos;
}
