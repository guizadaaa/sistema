-- ============================================================================
-- Acompanhar Casos: barra "Casos por status".
--
-- casos_contagem_status(...)  count por status (os 6, inclusive os zerados)
--   com os mesmos filtros da lista (src/lib/casos/listar.ts) MENOS o
--   Status, mais os prazos dos não resolvidos:
--     vencidos  prazo_vigencia < hoje
--     vencem_5  hoje <= prazo_vigencia <= hoje + 5
--   (mesma regra da coluna "Prazo de vigência": diasAteVencimento < 0 e
--   0..5). "Hoje" vem de quem chama (a mesma data que a coluna usa); sem
--   ele, a data de São Paulo.
--
-- Visibilidade: a MESMA regra de auth_pode_ver_caso (policy casos_select),
-- escrita inline com os dados do usuário calculados uma vez — SECURITY
-- DEFINER para não pagar a policy linha a linha (com 20 mil casos, a
-- policy custa ~2,5 s para vendedor; inline, poucos ms). O teste 44
-- compara com a lista sob RLS para vendedor, gerentes e adm_master. A busca
-- universal chega como p_ids (ids já resolvidos pela mesma rotina da lista,
-- sob RLS); null = sem busca.
--
-- Idempotente.
-- ============================================================================

drop function if exists public.casos_contagem_status(tipo_caso, filial_cvc, uuid, date, date, boolean, uuid[], text, date);

create function public.casos_contagem_status(
  p_tipo tipo_caso default null,
  p_filial filial_cvc default null,
  p_vendedor uuid default null,
  p_data_inicio date default null,
  p_data_fim date default null,
  p_teste boolean default false,
  p_ids uuid[] default null,
  -- 'vencido': só não resolvidos com prazo já passado (filtro "vencidos" da lista).
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
      and (p_prazo is distinct from 'vencido' or (c.status_atual <> 'resolvido' and c.prazo_vigencia < h.d))
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
