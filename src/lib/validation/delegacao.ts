import { z } from "zod";

const campoData = z.string().refine((v) => !Number.isNaN(Date.parse(v)), "Data inválida");

export const criarDelegacaoSchema = z
  .object({
    gerenteId: z.string().uuid("Selecione o gerente"),
    // Em branco = começa imediatamente (mesmo comportamento de sempre —
    // a coluna inicio tem default now() no banco). Só overrideamos quando
    // o adm_master escolhe uma data futura, para agendar com antecedência.
    inicio: campoData.optional(),
    fim: campoData.optional(),
  })
  .refine((data) => !data.inicio || !data.fim || data.fim > data.inicio, {
    message: "Término deve ser depois do início",
    path: ["fim"],
  });

export type CriarDelegacaoValues = z.infer<typeof criarDelegacaoSchema>;

// Editar uma delegação agendada (ainda não iniciada, ver status.ts): início
// aqui é obrigatório — diferente da criação, não há um "agora" óbvio para
// assumir se o campo vier em branco numa edição.
export const editarDelegacaoSchema = z
  .object({
    gerenteId: z.string().uuid("Selecione o gerente"),
    inicio: campoData,
    fim: campoData.optional(),
  })
  .refine((data) => !data.fim || data.fim > data.inicio, {
    message: "Término deve ser depois do início",
    path: ["fim"],
  });

export type EditarDelegacaoValues = z.infer<typeof editarDelegacaoSchema>;
