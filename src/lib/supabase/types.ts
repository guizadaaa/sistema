// Tipos gerados manualmente a partir de supabase/migrations/*.sql.
// Quando o projeto Supabase estiver criado, prefira regenerar com:
//   npx supabase gen types typescript --project-id <id> > src/lib/supabase/types.ts

export type PerfilUsuario = "vendedor" | "gerente" | "adm" | "adm_master";
export type FilialCvc = "1710" | "1714" | "1730";
export type TipoCaso =
  | "alteracao_data"
  | "cancelamento"
  | "recadastro_sem_reserva"
  | "inadimplencia";
export type MotivoCaso = "pedido_cliente" | "erro_vendedor" | "fornecedor";
export type StatusCaso =
  | "inicial"
  | "recepcionado"
  | "em_andamento_interno"
  | "reavaliacao"
  | "resolvido"
  | "ouvidoria";
export type TipoDesfecho = "reembolso" | "remarcacao" | "carta_credito";
export type SubtipoReembolso = "integral" | "parcial" | "sem_reembolso";
export type OrigemReembolsoIntegral = "fornecedor" | "saude";
export type SubtipoRemarcacao = "sem_custo" | "com_custo";
export type QuemPagaMulta = "cliente" | "vendedor";
export type TipoDocumentoAnexo =
  | "carta_cancelamento"
  | "atestado_saude"
  | "certidao_obito"
  | "outro";
export type AcaoAuditoria = "insert" | "update" | "delete" | "download_signed_url";

export interface Database {
  public: {
    Tables: {
      usuarios: {
        Row: {
          id: string;
          nome_completo: string;
          email: string;
          perfil: PerfilUsuario;
          filial: FilialCvc | null;
          ativo: boolean;
          criado_em: string;
        };
        // Nunca inserido pelo client — criado só via trigger on auth.users.
        Insert: Partial<{
          id: string;
          nome_completo: string;
          email: string;
          perfil: PerfilUsuario;
          filial: FilialCvc | null;
          ativo: boolean;
        }>;
        Update: Partial<{
          nome_completo: string;
          email: string;
          perfil: PerfilUsuario;
          filial: FilialCvc | null;
          ativo: boolean;
        }>;
        Relationships: [];
      };
      casos: {
        Row: {
          id: string;
          protocolo: number;
          tipo_caso: TipoCaso;
          motivo: MotivoCaso | null;
          descricao: string | null;
          filial: FilialCvc;
          vendedor_dono: string;
          vendedor_original_nome: string;
          criado_por: string;
          prazo_vigencia: string;
          status_atual: StatusCaso;
          elegivel_ouvidoria: boolean;
          criado_em: string;
          contrato_numero: string;
          cliente_nome: string;
          cliente_cpf: string;
          parcelas_em_aberto: number | null;
          data_cancelamento: string | null;
        };
        Insert: {
          tipo_caso: TipoCaso;
          motivo?: MotivoCaso | null;
          descricao?: string | null;
          vendedor_dono: string;
          criado_por: string;
          prazo_vigencia: string;
          elegivel_ouvidoria?: boolean;
          contrato_numero: string;
          cliente_nome: string;
          cliente_cpf: string;
          parcelas_em_aberto?: number | null;
          data_cancelamento?: string | null;
        };
        Update: Partial<{
          prazo_vigencia: string;
          elegivel_ouvidoria: boolean;
          vendedor_dono: string;
        }>;
        Relationships: [];
      };
      status_historico: {
        Row: {
          id: string;
          caso_id: string;
          status: StatusCaso;
          entrou_em: string;
          alterado_por: string;
          via_delegacao: boolean;
        };
        Insert: {
          caso_id: string;
          status: StatusCaso;
        };
        // Append-only: nunca faça .update() nesta tabela mesmo que o tipo
        // permita — mantido como Partial<Row> só para não quebrar a
        // inferência de tipos genéricos do supabase-js (never causa
        // problemas de inferência em cadeias de tipo mais complexas).
        Update: Partial<{
          status: StatusCaso;
        }>;
        Relationships: [];
      };
      desfechos: {
        Row: {
          id: string;
          caso_id: string;
          tipo: TipoDesfecho;
          subtipo_reembolso: SubtipoReembolso | null;
          origem_reembolso_integral: OrigemReembolsoIntegral | null;
          banco_nome_completo: string | null;
          banco_agencia: string | null;
          banco_conta: string | null;
          banco_cpf: string | null;
          valor: number | null;
          subtipo_remarcacao: SubtipoRemarcacao | null;
          valor_taxas: number | null;
          valor_diferenca_tarifaria: number | null;
          criado_por: string;
          criado_em: string;
        };
        Insert: Partial<{
          subtipo_reembolso: SubtipoReembolso | null;
          origem_reembolso_integral: OrigemReembolsoIntegral | null;
          banco_nome_completo: string | null;
          banco_agencia: string | null;
          banco_conta: string | null;
          banco_cpf: string | null;
          valor: number | null;
          subtipo_remarcacao: SubtipoRemarcacao | null;
          valor_taxas: number | null;
          valor_diferenca_tarifaria: number | null;
        }> & {
          caso_id: string;
          tipo: TipoDesfecho;
        };
        // Imutável após criação — ver nota em status_historico.Update sobre
        // por que isso é Partial<Row> em vez de never.
        Update: Partial<{
          tipo: TipoDesfecho;
        }>;
        Relationships: [];
      };
      implicacoes: {
        Row: {
          id: string;
          caso_id: string;
          multa_contratual_valor: number;
          multa_fornecedor_valor: number;
          quem_paga: QuemPagaMulta;
          reducao_markup: boolean;
          reducao_comissao: boolean;
          reducao_comissao_valor: number | null;
          utilizacao_cortesia: boolean;
          utilizacao_cortesia_valor: number | null;
          criado_por: string;
          criado_em: string;
          atualizado_em: string;
        };
        Insert: Partial<{
          multa_contratual_valor: number;
          multa_fornecedor_valor: number;
          reducao_markup: boolean;
          reducao_comissao: boolean;
          reducao_comissao_valor: number | null;
          utilizacao_cortesia: boolean;
          utilizacao_cortesia_valor: number | null;
        }> & {
          caso_id: string;
          quem_paga: QuemPagaMulta;
        };
        Update: Partial<{
          multa_contratual_valor: number;
          multa_fornecedor_valor: number;
          quem_paga: QuemPagaMulta;
          reducao_markup: boolean;
          reducao_comissao: boolean;
          reducao_comissao_valor: number | null;
          utilizacao_cortesia: boolean;
          utilizacao_cortesia_valor: number | null;
        }>;
        Relationships: [];
      };
      anexos: {
        Row: {
          id: string;
          caso_id: string;
          tipo_documento: TipoDocumentoAnexo;
          storage_path: string;
          nome_arquivo: string;
          enviado_por: string;
          enviado_em: string;
        };
        Insert: {
          caso_id: string;
          tipo_documento: TipoDocumentoAnexo;
          storage_path: string;
          nome_arquivo: string;
        };
        // Sem UPDATE previsto — ver nota em status_historico.Update.
        Update: Partial<{
          nome_arquivo: string;
        }>;
        Relationships: [];
      };
      delegacoes: {
        Row: {
          id: string;
          adm_id: string;
          gerente_id: string;
          inicio: string;
          fim: string | null;
          ativa: boolean;
          criado_em: string;
        };
        Insert: {
          adm_id: string;
          gerente_id: string;
          inicio?: string;
          fim?: string | null;
        };
        Update: Partial<{
          fim: string | null;
          ativa: boolean;
        }>;
        Relationships: [];
      };
      auditoria: {
        Row: {
          id: string;
          tabela: string;
          registro_id: string;
          acao: AcaoAuditoria;
          dados_antigos: Record<string, unknown> | null;
          dados_novos: Record<string, unknown> | null;
          realizado_por: string;
          realizado_em: string;
        };
        // Nunca inserido pelo client — só via triggers e log_anexo_signed_url.
        Insert: Partial<{
          tabela: string;
          registro_id: string;
          acao: AcaoAuditoria;
          realizado_por: string;
        }>;
        Update: Partial<{
          tabela: string;
        }>;
        Relationships: [];
      };
    };
    Views: {
      status_historico_com_duracao: {
        Row: {
          id: string;
          caso_id: string;
          status: StatusCaso;
          entrou_em: string;
          alterado_por: string;
          via_delegacao: boolean;
          duracao: string;
        };
        Relationships: [];
      };
      // Única via de leitura de desfechos: SELECT na tabela crua é revogado
      // de authenticated (ver 20260717000002_desfechos_mascara_bancaria.sql).
      // Campos banco_* vêm null quando o viewer não é dono do caso nem admin.
      desfechos_visivel: {
        Row: {
          id: string;
          caso_id: string;
          tipo: TipoDesfecho;
          subtipo_reembolso: SubtipoReembolso | null;
          origem_reembolso_integral: OrigemReembolsoIntegral | null;
          banco_nome_completo: string | null;
          banco_agencia: string | null;
          banco_conta: string | null;
          banco_cpf: string | null;
          valor: number | null;
          subtipo_remarcacao: SubtipoRemarcacao | null;
          valor_taxas: number | null;
          valor_diferenca_tarifaria: number | null;
          criado_por: string;
          criado_em: string;
        };
        Relationships: [];
      };
    };
    Functions: {
      log_anexo_signed_url: {
        Args: { p_anexo_id: string };
        Returns: void;
      };
    };
  };
}
