-- ============================================================================
-- Sistema de Gestão de Casos Operacionais — CVC
-- Migration: motivo da remarcação com custo (saúde vs. outro)
--
-- Decisão confirmada com o cliente: ao generalizar o subtipo "com_custo" de
-- remarcação (rótulo passa de "Com custo (saúde)" para "Com custo
-- (voluntário)"), a exigência automática de anexo (atestado de saúde) deixa
-- de depender do subtipo em si e passa a depender de um novo campo —
-- origem_remarcacao_com_custo — exigido só quando subtipo_remarcacao =
-- 'com_custo'. Mesmo papel de origem_reembolso_integral (fornecedor/saúde)
-- já existente para reembolso integral; aqui só 'saude' aciona a exigência
-- de atestado_saude (ver anexoObrigatorioFaltando em validation/desfecho.ts).
-- ============================================================================

create type origem_remarcacao_com_custo as enum ('saude', 'outro');

alter table public.desfechos
  add column origem_remarcacao_com_custo origem_remarcacao_com_custo;

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
    end
);

comment on constraint desfechos_campos_por_tipo on public.desfechos is
  'Assume que reembolso subtipo sem_reembolso não exige dados bancários (não há reembolso a pagar) — confirmar com o cliente se a intenção do documento era outra.';

-- desfechos_visivel (20260721000003) precisa expor a coluna nova — não é
-- dado sensível como banco_*, então sem mascaramento; CREATE OR REPLACE VIEW
-- só aceita coluna nova no fim da lista, daí entrar depois de criado_em.
create or replace view public.desfechos_visivel as
select
  d.id,
  d.caso_id,
  d.tipo,
  d.subtipo_reembolso,
  d.origem_reembolso_integral,
  case when public.auth_is_admin() or c.vendedor_dono = auth.uid()
    then d.banco_codigo else null end as banco_codigo,
  case when public.auth_is_admin() or c.vendedor_dono = auth.uid()
    then d.banco_nome_completo else null end as banco_nome_completo,
  case when public.auth_is_admin() or c.vendedor_dono = auth.uid()
    then d.banco_agencia else null end as banco_agencia,
  case when public.auth_is_admin() or c.vendedor_dono = auth.uid()
    then d.banco_conta else null end as banco_conta,
  case when public.auth_is_admin() or c.vendedor_dono = auth.uid()
    then d.banco_cpf else null end as banco_cpf,
  d.valor,
  d.subtipo_remarcacao,
  d.valor_taxas,
  d.valor_diferenca_tarifaria,
  d.criado_por,
  d.criado_em,
  d.origem_remarcacao_com_custo
from public.desfechos d
join public.casos c on c.id = d.caso_id
where
  public.auth_is_admin()
  or (public.auth_ativo() and (c.vendedor_dono = auth.uid() or c.filial = public.auth_filial()));
