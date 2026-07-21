import { z } from "zod";

import { moedaParaNumero } from "./moeda";
import type { QuemPagaMulta } from "@/lib/supabase/types";

export const QUEM_PAGA_OPCOES: readonly QuemPagaMulta[] = ["cliente", "vendedor"];

const camposComuns = {
  multaContratualValor: z
    .string()
    .transform(moedaParaNumero)
    .refine((v) => v >= 0, "Deve ser zero ou maior"),
  multaFornecedorValor: z
    .string()
    .transform(moedaParaNumero)
    .refine((v) => v >= 0, "Deve ser zero ou maior"),
};

// Espelha a constraint implicacoes_reducoes_apenas_vendedor (schema.sql):
// reduções só existem quando quem_paga = vendedor — para cliente nem
// aparecem no formulário.
const quemPagaClienteSchema = z.object({
  ...camposComuns,
  quemPaga: z.literal("cliente"),
});

// Espelha implicacoes_reducao_comissao_valor / implicacoes_cortesia_valor:
// o valor só é exigido quando o respectivo booleano está marcado.
const quemPagaVendedorSchema = z
  .object({
    ...camposComuns,
    quemPaga: z.literal("vendedor"),
    reducaoMarkup: z.boolean(),
    reducaoComissao: z.boolean(),
    reducaoComissaoValor: z
      .string()
      .optional()
      .transform((v) => (v ? moedaParaNumero(v) : undefined))
      .refine((v) => v === undefined || v > 0, "Informe o valor da redução de comissão"),
    utilizacaoCortesia: z.boolean(),
    utilizacaoCortesiaValor: z
      .string()
      .optional()
      .transform((v) => (v ? moedaParaNumero(v) : undefined))
      .refine((v) => v === undefined || v > 0, "Informe o valor da cortesia utilizada"),
  })
  .superRefine((data, ctx) => {
    if (data.reducaoComissao && data.reducaoComissaoValor === undefined) {
      ctx.addIssue({
        code: "custom",
        message: "Informe o valor da redução de comissão",
        path: ["reducaoComissaoValor"],
      });
    }
    if (data.utilizacaoCortesia && data.utilizacaoCortesiaValor === undefined) {
      ctx.addIssue({
        code: "custom",
        message: "Informe o valor da cortesia utilizada",
        path: ["utilizacaoCortesiaValor"],
      });
    }
  });

export const implicacaoSchema = z.discriminatedUnion("quemPaga", [
  quemPagaClienteSchema,
  quemPagaVendedorSchema,
]);

export type ImplicacaoFormValues = z.infer<typeof implicacaoSchema>;
