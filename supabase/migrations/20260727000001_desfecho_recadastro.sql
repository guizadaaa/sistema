-- ============================================================================
-- Sistema de Gestão de Casos Operacionais — CVC
-- Migration: novo tipo de desfecho "Recadastro"
--
-- Recadastro não carrega nenhum dado adicional (sem valor, sem dados
-- bancários, sem subtipo) — só marca que o caso foi resolvido recadastrando
-- o produto/reserva. Mesmo padrão de carta_credito/remarcacao: um valor de
-- enum novo em tipo_desfecho + um branch na constraint
-- desfechos_campos_por_tipo exigindo todas as colunas específicas de outros
-- tipos como null.
-- ============================================================================

alter type tipo_desfecho add value 'recadastro';

alter table public.desfechos drop constraint desfechos_campos_por_tipo;

alter table public.desfechos add constraint desfechos_campos_por_tipo check (
    case tipo
      when 'reembolso' then
        subtipo_reembolso is not null
        and subtipo_remarcacao is null and valor_taxas is null and valor_diferenca_tarifaria is null
        and origem_remarcacao_com_custo is null
        and (
          (subtipo_reembolso in ('integral', 'parcial')
            and banco_nome_completo is not null and banco_agencia is not null
            and banco_conta is not null and banco_cpf is not null and valor is not null)
          or (subtipo_reembolso = 'sem_reembolso')
        )
        and (
          (subtipo_reembolso = 'integral' and origem_reembolso_integral is not null)
          or (subtipo_reembolso <> 'integral' and origem_reembolso_integral is null)
        )
      when 'remarcacao' then
        subtipo_remarcacao is not null
        and subtipo_reembolso is null and origem_reembolso_integral is null
        and banco_nome_completo is null and banco_agencia is null and banco_conta is null
        and banco_cpf is null and valor is null
        and (
          (subtipo_remarcacao = 'com_custo' and valor_taxas is not null and valor_diferenca_tarifaria is not null
            and origem_remarcacao_com_custo is not null)
          or (subtipo_remarcacao = 'sem_custo' and valor_taxas is null and valor_diferenca_tarifaria is null
            and origem_remarcacao_com_custo is null)
        )
      when 'carta_credito' then
        valor is not null
        and subtipo_reembolso is null and origem_reembolso_integral is null
        and subtipo_remarcacao is null and valor_taxas is null and valor_diferenca_tarifaria is null
        and banco_nome_completo is null and banco_agencia is null and banco_conta is null and banco_cpf is null
        and origem_remarcacao_com_custo is null
      when 'recadastro' then
        subtipo_reembolso is null and origem_reembolso_integral is null
        and subtipo_remarcacao is null and origem_remarcacao_com_custo is null
        and banco_nome_completo is null and banco_agencia is null and banco_conta is null and banco_cpf is null
        and valor is null and valor_taxas is null and valor_diferenca_tarifaria is null
    end
);

comment on constraint desfechos_campos_por_tipo on public.desfechos is
  'Assume que reembolso subtipo sem_reembolso não exige dados bancários (não há reembolso a pagar) — confirmar com o cliente se a intenção do documento era outra. Recadastro não exige nenhum campo adicional.';
