-- ============================================================================
-- Sistema de Gestão de Casos Operacionais — CVC
-- Migration: base manual do mês para os cliques do Linkly
--
-- Outubro/2026 aparecia como "contagem a partir de 15/10 (início do
-- registro)" porque não existe snapshot de 30/09. Esta migration permite ao
-- adm_master gravar uma BASE para o mês atual: um snapshot sintético datado
-- do último dia do mês anterior, com total = total atual do link − cliques
-- do mês (informados pela API do Linkly ou digitados a partir do relatório
-- do Linkly — ver /cliques/base). Com ele, o cálculo do mês passa a ter
-- "snapshot anterior" e deixa de ser parcial para aquele link.
--
-- 1. linkly_cliques_snapshots.origem: 'sync' (gravado pela sincronização,
--    default — todas as linhas existentes) ou 'base_manual'.
-- 2. A sincronização nunca sobrescreve uma base manual (trigger só atualiza
--    linha 'sync' em conflito).
-- 3. Snapshot 'base_manual' só serve de BASE do mês seguinte: não conta como
--    snapshot "dentro" do mês dele (senão setembro apareceria com 0 cliques
--    "a partir de 30/09") e não entra na lista de meses do seletor.
-- 4. linkly_definir_base_mes(p_link_id, p_mes, p_cliques_no_mes): só
--    adm_master; p_mes tem de ser o dia 1 do MÊS ATUAL (America/Sao_Paulo) —
--    a fórmula usa o total atual, que só é correto para o mês corrente;
--    cliques entre 0 e o total atual; não substitui snapshot real ('sync')
--    na data da base; reaplicar substitui a base manual anterior.
--
-- Regra de virada (inalterada): a base de um mês é o ÚLTIMO snapshot com
-- data anterior ao dia 1. Como o snapshot de um dia guarda o último total
-- daquele dia (sync de hora em hora, ~23h), o erro na virada é de até ~1 h
-- de cliques. Usar o primeiro snapshot do dia 1 seria pior: ele guarda o
-- total do FIM do dia 1, perdendo o dia 1 inteiro.
--
-- Idempotente.
-- ============================================================================

alter table public.linkly_cliques_snapshots
  add column if not exists origem text not null default 'sync';

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'linkly_cliques_snapshots_origem_valida') then
    alter table public.linkly_cliques_snapshots
      add constraint linkly_cliques_snapshots_origem_valida check (origem in ('sync', 'base_manual'));
  end if;
end
$$;

comment on column public.linkly_cliques_snapshots.origem is
  '''sync'' = gravado pela sincronização; ''base_manual'' = base do mês seguinte definida pelo adm_master (linkly_definir_base_mes).';

-- Sincronização não sobrescreve base manual.
create or replace function public.registrar_snapshot_linkly()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  insert into public.linkly_cliques_snapshots (link_id, data, total, origem)
  values (new.link_id, (new.atualizado_em at time zone 'America/Sao_Paulo')::date, new.total_cliques, 'sync')
  on conflict (link_id, data) do update set total = excluded.total
    where public.linkly_cliques_snapshots.origem = 'sync';
  return new;
end;
$$;

-- Base manual só como base do mês seguinte (ver item 3 do cabeçalho).
create or replace function public._linkly_links_no_mes(p_mes date)
returns table (link_id uuid, base bigint, total_fim bigint, base_parcial boolean, contagem_desde date)
language sql stable security definer set search_path = public
as $$
  with params as (
    select date_trunc('month', p_mes)::date as d0,
           (date_trunc('month', p_mes) + interval '1 month - 1 day')::date as d1
  ),
  pontos as (
    select
      l.id as link_id,
      (select s.total from public.linkly_cliques_snapshots s
        where s.link_id = l.id and s.data < p.d0 order by s.data desc limit 1) as base_anterior,
      (select s.total from public.linkly_cliques_snapshots s
        where s.link_id = l.id and s.data between p.d0 and p.d1 and s.origem = 'sync'
        order by s.data asc limit 1) as primeiro_total_mes,
      (select s.data from public.linkly_cliques_snapshots s
        where s.link_id = l.id and s.data between p.d0 and p.d1 and s.origem = 'sync'
        order by s.data asc limit 1) as primeira_data_mes,
      (select s.total from public.linkly_cliques_snapshots s
        where s.link_id = l.id and s.data <= p.d1 order by s.data desc limit 1) as total_fim
    from public.linkly_links l
    cross join params p
  )
  select
    link_id,
    coalesce(base_anterior, primeiro_total_mes) as base,
    total_fim,
    base_anterior is null as base_parcial,
    case when base_anterior is null then primeira_data_mes end as contagem_desde
  from pontos
  where base_anterior is not null or primeiro_total_mes is not null;
$$;

revoke all on function public._linkly_links_no_mes(date) from public, anon, authenticated;

create or replace function public.linkly_meses_com_registro()
returns table (mes date)
language sql stable security definer set search_path = public
as $$
  select distinct date_trunc('month', s.data)::date
  from public.linkly_cliques_snapshots s
  where public.auth_ativo() and s.origem = 'sync'
  order by 1 desc;
$$;

revoke all on function public.linkly_meses_com_registro() from public, anon;
grant execute on function public.linkly_meses_com_registro() to authenticated, service_role;

-- ----------------------------------------------------------------------------
-- linkly_definir_base_mes
-- ----------------------------------------------------------------------------

create or replace function public.linkly_definir_base_mes(p_link_id uuid, p_mes date, p_cliques_no_mes bigint)
returns bigint
language plpgsql security definer set search_path = public
as $$
declare
  v_mes_atual date := date_trunc('month', now() at time zone 'America/Sao_Paulo')::date;
  v_data_base date;
  v_total_atual bigint;
  v_base bigint;
begin
  if not public.auth_is_adm_master() then
    raise exception 'Apenas Adm Master pode definir a base do mês.';
  end if;

  if p_mes is null or p_mes <> date_trunc('month', p_mes)::date then
    raise exception 'O mês deve ser informado pelo dia 1 (ex.: 2026-10-01).';
  end if;

  if p_mes <> v_mes_atual then
    raise exception 'A base só pode ser definida para o mês atual (%), porque é calculada a partir do total atual do link.',
      to_char(v_mes_atual, 'MM/YYYY');
  end if;

  if p_cliques_no_mes is null or p_cliques_no_mes < 0 then
    raise exception 'Cliques no mês não pode ser negativo.';
  end if;

  if not exists (select 1 from public.linkly_links where id = p_link_id) then
    raise exception 'Link não encontrado.';
  end if;

  select total_cliques into v_total_atual from public.linkly_cliques_totais where link_id = p_link_id;
  if v_total_atual is null then
    raise exception 'Este link ainda não tem total sincronizado — rode a sincronização antes.';
  end if;

  if p_cliques_no_mes > v_total_atual then
    raise exception 'Cliques no mês (%) maior que o total atual do link (%).', p_cliques_no_mes, v_total_atual;
  end if;

  v_data_base := p_mes - 1;

  if exists (
    select 1 from public.linkly_cliques_snapshots
    where link_id = p_link_id and data = v_data_base and origem = 'sync'
  ) then
    raise exception 'Já existe um snapshot real de % para este link — a base do mês já é medida, não precisa ser definida.',
      to_char(v_data_base, 'DD/MM/YYYY');
  end if;

  v_base := v_total_atual - p_cliques_no_mes;

  insert into public.linkly_cliques_snapshots (link_id, data, total, origem)
  values (p_link_id, v_data_base, v_base, 'base_manual')
  on conflict (link_id, data) do update set total = excluded.total, criado_em = now()
    where public.linkly_cliques_snapshots.origem = 'base_manual';

  return v_base;
end;
$$;

comment on function public.linkly_definir_base_mes(uuid, date, bigint) is
  'Adm Master: grava a base do mês atual de um link (snapshot base_manual no último dia do mês anterior = total atual − cliques do mês). Reaplicar substitui.';

revoke all on function public.linkly_definir_base_mes(uuid, date, bigint) from public, anon;
grant execute on function public.linkly_definir_base_mes(uuid, date, bigint) to authenticated, service_role;
