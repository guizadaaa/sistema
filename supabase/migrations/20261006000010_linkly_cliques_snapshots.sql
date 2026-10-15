-- ============================================================================
-- Sistema de Gestão de Casos Operacionais — CVC
-- Migration: histórico diário de cliques do Linkly (cliques por mês)
--
-- linkly_cliques_totais só guarda o total ATUAL de cada link, então não dá
-- para saber quantos cliques houve "desde o dia 1". Esta migration:
--
-- 1. linkly_cliques_snapshots (link_id, data, total): uma foto por link por
--    dia (data no fuso America/Sao_Paulo). Gravada por TRIGGER em
--    linkly_cliques_totais — qualquer sincronização (cron ou botão
--    "Atualizar agora") que atualizar o total já grava/atualiza o snapshot
--    do dia, sem depender de a Edge Function lembrar disso.
--    RLS igual à de linkly_cliques_totais: nenhuma leitura direta por
--    authenticated (sem grant, sem policy); a leitura é pelas funções abaixo.
--
-- 2. Cálculo do mês M (linkly_cliques_mes):
--    - base do link = total do último snapshot com data <= último dia de
--      M-1; fim do link = total do snapshot mais recente com data <= último
--      dia de M.
--    - mês sem snapshot anterior (ex.: outubro/2026, primeiro mês do
--      registro): a base é o PRIMEIRO snapshot dentro de M, e a linha volta
--      com base_parcial = true e contagem_desde = data desse snapshot — a
--      tela mostra "contagem a partir de DD/MM", nunca finge que é desde o
--      dia 1. (A API do Linkly parece aceitar filtro por data, mas o formato
--      da resposta não foi confirmado contra uma conta real e a contagem
--      por período pode não bater com clicks_total — sem backfill por ora.)
--    - por vendedor: atribuição no meio do mês usa como base o maior entre a
--      base do mês e cliques_totais_no_inicio; vínculo encerrado no meio do
--      mês termina no cliques_totais_no_inicio do vínculo seguinte (mesmo
--      encadeamento de linkly_cliques_por_periodo). Cada vendedor recebe só
--      o seu trecho.
--    - nunca negativo: se o Linkly reduzir um total, o trecho vale 0.
--    Visibilidade igual à de linkly_cliques_por_periodo (admin tudo;
--    gerente a própria filial; vendedor só as próprias linhas), aplicada
--    DEPOIS do encadeamento (lead), pelo mesmo motivo daquela view.
--
-- 3. Seed: um snapshot com o total atual de cada link (data da última
--    sincronização), para o registro já começar com o que existe hoje.
--
-- Idempotente.
-- ============================================================================

create table if not exists public.linkly_cliques_snapshots (
  link_id uuid not null references public.linkly_links (id),
  data date not null,
  total bigint not null,
  criado_em timestamptz not null default now(),

  constraint linkly_cliques_snapshots_unico unique (link_id, data)
);

comment on table public.linkly_cliques_snapshots is
  'Total de cliques de cada link do Linkly por dia (data em America/Sao_Paulo) — gravado por trigger a cada sincronização. Base do cálculo de cliques por mês.';

alter table public.linkly_cliques_snapshots enable row level security;
-- Sem nenhuma policy e sem grant para authenticated/anon — igual a
-- linkly_cliques_totais. Leitura só pelas funções security definer abaixo.
revoke all on public.linkly_cliques_snapshots from anon, authenticated;
grant select, insert, update, delete on public.linkly_cliques_snapshots to service_role;

-- ----------------------------------------------------------------------------
-- Trigger: cada gravação do total grava o snapshot do dia.
-- ----------------------------------------------------------------------------

create or replace function public.registrar_snapshot_linkly()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  insert into public.linkly_cliques_snapshots (link_id, data, total)
  values (new.link_id, (new.atualizado_em at time zone 'America/Sao_Paulo')::date, new.total_cliques)
  on conflict (link_id, data) do update set total = excluded.total;
  return new;
end;
$$;

drop trigger if exists linkly_cliques_totais_snapshot on public.linkly_cliques_totais;
create trigger linkly_cliques_totais_snapshot
  after insert or update of total_cliques, atualizado_em on public.linkly_cliques_totais
  for each row execute function public.registrar_snapshot_linkly();

-- Seed com o total atual (não sobrescreve snapshot já existente).
insert into public.linkly_cliques_snapshots (link_id, data, total)
select ct.link_id, (ct.atualizado_em at time zone 'America/Sao_Paulo')::date, ct.total_cliques
from public.linkly_cliques_totais ct
on conflict (link_id, data) do nothing;

-- ----------------------------------------------------------------------------
-- Base e fim de cada link num mês (uso interno das funções abaixo).
-- ----------------------------------------------------------------------------

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
        where s.link_id = l.id and s.data between p.d0 and p.d1 order by s.data asc limit 1) as primeiro_total_mes,
      (select s.data from public.linkly_cliques_snapshots s
        where s.link_id = l.id and s.data between p.d0 and p.d1 order by s.data asc limit 1) as primeira_data_mes,
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

-- ----------------------------------------------------------------------------
-- Cliques por vendedor (por vínculo link x vendedor) no mês.
-- ----------------------------------------------------------------------------

create or replace function public.linkly_cliques_mes(p_mes date)
returns table (
  mapeamento_id uuid,
  link_id uuid,
  filial filial_cvc,
  short_url text,
  usuario_id uuid,
  inicio date,
  fim date,
  cliques bigint,
  base_parcial boolean,
  contagem_desde date
)
language sql stable security definer set search_path = public
as $$
  with params as (
    select date_trunc('month', p_mes)::date as d0,
           (date_trunc('month', p_mes) + interval '1 month - 1 day')::date as d1
  ),
  periodos as (
    -- lead() sobre TODOS os vínculos do link, antes de qualquer filtro de
    -- visibilidade (ver cabeçalho).
    select m.*,
      lead(m.cliques_totais_no_inicio) over (partition by m.link_id order by m.vigente_desde) as total_inicio_proximo
    from public.linkly_vendedor_mapeamento m
  ),
  calculo as (
    select
      pe.id as mapeamento_id,
      pe.link_id,
      l.filial,
      l.short_url,
      pe.usuario_id,
      greatest(pe.vigente_desde, p.d0) as inicio,
      least(coalesce(pe.vigente_ate, p.d1), p.d1) as fim,
      case when pe.vigente_desde > p.d0 then greatest(lm.base, pe.cliques_totais_no_inicio) else lm.base end as base_periodo,
      case
        when pe.vigente_ate is not null and pe.vigente_ate < p.d1 then coalesce(pe.total_inicio_proximo, lm.total_fim)
        else lm.total_fim
      end as fim_periodo,
      -- Parcial só se o vínculo já existia antes do início do registro.
      lm.base_parcial and pe.vigente_desde <= lm.contagem_desde as base_parcial,
      case when lm.base_parcial and pe.vigente_desde <= lm.contagem_desde then lm.contagem_desde end as contagem_desde
    from periodos pe
    cross join params p
    join public.linkly_links l on l.id = pe.link_id
    join public._linkly_links_no_mes(p_mes) lm on lm.link_id = pe.link_id
    where pe.vigente_desde <= p.d1
      and (pe.vigente_ate is null or pe.vigente_ate >= p.d0)
  )
  select
    mapeamento_id, link_id, filial, short_url, usuario_id, inicio, fim,
    greatest(0, fim_periodo - base_periodo)::bigint as cliques,
    base_parcial, contagem_desde
  from calculo c
  where
    public.auth_is_admin()
    or (public.auth_ativo() and public.auth_perfil() = 'gerente' and c.filial = public.auth_filial())
    or (public.auth_ativo() and c.usuario_id = auth.uid());
$$;

comment on function public.linkly_cliques_mes(date) is
  'Cliques de cada vínculo link x vendedor no mês de p_mes (snapshots diários; nunca negativo). base_parcial/contagem_desde indicam mês sem snapshot anterior. Visibilidade igual a linkly_cliques_por_periodo.';

revoke all on function public.linkly_cliques_mes(date) from public, anon;
grant execute on function public.linkly_cliques_mes(date) to authenticated, service_role;

-- ----------------------------------------------------------------------------
-- Cliques dos links de vitrine no mês (admin: todos; gerente: própria loja).
-- ----------------------------------------------------------------------------

create or replace function public.linkly_cliques_vitrine_mes(p_mes date)
returns table (link_id uuid, filial filial_cvc, short_url text, cliques bigint, base_parcial boolean, contagem_desde date)
language sql stable security definer set search_path = public
as $$
  select l.id, l.filial, l.short_url, greatest(0, lm.total_fim - lm.base)::bigint, lm.base_parcial, lm.contagem_desde
  from public.linkly_links l
  join public._linkly_links_no_mes(p_mes) lm on lm.link_id = l.id
  where l.tipo = 'vitrine'
    and (
      public.auth_is_admin()
      or (public.auth_ativo() and public.auth_perfil() = 'gerente' and l.filial = public.auth_filial())
    );
$$;

revoke all on function public.linkly_cliques_vitrine_mes(date) from public, anon;
grant execute on function public.linkly_cliques_vitrine_mes(date) to authenticated, service_role;

-- ----------------------------------------------------------------------------
-- Meses com registro (seletor de mês) e hora da última sincronização — sem
-- dado de link/vendedor, só datas; qualquer perfil ativo.
-- ----------------------------------------------------------------------------

create or replace function public.linkly_meses_com_registro()
returns table (mes date)
language sql stable security definer set search_path = public
as $$
  select distinct date_trunc('month', s.data)::date
  from public.linkly_cliques_snapshots s
  where public.auth_ativo()
  order by 1 desc;
$$;

revoke all on function public.linkly_meses_com_registro() from public, anon;
grant execute on function public.linkly_meses_com_registro() to authenticated, service_role;

create or replace function public.linkly_ultima_sincronizacao()
returns timestamptz
language sql stable security definer set search_path = public
as $$
  select max(ct.atualizado_em) from public.linkly_cliques_totais ct where public.auth_ativo();
$$;

revoke all on function public.linkly_ultima_sincronizacao() from public, anon;
grant execute on function public.linkly_ultima_sincronizacao() to authenticated, service_role;
