-- ============================================================================
-- Sistema de Gestão de Casos Operacionais — CVC
-- Migration: correção e cancelamento de desfechos, preservando o histórico
--
-- Decisão confirmada com o cliente: desfechos continuam imutáveis (mesmo
-- racional de casos nunca serem apagados fisicamente — dados bancários e
-- financeiros exigem rastro de auditoria). Em vez de UPDATE/DELETE livres,
-- uma correção cria um desfecho NOVO e marca o antigo como substituído; um
-- cancelamento apenas marca o desfecho como anulado, sem apagar nada. Ambas
-- as transições passam por função SECURITY DEFINER (não por policy de
-- UPDATE direta): evita reabrir SELECT na tabela crua para o client (revogado
-- em 20260717000002_desfechos_mascara_bancaria.sql) só para viabilizar o
-- .eq("id", ...) de um update comum, e mantém a checagem de elegibilidade e
-- a regra "só transiciona uma vez" num único lugar.
-- ============================================================================

alter table public.desfechos
  add column substituido_por uuid references public.desfechos (id),
  add column substituido_em timestamptz,
  add column cancelado_em timestamptz,
  add constraint desfechos_substituido_coerente
    check ((substituido_por is null) = (substituido_em is null)),
  add constraint desfechos_estado_final_unico
    check (not (substituido_por is not null and cancelado_em is not null));

-- Um desfecho novo só pode ser a correção de UM antigo (sem fan-in).
create unique index desfechos_substituido_por_unique
  on public.desfechos (substituido_por)
  where substituido_por is not null;

comment on column public.desfechos.substituido_por is
  'Aponta para o desfecho novo que corrigiu este (correção com histórico) — null enquanto o registro está ativo.';
comment on column public.desfechos.cancelado_em is
  'Desfecho anulado (registrado por engano), sem substituto — mutuamente exclusivo com substituido_por.';

-- ----------------------------------------------------------------------------
-- Trava de conteúdo: mesmo com as duas funções abaixo sendo os únicos
-- caminhos de escrita esperados, este trigger garante em nível de tabela que
-- nenhum UPDATE (futuro, por engano ou não) altera o conteúdo do desfecho —
-- só as três colunas de transição de estado.
-- ----------------------------------------------------------------------------

create function public.bloqueia_edicao_desfecho()
returns trigger
language plpgsql
as $$
begin
  if (
    old.caso_id, old.tipo, old.subtipo_reembolso, old.origem_reembolso_integral,
    old.banco_codigo, old.banco_nome_completo, old.banco_agencia, old.banco_conta, old.banco_cpf, old.valor,
    old.subtipo_remarcacao, old.origem_remarcacao_com_custo, old.valor_taxas, old.valor_diferenca_tarifaria,
    old.criado_por, old.criado_em
  ) is distinct from (
    new.caso_id, new.tipo, new.subtipo_reembolso, new.origem_reembolso_integral,
    new.banco_codigo, new.banco_nome_completo, new.banco_agencia, new.banco_conta, new.banco_cpf, new.valor,
    new.subtipo_remarcacao, new.origem_remarcacao_com_custo, new.valor_taxas, new.valor_diferenca_tarifaria,
    new.criado_por, new.criado_em
  ) then
    raise exception 'Desfecho é imutável — só substituido_por/substituido_em/cancelado_em podem mudar.';
  end if;
  return new;
end;
$$;

create trigger desfechos_bloqueia_edicao_conteudo
  before update on public.desfechos
  for each row execute function public.bloqueia_edicao_desfecho();

-- ----------------------------------------------------------------------------
-- registrar_correcao_desfecho: cria o desfecho novo e marca o antigo como
-- substituído, atomicamente. Reimplementa a mesma elegibilidade de
-- desfechos_insert (admin, ou gerente com delegação ativa na filial do
-- caso) — SECURITY DEFINER roda como dono da função (bypassa RLS), então a
-- checagem de permissão precisa ser feita aqui dentro, não pela policy.
-- ----------------------------------------------------------------------------

create function public.registrar_correcao_desfecho(
  p_desfecho_anterior_id uuid,
  p_tipo tipo_desfecho,
  p_subtipo_reembolso subtipo_reembolso,
  p_origem_reembolso_integral origem_reembolso_integral,
  p_banco_codigo text,
  p_banco_nome_completo text,
  p_banco_agencia text,
  p_banco_conta text,
  p_banco_cpf text,
  p_valor numeric,
  p_subtipo_remarcacao subtipo_remarcacao,
  p_origem_remarcacao_com_custo origem_remarcacao_com_custo,
  p_valor_taxas numeric,
  p_valor_diferenca_tarifaria numeric
)
returns uuid
language plpgsql security definer set search_path = public
as $$
declare
  v_caso_id uuid;
  v_novo_id uuid;
begin
  select caso_id into v_caso_id
  from public.desfechos
  where id = p_desfecho_anterior_id
    and substituido_por is null
    and cancelado_em is null;

  if v_caso_id is null then
    raise exception 'Desfecho não encontrado, ou já corrigido/cancelado anteriormente.';
  end if;

  if not exists (
    select 1 from public.casos c
    where c.id = v_caso_id
      and (
        public.auth_is_admin()
        or (c.filial = public.auth_filial() and public.auth_has_delegacao_ativa())
      )
  ) then
    raise exception 'Sem permissão para corrigir este desfecho.';
  end if;

  insert into public.desfechos (
    caso_id, tipo, subtipo_reembolso, origem_reembolso_integral,
    banco_codigo, banco_nome_completo, banco_agencia, banco_conta, banco_cpf, valor,
    subtipo_remarcacao, origem_remarcacao_com_custo, valor_taxas, valor_diferenca_tarifaria
  ) values (
    v_caso_id, p_tipo, p_subtipo_reembolso, p_origem_reembolso_integral,
    p_banco_codigo, p_banco_nome_completo, p_banco_agencia, p_banco_conta, p_banco_cpf, p_valor,
    p_subtipo_remarcacao, p_origem_remarcacao_com_custo, p_valor_taxas, p_valor_diferenca_tarifaria
  )
  returning id into v_novo_id;

  update public.desfechos
  set substituido_por = v_novo_id, substituido_em = now()
  where id = p_desfecho_anterior_id;

  return v_novo_id;
end;
$$;

grant execute on function public.registrar_correcao_desfecho(
  uuid, tipo_desfecho, subtipo_reembolso, origem_reembolso_integral,
  text, text, text, text, text, numeric,
  subtipo_remarcacao, origem_remarcacao_com_custo, numeric, numeric
) to authenticated;

-- ----------------------------------------------------------------------------
-- cancelar_desfecho: anula um desfecho registrado por engano, sem
-- substituto. Mesma elegibilidade e mesma regra de "só transiciona uma vez".
-- ----------------------------------------------------------------------------

create function public.cancelar_desfecho(p_desfecho_id uuid)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  v_caso_id uuid;
begin
  select caso_id into v_caso_id
  from public.desfechos
  where id = p_desfecho_id
    and substituido_por is null
    and cancelado_em is null;

  if v_caso_id is null then
    raise exception 'Desfecho não encontrado, ou já corrigido/cancelado anteriormente.';
  end if;

  if not exists (
    select 1 from public.casos c
    where c.id = v_caso_id
      and (
        public.auth_is_admin()
        or (c.filial = public.auth_filial() and public.auth_has_delegacao_ativa())
      )
  ) then
    raise exception 'Sem permissão para cancelar este desfecho.';
  end if;

  update public.desfechos
  set cancelado_em = now()
  where id = p_desfecho_id;
end;
$$;

grant execute on function public.cancelar_desfecho(uuid) to authenticated;

-- ----------------------------------------------------------------------------
-- Auditoria: correção e cancelamento agora passam por UPDATE, então o
-- trigger precisa auditar update também (mesmo padrão de implicacoes em
-- 20260717000001_auditoria.sql). auth.uid() dentro da função SECURITY
-- DEFINER acima continua resolvendo para quem de fato chamou a RPC, não
-- para o dono da função — realizado_por fica correto.
-- ----------------------------------------------------------------------------

drop trigger desfechos_log_auditoria on public.desfechos;

create trigger desfechos_log_auditoria
  after insert or update on public.desfechos
  for each row execute function public.log_auditoria();

-- ----------------------------------------------------------------------------
-- desfechos_visivel: expõe as 3 colunas novas (sem dado sensível, sem
-- mascaramento) — CREATE OR REPLACE só aceita coluna nova no fim da lista.
-- ----------------------------------------------------------------------------

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
  d.origem_remarcacao_com_custo,
  d.substituido_por,
  d.substituido_em,
  d.cancelado_em
from public.desfechos d
join public.casos c on c.id = d.caso_id
where
  public.auth_is_admin()
  or (public.auth_ativo() and (c.vendedor_dono = auth.uid() or c.filial = public.auth_filial()));
