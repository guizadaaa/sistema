import type {
  FilialCvc,
  MotivoCaso,
  PerfilUsuario,
  TipoCaso,
  TipoDocumentoAnexo,
} from "@/lib/supabase/types";

export const PERFIL_LABELS: Record<PerfilUsuario, string> = {
  vendedor: "Vendedor",
  gerente: "Gerente",
  adm: "Adm",
  adm_master: "Adm Master",
};

export const FILIAL_LABELS: Record<FilialCvc, string> = {
  "1710": "1710 — Palladium",
  "1714": "1714 — Batel",
  "1730": "1730 — São José",
};

export const TIPO_CASO_LABELS: Record<TipoCaso, string> = {
  alteracao_data: "Alteração de data",
  cancelamento: "Cancelamento",
  recadastro_sem_reserva: "Recadastro por não geração de reserva",
  inadimplencia: "Cancelamento por inadimplência",
};

export const MOTIVO_LABELS: Record<MotivoCaso, string> = {
  pedido_cliente: "Pedido do cliente",
  erro_vendedor: "Erro do vendedor",
  fornecedor: "Fornecedor",
};

export const ANEXO_TIPO_LABELS: Record<TipoDocumentoAnexo, string> = {
  carta_cancelamento: "Carta de cancelamento",
  atestado_saude: "Atestado de saúde",
  certidao_obito: "Certidão de óbito",
  outro: "Outro",
};
