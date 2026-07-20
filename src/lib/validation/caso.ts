import { z } from "zod";

import { cpfValido, somenteDigitos } from "./cpf";
import type { FilialCvc, MotivoCaso, TipoCaso } from "@/lib/supabase/types";

export const TIPOS_CASO: readonly TipoCaso[] = [
  "alteracao_data",
  "cancelamento",
  "recadastro_sem_reserva",
  "inadimplencia",
];

export const MOTIVOS_CASO: readonly MotivoCaso[] = ["pedido_cliente", "erro_vendedor", "fornecedor"];

const camposComuns = {
  vendedorDono: z.string().uuid("Selecione o dono do caso"),
  contratoNumero: z
    .string()
    .transform(somenteDigitos)
    .refine((v) => v.length === 14, "Contrato deve ter exatamente 14 números"),
  clienteNome: z.string().trim().min(1, "Informe o nome completo do contratante"),
  clienteCpf: z
    .string()
    .transform(somenteDigitos)
    .refine((v) => v.length === 11, "CPF deve ter 11 dígitos")
    .refine(cpfValido, "CPF inválido"),
  prazoVigencia: z.string().refine((v) => !Number.isNaN(Date.parse(v)), "Data inválida"),
};

// As quatro variantes espelham exatamente a constraint casos_campos_por_tipo
// (supabase/migrations/20260716000001_schema.sql): motivo+descricao exigidos
// em alteração de data/cancelamento, só descricao em recadastro, e
// parcelas_em_aberto+data_cancelamento (sem motivo/descricao) em
// inadimplência. Mesma regra nos dois lados — client (UX) e o insert no
// server action (defesa em profundidade) — para nunca divergir da constraint.
const alteracaoDataOuCancelamento = z.object({
  ...camposComuns,
  tipoCaso: z.enum(["alteracao_data", "cancelamento"]),
  motivo: z.enum(MOTIVOS_CASO as [MotivoCaso, ...MotivoCaso[]], {
    message: "Selecione o motivo",
  }),
  descricao: z.string().trim().min(1, "Descrição obrigatória"),
});

const recadastroSemReserva = z.object({
  ...camposComuns,
  tipoCaso: z.literal("recadastro_sem_reserva"),
  descricao: z.string().trim().min(1, "Descrição obrigatória"),
});

const inadimplencia = z.object({
  ...camposComuns,
  tipoCaso: z.literal("inadimplencia"),
  parcelasEmAberto: z.coerce.number().int("Deve ser um número inteiro").positive("Deve ser maior que zero"),
  dataCancelamento: z.string().refine((v) => !Number.isNaN(Date.parse(v)), "Data inválida"),
});

export const casoSchema = z.discriminatedUnion("tipoCaso", [
  alteracaoDataOuCancelamento.extend({ tipoCaso: z.literal("alteracao_data") }),
  alteracaoDataOuCancelamento.extend({ tipoCaso: z.literal("cancelamento") }),
  recadastroSemReserva,
  inadimplencia,
]);

export type CasoFormValues = z.infer<typeof casoSchema>;

export const ANEXO_TIPOS_DOCUMENTO = [
  "carta_cancelamento",
  "atestado_saude",
  "certidao_obito",
  "outro",
] as const;

export const ANEXO_MIME_TYPES = ["application/pdf", "image/jpeg", "image/png"] as const;
export const ANEXO_TAMANHO_MAXIMO_BYTES = 10 * 1024 * 1024; // 10 MB — mesmo limite do bucket

export const FILIAIS: readonly FilialCvc[] = ["1710", "1714", "1730"];
