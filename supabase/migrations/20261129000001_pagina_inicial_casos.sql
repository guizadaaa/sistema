-- ============================================================================
-- Página inicial: tabela status × filial/vendedor, parados há mais tempo e
-- números clicáveis.
--
-- 1. casos_contagem_status (barra de Acompanhar Casos): p_prazo passa a
--    aceitar também 'vence5' (não resolvidos que vencem de hoje a hoje+5) e
--    'aberto' (só não resolvidos) — os filtros novos da lista
--    (prazo=vence5, aberto=1). Mesma assinatura.
-- 2. dashboard_casos_contagem(p_hoje): uma consulta agregada por (filial,
--    dono, status) com vencidos / vencem em até 5 dias SÓ de não
--    resolvidos (o "Prazo vencido" antigo contava resolvidos). Totais por
--    filial e geral saem da mesma consulta.
-- 3. casos_tempo_etapa(p_ids, p_limite): desde quando o caso está na etapa
--    atual (última entrada em status_historico). Sem p_ids: os não
--    resolvidos mais parados (p_limite primeiros). Com p_ids: esses casos,
--    para ordenar a lista por "mais tempo na etapa" (ordem=parado).
--
-- Visibilidade: as três são SECURITY DEFINER com a MESMA regra de
-- auth_pode_ver_caso escrita inline (dados do usuário calculados uma vez —
-- a policy linha a linha custa segundos com dezenas de milhares de casos).
-- Casos de teste ficam de fora (as métricas reais nunca os somam).
--
-- Idempotente.
-- ============================================================================

create or replace function public.casos_contagem_status(
  p_tipo tipo_caso default null,
  p_filial filial_cvc default null,
  p_vendedor uuid default null,
  p_data_inicio date default null,
  p_data_fim date default null,
  p_teste boolean default false,
  p_ids uuid[] default null,
  -- 'vencido' | 'vence5' (0..5 dias) | 'aberto': só não resolvidos (filtros da lista).
  p_prazo text default null,
  p_hoje date default null
)
returns table (status status_caso, total bigint, vencidos bigint, vencem_5 bigint)
language sql
stable
security definer
set search_path = public
as $$
  with hoje as (
    select coalesce(p_hoje, (now() at time zone 'America/Sao_Paulo')::date) as d
  ),
  eu as materialized (
    select auth.uid() as uid, public.auth_is_admin() as admin, public.auth_is_adm_master() as adm_master,
      public.auth_ativo() as ativo, public.auth_perfil() as perfil, public.auth_filial() as filial
  ),
  filtrados as (
    select c.status_atual, c.prazo_vigencia
    from public.casos c, hoje h, eu
    -- = auth_pode_ver_caso(c.id)
    where (not c.caso_teste or eu.adm_master)
      and (
        eu.admin
        or (eu.ativo and (c.vendedor_dono = eu.uid or (eu.perfil = 'gerente' and c.filial = eu.filial)))
      )
      and c.caso_teste = coalesce(p_teste, false)
      and (p_tipo is null or c.tipo_caso = p_tipo)
      and (p_filial is null or c.filial = p_filial)
      and (p_vendedor is null or c.vendedor_dono = p_vendedor)
      -- Mesmo recorte da lista: 'aaaa-mm-ddT00:00:00' / 'T23:59:59.999' no fuso da sessão.
      and (p_data_inicio is null or c.criado_em >= (p_data_inicio::text || 'T00:00:00')::timestamptz)
      and (p_data_fim is null or c.criado_em <= (p_data_fim::text || 'T23:59:59.999')::timestamptz)
      and (p_ids is null or c.id = any (p_ids))
      and (p_prazo is null
        or (p_prazo = 'vencido' and c.status_atual <> 'resolvido' and c.prazo_vigencia < h.d)
        or (p_prazo = 'vence5' and c.status_atual <> 'resolvido' and c.prazo_vigencia between h.d and h.d + 5)
        or (p_prazo = 'aberto' and c.status_atual <> 'resolvido'))
  ),
  por_status as (
    select f.status_atual,
      count(*) as total,
      count(*) filter (where f.status_atual <> 'resolvido' and f.prazo_vigencia < h.d) as vencidos,
      count(*) filter (where f.status_atual <> 'resolvido' and f.prazo_vigencia between h.d and h.d + 5) as vencem_5
    from filtrados f, hoje h
    group by f.status_atual
  )
  select s, coalesce(p.total, 0), coalesce(p.vencidos, 0), coalesce(p.vencem_5, 0)
  from unnest(enum_range(null::status_caso)) s
  left join por_status p on p.status_atual = s;
$$;

revoke all on function public.casos_contagem_status(tipo_caso, filial_cvc, uuid, date, date, boolean, uuid[], text, date) from public, anon;
grant execute on function public.casos_contagem_status(tipo_caso, filial_cvc, uuid, date, date, boolean, uuid[], text, date) to authenticated, service_role;

-- ----------------------------------------------------------------------------
-- Contagem da página inicial
-- ----------------------------------------------------------------------------

drop function if exists public.dashboard_casos_contagem(date);

create function public.dashboard_casos_contagem(p_hoje date default null)
returns table (filial filial_cvc, vendedor_dono uuid, status status_caso, total bigint, vencidos bigint, vencem_5 bigint)
language sql
stable
security definer
set search_path = public
as $$
  with hoje as (
    select coalesce(p_hoje, (now() at time zone 'America/Sao_Paulo')::date) as d
  ),
  eu as materialized (
    select auth.uid() as uid, public.auth_is_admin() as admin, public.auth_ativo() as ativo,
      public.auth_perfil() as perfil, public.auth_filial() as filial
  )
  select c.filial, c.vendedor_dono, c.status_atual,
    count(*),
    count(*) filter (where c.status_atual <> 'resolvido' and c.prazo_vigencia < h.d),
    count(*) filter (where c.status_atual <> 'resolvido' and c.prazo_vigencia between h.d and h.d + 5)
  from public.casos c, hoje h, eu
  -- = auth_pode_ver_caso(c.id), só casos reais
  where not c.caso_teste
    and (
      eu.admin
      or (eu.ativo and (c.vendedor_dono = eu.uid or (eu.perfil = 'gerente' and c.filial = eu.filial)))
    )
  group by c.filial, c.vendedor_dono, c.status_atual;
$$;

revoke all on function public.dashboard_casos_contagem(date) from public, anon;
grant execute on function public.dashboard_casos_contagem(date) to authenticated, service_role;

-- ----------------------------------------------------------------------------
-- Tempo na etapa atual
-- ----------------------------------------------------------------------------

drop function if exists public.casos_tempo_etapa(uuid[], integer);

create function public.casos_tempo_etapa(p_ids uuid[] default null, p_limite integer default null)
returns table (id uuid, protocolo bigint, cliente_nome text, status_atual status_caso, filial filial_cvc, entrou_em timestamptz)
language sql
stable
security definer
set search_path = public
as $$
  with eu as materialized (
    select auth.uid() as uid, public.auth_is_admin() as admin, public.auth_is_adm_master() as adm_master,
      public.auth_ativo() as ativo, public.auth_perfil() as perfil, public.auth_filial() as filial
  )
  select c.id, c.protocolo, c.cliente_nome, c.status_atual, c.filial,
    coalesce((select max(sh.entrou_em) from public.status_historico sh where sh.caso_id = c.id), c.criado_em)
  from public.casos c, eu
  -- = auth_pode_ver_caso(c.id)
  where (not c.caso_teste or eu.adm_master)
    and (
      eu.admin
      or (eu.ativo and (c.vendedor_dono = eu.uid or (eu.perfil = 'gerente' and c.filial = eu.filial)))
    )
    and (
      (p_ids is not null and c.id = any (p_ids))
      or (p_ids is null and not c.caso_teste and c.status_atual <> 'resolvido')
    )
  order by 6, c.protocolo
  limit p_limite;
$$;

revoke all on function public.casos_tempo_etapa(uuid[], integer) from public, anon;
grant execute on function public.casos_tempo_etapa(uuid[], integer) to authenticated, service_role;
