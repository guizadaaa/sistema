import { z } from "zod";

import { cpfValido, somenteDigitos } from "./cpf";
import type { TipoDocumentoAnexo } from "@/lib/supabase/types";

export const TIPOS_DESFECHO = ["reembolso", "remarcacao", "carta_credito"] as const;
export const SUBTIPOS_REEMBOLSO = ["integral", "parcial", "sem_reembolso"] as const;
export const ORIGENS_REEMBOLSO_INTEGRAL = ["fornecedor", "saude"] as const;
export const SUBTIPOS_REMARCACAO = ["sem_custo", "com_custo"] as const;

// Espelha a constraint desfechos_campos_por_tipo
// (supabase/migrations/20260716000001_schema.sql) nos dois lados — client
// (UX) e server action (defesa em profundidade) — igual fizemos com
// casos_campos_por_tipo no formulário de criação de caso.
const reembolsoSchema = z
  .object({
    tipo: z.literal("reembolso"),
    subtipoReembolso: z.enum(SUBTIPOS_REEMBOLSO, { message: "Selecione o subtipo de reembolso" }),
    origemReembolsoIntegral: z.enum(ORIGENS_REEMBOLSO_INTEGRAL).optional(),
    bancoNomeCompleto: z.string().trim().optional(),
    bancoAgencia: z.string().trim().optional(),
    bancoConta: z.string().trim().optional(),
    bancoCpf: z
      .string()
      .optional()
      .transform((v) => (v ? somenteDigitos(v) : v)),
    valor: z.coerce.number().positive().optional(),
  })
  .superRefine((data, ctx) => {
    if (data.subtipoReembolso === "integral" && !data.origemReembolsoIntegral) {
      ctx.addIssue({ code: "custom", message: "Selecione a origem do reembolso integral", path: ["origemReembolsoIntegral"] });
    }
    if (data.subtipoReembolso !== "integral" && data.origemReembolsoIntegral) {
      ctx.addIssue({ code: "custom", message: "Origem só se aplica ao reembolso integral", path: ["origemReembolsoIntegral"] });
    }
    if (data.subtipoReembolso !== "sem_reembolso") {
      if (!data.bancoNomeCompleto) {
        ctx.addIssue({ code: "custom", message: "Informe o nome completo", path: ["bancoNomeCompleto"] });
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
    valorTaxas: z.coerce.number().optional(),
    valorDiferencaTarifaria: z.coerce.number().optional(),
  })
  .superRefine((data, ctx) => {
    if (data.subtipoRemarcacao === "com_custo") {
      if (data.valorTaxas === undefined || Number.isNaN(data.valorTaxas)) {
        ctx.addIssue({ code: "custom", message: "Informe o valor das taxas", path: ["valorTaxas"] });
      }
      if (data.valorDiferencaTarifaria === undefined || Number.isNaN(data.valorDiferencaTarifaria)) {
        ctx.addIssue({ code: "custom", message: "Informe a diferença tarifária", path: ["valorDiferencaTarifaria"] });
      }
    }
  });

const cartaCreditoSchema = z.object({
  tipo: z.literal("carta_credito"),
  valor: z.coerce.number().positive("Informe o valor"),
});

export const desfechoSchema = z.discriminatedUnion("tipo", [
  reembolsoSchema,
  remarcacaoSchema,
  cartaCreditoSchema,
]);

export type DesfechoFormValues = z.infer<typeof desfechoSchema>;

/**
 * Anexo obrigatório por regra de negócio (seção 3): remarcação com_custo
 * exige atestado de saúde; reembolso integral por saúde exige atestado de
 * saúde OU certidão de óbito. Retorna os tipos aceitos quando a exigência
 * se aplica e nenhum dos anexos já enviados a satisfaz — null caso não haja
 * exigência ou ela já esteja satisfeita.
 */
export function anexoObrigatorioFaltando(
  dados: Pick<DesfechoFormValues, "tipo"> & Partial<DesfechoFormValues>,
  tiposAnexosExistentes: TipoDocumentoAnexo[]
): TipoDocumentoAnexo[] | null {
  let tiposAceitos: TipoDocumentoAnexo[] | null = null;

  if (dados.tipo === "remarcacao" && "subtipoRemarcacao" in dados && dados.subtipoRemarcacao === "com_custo") {
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
