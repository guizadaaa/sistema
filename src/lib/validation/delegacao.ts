import { z } from "zod";

export const criarDelegacaoSchema = z.object({
  gerenteId: z.string().uuid("Selecione o gerente"),
  fim: z
    .string()
    .optional()
    .refine((v) => !v || !Number.isNaN(Date.parse(v)), "Data inválida"),
});

export type CriarDelegacaoValues = z.infer<typeof criarDelegacaoSchema>;
