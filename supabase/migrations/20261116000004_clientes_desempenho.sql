-- ============================================================================
-- Base de clientes: desempenho com volume real (statement timeout 57014).
--
-- Medido com 60 mil reservas / 70 mil compras / 25 mil clientes como
-- authenticated (supabase/tests/perf, `npm run carga-clientes`): a busca levava
-- ~8 s para adm_master e as opções de vendedor ~3,6 s. Causas: funções
-- chamadas por linha (normalizar_nome via vendedor_categoria e destino;
-- pode_ver_loja nas policies) e a busca agregando/juntando a tabela larga de
-- reservas para todas as compras antes de paginar.
--
-- Mudanças (a regra de quem vê o quê é a mesma — testes de RLS):
--   * colunas geradas: cliente_compras.destino_norm (destino sem acento/caixa)
--     e cliente_excursoes.vendedor_site (nome do Systur do site);
--   * policies: loja = any ((select _lojas_visiveis())) — calculado uma vez
--     por consulta (initplan), não uma chamada security definer por linha;
--   * base_clientes_buscar: filtra e agrega só cliente_compras, ordena e
--     pagina; reserva/usuário/tipos só para os clientes da página;
--   * opções de vendedor e sugestões de destino: mapeamento + usuários /
--     índice trigram, sem varrer compras com função por linha;
--   * índices: compras (loja, cliente_id), (loja, data_viagem), trigram no
--     destino; reservas coletadas (loja, data_viagem) para a cobertura.
--
-- Idempotente.
-- ============================================================================

create schema if not exists extensions;
create extension if not exists pg_trgm with schema extensions;

-- ----------------------------------------------------------------------------
-- Colunas geradas (calculadas na gravação)
-- ----------------------------------------------------------------------------

alter table public.cliente_compras
  add column if not exists destino_norm text generated always as (public.normalizar_nome(destino_cidade)) stored;

alter table public.cliente_excursoes
  add column if not exists vendedor_site boolean generated always as (public.vendedor_eh_site(vendedor_nome_systur)) stored;

-- ----------------------------------------------------------------------------
-- Índices
-- ----------------------------------------------------------------------------

create index if not exists cliente_compras_loja_cliente_idx on public.cliente_compras (loja, cliente_id);
create index if not exists cliente_compras_loja_viagem_idx on public.cliente_compras (loja, data_viagem);
create index if not exists cliente_compras_destino_trgm_idx on public.cliente_compras using gin (destino_norm extensions.gin_trgm_ops);
create index if not exists cliente_excursoes_coletadas_viagem_idx on public.cliente_excursoes (loja, data_viagem) where coletado_em is not null;

-- ----------------------------------------------------------------------------
-- Policies: lojas visíveis uma vez por consulta
-- ----------------------------------------------------------------------------

drop policy if exists cliente_excursoes_select on public.cliente_excursoes;
create policy cliente_excursoes_select
  on public.cliente_excursoes for select to authenticated
  using (loja = any ((select public._lojas_visiveis())::filial_cvc[]));

drop policy if exists recibos_select on public.recibos;
create policy recibos_select
  on public.recibos for select to authenticated
  using (loja = any ((select public._lojas_visiveis())::filial_cvc[]));

drop policy if exists cliente_compras_select on public.cliente_compras;
create policy cliente_compras_select
  on public.cliente_compras for select to authenticated
  using (loja = any ((select public._lojas_visiveis())::filial_cvc[]));

drop policy if exists cliente_voo_eventos_select on public.cliente_voo_eventos;
create policy cliente_voo_eventos_select
  on public.cliente_voo_eventos for select to authenticated
  using (
    exists (
      select 1 from public.cliente_excursoes e
      where e.reserva = cliente_voo_eventos.reserva and e.loja = any ((select public._lojas_visiveis())::filial_cvc[])
    )
  );

drop policy if exists clientes_select on public.clientes;
create policy clientes_select
  on public.clientes for select to authenticated
  using (
    exists (select 1 from public.cliente_compras c where c.cliente_id = clientes.id and c.loja = any ((select public._lojas_visiveis())::filial_cvc[]))
    or exists (select 1 from public.cliente_excursoes e where e.cliente_id = clientes.id and e.loja = any ((select public._lojas_visiveis())::filial_cvc[]))
    or exists (select 1 from public.recibos r where r.cliente_id = clientes.id and r.loja = any ((select public._lojas_visiveis())::filial_cvc[]))
  );

drop policy if exists storage_recibos_select on storage.objects;
create policy storage_recibos_select
  on storage.objects for select to authenticated
  using (
    bucket_id = 'recibos'
    and exists (
      select 1 from public.recibos r
      where r.pdf_path = storage.objects.name and r.loja = any ((select public._lojas_visiveis())::filial_cvc[])
    )
  );

-- clientes_select procura reservas pelo cliente.
create index if not exists cliente_excursoes_cliente_idx on public.cliente_excursoes (cliente_id);
create index if not exists recibos_cliente_idx on public.recibos (cliente_id);

-- '%termo%' para LIKE, escapando % _ \ (null se o termo for vazio).
create or replace function public._like_contem(p_termo text)
returns text
language sql
immutable
set search_path = public
as $$
  select case when nullif(p_termo, '') is not null
    then '%' || replace(replace(replace(p_termo, '\', '\\'), '%', '\%'), '_', '\_') || '%' end;
$$;

-- ----------------------------------------------------------------------------
-- base_clientes_buscar (mesma assinatura e mesmo resultado de 20261116000003)
-- ----------------------------------------------------------------------------

drop function if exists public.base_clientes_buscar(jsonb, integer, integer);

create function public.base_clientes_buscar(p_filtros jsonb, p_limite integer default 50, p_offset integer default 0)
returns table (
  cliente_id uuid,
  nome text,
  telefones jsonb,
  lojas text[],
  qtd_viagens integer,
  total_comprado numeric,
  ultima_compra date,
  proxima_viagem date,
  tipos text[],
  compra_reserva text,
  compra_destino text,
  compra_embarque date,
  compra_retorno date,
  compra_valor numeric,
  compra_vendedor text,
  compra_vendedor_categoria text,
  compra_loja filial_cvc,
  compra_tipos text[],
  total_clientes bigint,
  soma_valores numeric,
  compras_sem_valor integer,
  soma_parcial boolean
)
language plpgsql
stable
security definer
set search_path = public
-- Ordenação/agregação de dezenas de milhares de linhas sem ir para o disco.
set work_mem = '32MB'
as $$
declare
  f jsonb := coalesce(p_filtros, '{}'::jsonb);
  v_lojas filial_cvc[] := public._lojas_visiveis();
  v_hoje date := (now() at time zone 'America/Sao_Paulo')::date;
  v_loja text := public._filtro_txt(f, 'loja');
  v_vendedor text := public._filtro_txt(f, 'vendedor');
  v_vend_uid uuid;
  v_destino text := public._like_contem(public.normalizar_nome(public._filtro_txt(f, 'destino')));
  v_tipo text := public._filtro_txt(f, 'tipo');
  v_valor_de numeric := public._filtro_num(f, 'valor_de');
  v_valor_ate numeric := public._filtro_num(f, 'valor_ate');
  v_total_de numeric := public._filtro_num(f, 'total_de');
  v_total_ate numeric := public._filtro_num(f, 'total_ate');
  v_emb_de date := public._filtro_data(f, 'embarque_de');
  v_emb_ate date := public._filtro_data(f, 'embarque_ate');
  v_cmp_de date := public._filtro_data(f, 'compra_de');
  v_cmp_ate date := public._filtro_data(f, 'compra_ate');
  v_futura boolean := coalesce(public._filtro_txt(f, 'futura'), '') in ('1', 'true');
  v_camp text := public._filtro_txt(f, 'camp');
  v_ca_tipo text := public._filtro_txt(f, 'ca_tipo');
  v_ca_destino text := public._like_contem(public.normalizar_nome(public._filtro_txt(f, 'ca_destino')));
  v_ca_de date := public._filtro_data(f, 'ca_de');
  v_ca_ate date := public._filtro_data(f, 'ca_ate');
  v_ca_sem text := public._filtro_txt(f, 'ca_sem_tipo');
  v_cr_tipo text := public._filtro_txt(f, 'cr_tipo');
  v_cr_destino text := public._like_contem(public.normalizar_nome(public._filtro_txt(f, 'cr_destino')));
  v_cr_a_de date := public._filtro_data(f, 'cr_a_de');
  v_cr_a_ate date := public._filtro_data(f, 'cr_a_ate');
  v_cr_b_de date := public._filtro_data(f, 'cr_b_de');
  v_cr_b_ate date := public._filtro_data(f, 'cr_b_ate');
  v_cr_escopo text := coalesce(public._filtro_txt(f, 'cr_escopo'), 'nada');
begin
  if v_lojas is null or cardinality(v_lojas) = 0 then
    return;
  end if;
  if v_vendedor ~ '^usuario:[0-9a-fA-F-]{36}$' then
    v_vend_uid := substr(v_vendedor, 9)::uuid;
  end if;

  return query
  with casadas as materialized (
    -- Compras visíveis que casam com os filtros (só colunas de cliente_compras).
    select a.cliente_id, a.reserva, a.valor, a.loja, a.data_confirmacao, a.data_viagem, a.data_retorno,
      a.destino_cidade, a.tipos_servico
    from public.cliente_compras a
    where a.loja = any (v_lojas)
      and (v_loja is null or a.loja::text = v_loja)
      and (v_destino is null or a.destino_norm like v_destino)
      and (v_tipo is null or a.tipos_servico @> array[v_tipo])
      and (v_valor_de is null or a.valor >= v_valor_de)
      and (v_valor_ate is null or a.valor <= v_valor_ate)
      and (v_emb_de is null or a.data_viagem >= v_emb_de)
      and (v_emb_ate is null or a.data_viagem <= v_emb_ate)
      and (v_cmp_de is null or a.data_confirmacao >= v_cmp_de)
      and (v_cmp_ate is null or a.data_confirmacao <= v_cmp_ate)
      -- Vendedor: conjunto de reservas calculado uma vez (hash), não por compra.
      and (v_vendedor is null or a.reserva in (
        select e.reserva
        from public.cliente_excursoes e
        left join public.usuarios u on u.id = e.vendedor_usuario_id
        where e.loja = any (v_lojas)
          and (
            (v_vendedor = 'grupo:site' and e.vendedor_site)
            or (v_vendedor = 'grupo:ex' and not e.vendedor_site and not coalesce(u.ativo, false))
            or (v_vend_uid is not null and not e.vendedor_site and u.ativo and e.vendedor_usuario_id = v_vend_uid)
            or e.vendedor_nome_systur = v_vendedor
          )
      ))
      and (v_camp is distinct from 'adicional' or (
        (v_ca_tipo is null or a.tipos_servico @> array[v_ca_tipo])
        and (v_ca_destino is null or a.destino_norm like v_ca_destino)
        and (v_ca_de is null or a.data_viagem >= v_ca_de)
        and (v_ca_ate is null or a.data_viagem <= v_ca_ate)
        and (v_ca_sem is null or not exists (
          select 1 from public.cliente_compras b
          where b.cliente_id = a.cliente_id
            and b.tipos_servico @> array[v_ca_sem]
            and a.destino_norm is not null and b.destino_norm is not null
            and (strpos(a.destino_norm, b.destino_norm) > 0 or strpos(b.destino_norm, a.destino_norm) > 0)
            and b.data_viagem between a.data_viagem - 3 and coalesce(a.data_retorno, a.data_viagem) + 3
        ))
      ))
      and (v_camp is distinct from 'recompra' or (
        (v_cr_tipo is null or a.tipos_servico @> array[v_cr_tipo])
        and (v_cr_destino is null or a.destino_norm like v_cr_destino)
        and (v_cr_a_de is null or a.data_confirmacao >= v_cr_a_de)
        and (v_cr_a_ate is null or a.data_confirmacao <= v_cr_a_ate)
        -- Quem comprou no período B: conjunto calculado uma vez (hash).
        and a.cliente_id not in (
          select b.cliente_id from public.cliente_compras b
          where (v_cr_b_de is null or b.data_confirmacao >= v_cr_b_de)
            and (v_cr_b_ate is null or b.data_confirmacao <= v_cr_b_ate)
            and (v_cr_escopo = 'nada' or (
              (v_cr_tipo is null or b.tipos_servico @> array[v_cr_tipo])
              and (v_cr_destino is null or b.destino_norm like v_cr_destino)
            ))
        )
      ))
  ),
  por_casada as (
    select cs.cliente_id, sum(cs.valor) as soma, bool_or(cs.valor is null) as falta
    from casadas cs
    group by cs.cliente_id
  ),
  agregado as (
    -- Totais do cliente sobre TODAS as compras visíveis dele (não só as do filtro).
    select c.cliente_id,
      array_agg(distinct c.loja::text order by c.loja::text) as lojas,
      count(distinct c.reserva)::int as qtd,
      sum(c.valor)::numeric as total,
      count(*) filter (where c.valor is null)::int as sem_valor,
      max(c.data_confirmacao) as ultima,
      min(c.data_viagem) filter (where c.data_viagem >= v_hoje) as proxima
    -- Uma passada (hash) sobre as compras visíveis; juntar com por_casada
    -- depois é mais previsível que 25 mil buscas por índice.
    from public.cliente_compras c
    where c.loja = any (v_lojas)
    group by c.cliente_id
  ),
  pagina as (
    select ag.*, pc.soma, pc.falta,
      count(*) over () as n, sum(pc.soma) over () as soma_total, bool_or(pc.falta) over () as falta_total
    from agregado ag
    join por_casada pc on pc.cliente_id = ag.cliente_id
    where (v_total_de is null or coalesce(ag.total, 0) >= v_total_de)
      and (v_total_ate is null or coalesce(ag.total, 0) <= v_total_ate)
      and (not v_futura or ag.proxima is not null)
    order by ag.ultima desc nulls last, ag.cliente_id
    limit greatest(coalesce(p_limite, 50), 1) offset greatest(coalesce(p_offset, 0), 0)
  ),
  rep as (
    -- Compra que casou no filtro, só para os clientes da página.
    select distinct on (cs.cliente_id) cs.*
    from casadas cs
    where cs.cliente_id in (select pg.cliente_id from pagina pg)
    order by cs.cliente_id, cs.data_viagem desc nulls last, cs.data_confirmacao desc nulls last, cs.reserva
  ),
  tipos_cliente as (
    select c.cliente_id, array_agg(distinct t order by t) as tipos
    from public.cliente_compras c
    cross join lateral unnest(c.tipos_servico) t
    where c.loja = any (v_lojas)
      and c.cliente_id in (select pg.cliente_id from pagina pg)
    group by c.cliente_id
  )
  select pg.cliente_id, cl.nome, cl.telefones, pg.lojas, pg.qtd, pg.total, pg.ultima, pg.proxima,
    coalesce(tc.tipos, '{}'),
    r.reserva, r.destino_cidade, r.data_viagem, r.data_retorno, r.valor,
    case when cat.categoria = 'atual' then u.nome_completo else e.vendedor_nome_systur end,
    cat.categoria, r.loja, r.tipos_servico,
    pg.n, coalesce(pg.soma_total, 0), pg.sem_valor, coalesce(pg.falta_total, false)
  from pagina pg
  join public.clientes cl on cl.id = pg.cliente_id
  join rep r on r.cliente_id = pg.cliente_id
  left join tipos_cliente tc on tc.cliente_id = pg.cliente_id
  left join public.cliente_excursoes e on e.reserva = r.reserva
  left join public.usuarios u on u.id = e.vendedor_usuario_id
  cross join lateral (
    select case when coalesce(e.vendedor_site, false) then 'site' when coalesce(u.ativo, false) then 'atual' else 'ex' end as categoria
  ) cat
  order by pg.ultima desc nulls last, pg.cliente_id;
end;
$$;

revoke all on function public.base_clientes_buscar(jsonb, integer, integer) from public, anon;
grant execute on function public.base_clientes_buscar(jsonb, integer, integer) to authenticated, service_role;

-- ----------------------------------------------------------------------------
-- Compras do cliente: categoria pela coluna gerada (sem normalizar por linha).
-- ----------------------------------------------------------------------------

create or replace function public.base_clientes_compras(p_cliente uuid)
returns table (
  reserva text,
  tipo_produto text,
  descricao text,
  destino_cidade text,
  destino_estado text,
  destino_pais text,
  data_confirmacao date,
  data_viagem date,
  data_retorno date,
  tipos_servico text[],
  valor numeric,
  recibo text,
  vendedor text,
  vendedor_categoria text,
  loja filial_cvc,
  passageiros text[]
)
language sql
stable
security definer
set search_path = public
as $$
  select c.reserva, e.tipo_produto, coalesce(e.descricao_roteiro, e.descricao), c.destino_cidade, e.destino_estado,
    e.destino_pais, c.data_confirmacao, c.data_viagem, c.data_retorno, c.tipos_servico, c.valor, c.recibo,
    case when cat.categoria = 'atual' then u.nome_completo else e.vendedor_nome_systur end,
    cat.categoria, c.loja, c.passageiros
  from public.cliente_compras c
  join public.cliente_excursoes e on e.reserva = c.reserva
  left join public.usuarios u on u.id = e.vendedor_usuario_id
  cross join lateral (
    select case when e.vendedor_site then 'site' when coalesce(u.ativo, false) then 'atual' else 'ex' end as categoria
  ) cat
  where c.cliente_id = p_cliente and c.loja = any ((select public._lojas_visiveis())::filial_cvc[])
  order by c.data_confirmacao desc nulls last, c.data_viagem desc nulls last, c.reserva;
$$;

-- ----------------------------------------------------------------------------
-- Opções do filtro "Vendedor": só mapeamento + usuários (dezenas de linhas).
--   atual: nome ativo no mapeamento vinculado a usuário ativo;
--   ex:    nome sem vínculo, vinculado a usuário inativo ou inativo no
--          mapeamento (mesma regra das vendas: o vínculo é propagado).
-- ----------------------------------------------------------------------------

create or replace function public.base_clientes_vendedores_opcoes()
returns table (categoria text, valor text, rotulo text, loja filial_cvc)
language sql
stable
security definer
set search_path = public
as $$
  with lojas as (select public._lojas_visiveis() as v)
  select distinct 'atual', 'usuario:' || u.id::text, u.nome_completo, u.filial
  from public.systur_vendedor_mapeamento m
  join public.usuarios u on u.id = m.usuario_id and u.ativo
  where m.ativo
    and not public.vendedor_eh_site(m.nome_systur)
    and m.loja = any ((select v from lojas)::filial_cvc[])
  union
  select distinct 'ex', m.nome_systur, m.nome_systur, m.loja
  from public.systur_vendedor_mapeamento m
  left join public.usuarios u on u.id = m.usuario_id
  where m.loja = any ((select v from lojas)::filial_cvc[])
    and not public.vendedor_eh_site(m.nome_systur)
    and not (m.ativo and coalesce(u.ativo, false))
  order by 1, 3;
$$;

-- ----------------------------------------------------------------------------
-- Sugestões de destino: coluna normalizada + índice trigram.
-- ----------------------------------------------------------------------------

create or replace function public.base_clientes_destinos(p_termo text, p_limite integer default 10)
returns table (destino text, compras bigint)
language sql
stable
security definer
set search_path = public
as $$
  with t as materialized (select public._like_contem(public.normalizar_nome(p_termo)) as padrao)
  select c.destino_cidade, count(*)
  from public.cliente_compras c, t
  where c.loja = any ((select public._lojas_visiveis())::filial_cvc[])
    and c.destino_cidade is not null
    and (t.padrao is null or c.destino_norm like t.padrao)
  group by c.destino_cidade
  order by count(*) desc, c.destino_cidade
  limit greatest(coalesce(p_limite, 10), 1);
$$;

-- ----------------------------------------------------------------------------
-- Cobertura: contagem pelo índice parcial de reservas coletadas.
-- ----------------------------------------------------------------------------

create or replace function public.base_cobertura_meses()
returns table (loja filial_cvc, mes date, coberto boolean, reservas integer)
language sql
stable
security definer
set search_path = public
as $$
  with limites as (
    select j.loja, date_trunc('month', min(j.de))::date as ini, date_trunc('month', max(j.ate))::date as fim
    from public.base_coleta_janelas j
    where public.auth_is_adm_master()
    group by j.loja
  ),
  meses as (
    select l.loja, g::date as mes
    from limites l, generate_series(l.ini, l.fim, interval '1 month') g
  ),
  contagem as (
    select e.loja, date_trunc('month', e.data_viagem)::date as mes, count(*)::int as n
    from public.cliente_excursoes e
    join limites l on l.loja = e.loja
    where e.coletado_em is not null and e.data_viagem between l.ini and (l.fim + interval '1 month - 1 day')::date
    group by 1, 2
  )
  select m.loja, m.mes,
    exists (
      select 1 from public.base_coleta_janelas j
      where j.loja = m.loja and j.de <= (m.mes + interval '1 month - 1 day')::date and j.ate >= m.mes
    ),
    coalesce(c.n, 0)
  from meses m
  left join contagem c on c.loja = m.loja and c.mes = m.mes
  order by m.loja, m.mes;
$$;

create or replace function public.base_cobertura_resumo()
returns table (loja filial_cvc, saida_de date, saida_ate date, reservas integer, ultima_coleta timestamptz)
language sql
stable
security definer
set search_path = public
as $$
  with j as (
    select j.loja, min(j.de) as de, max(j.ate) as ate, max(j.coletado_em) as ultima
    from public.base_coleta_janelas j
    where public.auth_is_adm_master()
    group by j.loja
  ),
  n as (
    select e.loja, count(*)::int as n
    from public.cliente_excursoes e
    where e.coletado_em is not null and e.loja in (select j.loja from j)
    group by e.loja
  )
  select j.loja, j.de, j.ate, coalesce(n.n, 0), j.ultima
  from j left join n on n.loja = j.loja
  order by j.loja;
$$;

analyze public.cliente_compras;
analyze public.cliente_excursoes;
