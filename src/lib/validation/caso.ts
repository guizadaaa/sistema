import { z } from "zod";

import { cpfValido, somenteDigitos } from "./cpf";
import type { FilialCvc, MotivoCaso, PerfilUsuario, TipoCaso } from "@/lib/supabase/types";

export const TIPOS_CASO: readonly TipoCaso[] = [
  "alteracao_data",
  "cancelamento",
  "recadastro_sem_reserva",
  "inadimplencia",
];

// Cancelamento é restrito a gerente/adm/adm_master — mesma regra reforçada na
// policy casos_insert (RLS, supabase/migrations/20260721000001). Esta função
// só espelha a regra para a UI e a validação do server action; o banco é
// quem de fato impede a criação, nunca confiar só nisto aqui.
const PERFIS_QUE_CRIAM_CANCELAMENTO: readonly PerfilUsuario[] = ["gerente", "adm", "adm_master"];

export function tiposCasoPermitidos(perfil: PerfilUsuario): readonly TipoCaso[] {
  if (PERFIS_QUE_CRIAM_CANCELAMENTO.includes(perfil)) return TIPOS_CASO;
  return TIPOS_CASO.filter((t) => t !== "cancelamento");
}

export const MOTIVOS_CASO: readonly MotivoCaso[] = ["pedido_cliente", "erro_vendedor", "fornecedor"];

// Regra única de número de 14 dígitos (casos_contrato_numero_formato) —
// usada no contrato principal, nos contratos adicionais
// (casos_contratos_adicionais_formato) e nos recibos recadastrados
// (casos_recibos_recadastrados_formato). Só o rótulo da mensagem muda.
function numero14DigitosSchema(rotulo: string) {
  return z
    .string()
    .transform(somenteDigitos)
    .refine((v) => v.length === 14, `${rotulo} deve ter exatamente 14 números`);
}

const contratoNumeroSchema = numero14DigitosSchema("Contrato");

export const contratoAdicionalSchema = contratoNumeroSchema;
export const reciboRecadastradoSchema = numero14DigitosSchema("Recibo");

// Opcional, só nos tipos de cancelamento (casos_contrato_origem_por_tipo).
// Campo vazio no form chega como "" — vira undefined (não informado).
const contratoOrigemSchema = z.preprocess(
  (v) => (typeof v === "string" && v.trim() === "" ? undefined : v),
  numero14DigitosSchema("Contrato de origem").optional()
);

/** Tipos de caso de cancelamento — os únicos que aceitam "Contrato de origem". */
export const TIPOS_CASO_CANCELAMENTO: readonly TipoCaso[] = ["cancelamento", "inadimplencia"];

const camposComuns = {
  vendedorDono: z.string().uuid("Selecione o dono do caso"),
  contratoNumero: contratoNumeroSchema,
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
  contratoOrigem: contratoOrigemSchema,
});

export const casoSchema = z.discriminatedUnion("tipoCaso", [
  alteracaoDataOuCancelamento.extend({ tipoCaso: z.literal("alteracao_data") }),
  alteracaoDataOuCancelamento.extend({ tipoCaso: z.literal("cancelamento"), contratoOrigem: contratoOrigemSchema }),
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

/** Imagens coladas na Descrição: só os formatos de imagem já aceitos em anexos, mesmo limite de tamanho. */
export const DESCRICAO_IMAGEM_MIME_TYPES = ["image/jpeg", "image/png"] as const;
export const DESCRICAO_IMAGENS_MAXIMO = 5;

export const FILIAIS: readonly FilialCvc[] = ["1710", "1714", "1730"];
