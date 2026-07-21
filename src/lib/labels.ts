import type {
  AcaoAuditoria,
  FilialCvc,
  MotivoCaso,
  OrigemRemarcacaoComCusto,
  PerfilUsuario,
  QuemPagaMulta,
  StatusCaso,
  SubtipoReembolso,
  SubtipoRemarcacao,
  TipoCaso,
  TipoDesfecho,
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

export const STATUS_LABELS: Record<StatusCaso, string> = {
  inicial: "Inicial",
  recepcionado: "Recepcionado",
  em_andamento_interno: "Em andamento interno",
  reavaliacao: "Reavaliação",
  resolvido: "Resolvido",
  ouvidoria: "Ouvidoria",
};

export const TIPO_DESFECHO_LABELS: Record<TipoDesfecho, string> = {
  reembolso: "Reembolso",
  remarcacao: "Remarcação",
  carta_credito: "Carta de crédito",
};

export const SUBTIPO_REEMBOLSO_LABELS: Record<SubtipoReembolso, string> = {
  integral: "Integral",
  parcial: "Parcial",
  sem_reembolso: "Sem reembolso",
};

export const SUBTIPO_REMARCACAO_LABELS: Record<SubtipoRemarcacao, string> = {
  sem_custo: "Sem custo (fornecedor)",
  com_custo: "Com custo (voluntário)",
};

// Só se aplica a subtipo_remarcacao = 'com_custo' — mesmo papel de
// origem_reembolso_integral (fornecedor/saúde): motivo = 'saude' é o único
// que aciona a exigência automática de atestado_saude (ver
// anexoObrigatorioFaltando em validation/desfecho.ts).
export const ORIGEM_REMARCACAO_COM_CUSTO_LABELS: Record<OrigemRemarcacaoComCusto, string> = {
  saude: "Saúde",
  outro: "Outro motivo",
};

export const QUEM_PAGA_LABELS: Record<QuemPagaMulta, string> = {
  cliente: "Cliente",
  vendedor: "Vendedor",
};

export const ACAO_AUDITORIA_LABELS: Record<AcaoAuditoria, string> = {
  insert: "Criação",
  update: "Alteração",
  delete: "Exclusão",
  download_signed_url: "Download de anexo",
};

// Nomes das tabelas que os triggers de auditoria realmente gravam (ver
// log_auditoria em 20260717000001_auditoria.sql) — tg_table_name entrega o
// nome cru da tabela, aqui só a versão amigável pra exibição.
export const TABELA_AUDITORIA_LABELS: Record<string, string> = {
  usuarios: "Usuários",
  implicacoes: "Implicações financeiras",
  desfechos: "Desfechos",
  anexos: "Anexos",
};
