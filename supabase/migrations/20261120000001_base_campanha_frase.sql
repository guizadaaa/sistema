-- ============================================================================
-- Base de clientes: a frase da campanha é o filtro principal.
--
-- base_clientes_buscar (mesma assinatura e mesmo retorno de 20261116000004):
--   * Saem do bloco de baixo: destino, tipo, embarque_de/ate e compra_de/ate.
--     Continuam ACEITOS e IGNORADOS (chamadas antigas não quebram) —
--     remover depois, junto com cr_escopo e camp vazio.
--   * Venda adicional: igual (a tela exige o "não comprou" quando a frase
--     tem qualquer campo; frase vazia = base geral).
--   * Recompra: frase vazia = base geral (antes excluía todo mundo).
--     "e não comprou [tipo | nada]": cr_sem (padrão 'nada').
--     "[para qualquer destino | para o mesmo destino]": cr_mesmo_destino
--     (mesmo_destino, boolean, padrão false). Qualquer destino: sai quem
--     comprou no 2º período; mesmo destino: só sai se voltou a comprar o
--     destino da compra do 1º período. cr_escopo (antigo) é ignorado.
--   * camp vazio (antiga "Nenhuma") segue aceito: sem campanha.
--
-- Idempotente.
-- ============================================================================

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
  v_valor_de numeric := public._filtro_num(f, 'valor_de');
  v_valor_ate numeric := public._filtro_num(f, 'valor_ate');
  v_total_de numeric := public._filtro_num(f, 'total_de');
  v_total_ate numeric := public._filtro_num(f, 'total_ate');
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
  -- "e não comprou [tipo | nada] [para qualquer destino | para o mesmo destino]"
  v_cr_sem text := coalesce(public._filtro_txt(f, 'cr_sem'), 'nada');
  v_cr_mesmo boolean := coalesce(public._filtro_txt(f, 'cr_mesmo_destino'), '') in ('1', 'true');
  -- Frase da Recompra vazia = base geral (como a antiga "Nenhuma").
  v_cr_frase boolean;
begin
  v_cr_frase := v_cr_mesmo or coalesce(
    v_cr_tipo, v_cr_destino, v_cr_a_de::text, v_cr_a_ate::text, v_cr_b_de::text, v_cr_b_ate::text,
    public._filtro_txt(f, 'cr_sem')
  ) is not null;
  if v_lojas is null or cardinality(v_lojas) = 0 then
    return;
  end if;
  if v_vendedor ~ '^usuario:[0-9a-fA-F-]{36}$' then
    v_vend_uid := substr(v_vendedor, 9)::uuid;
  end if;

  return query
  with b_mesmo as materialized (
    -- Recompra "para o mesmo destino": compras do 2º período (aquele tipo /
    -- qualquer coisa), lidas uma vez; vazio nos outros casos.
    select b.cliente_id, b.destino_norm
    from public.cliente_compras b
    where v_camp = 'recompra' and v_cr_frase and v_cr_mesmo
      and b.destino_norm is not null
      and (v_cr_b_de is null or b.data_confirmacao >= v_cr_b_de)
      and (v_cr_b_ate is null or b.data_confirmacao <= v_cr_b_ate)
      and (v_cr_sem = 'nada' or b.tipos_servico @> array[v_cr_sem])
  ),
  casadas as materialized (
    -- Compras visíveis que casam com os filtros (só colunas de cliente_compras).
    select a.cliente_id, a.reserva, a.valor, a.loja, a.data_confirmacao, a.data_viagem, a.data_retorno,
      a.destino_cidade, a.tipos_servico
    from public.cliente_compras a
    where a.loja = any (v_lojas)
      and (v_loja is null or a.loja::text = v_loja)
      and (v_valor_de is null or a.valor >= v_valor_de)
      and (v_valor_ate is null or a.valor <= v_valor_ate)
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
      and (v_camp is distinct from 'recompra' or not v_cr_frase or (
        (v_cr_tipo is null or a.tipos_servico @> array[v_cr_tipo])
        and (v_cr_destino is null or a.destino_norm like v_cr_destino)
        and (v_cr_a_de is null or a.data_confirmacao >= v_cr_a_de)
        and (v_cr_a_ate is null or a.data_confirmacao <= v_cr_a_ate)
        -- Para qualquer destino: quem comprou (aquele tipo / qualquer coisa) no
        -- 2º período sai — conjunto calculado uma vez (hash).
        and (v_cr_mesmo or a.cliente_id not in (
          select b.cliente_id from public.cliente_compras b
          where (v_cr_b_de is null or b.data_confirmacao >= v_cr_b_de)
            and (v_cr_b_ate is null or b.data_confirmacao <= v_cr_b_ate)
            and (v_cr_sem = 'nada' or b.tipos_servico @> array[v_cr_sem])
        ))
      ))
      -- Recompra para o mesmo destino: só sai se voltou a comprar o destino
      -- desta compra. Fora do OR para virar anti-join com hash (b_mesmo é
      -- vazio quando não é esse caso).
      and not exists (
        select 1 from b_mesmo b
        where b.cliente_id = a.cliente_id
          and (strpos(a.destino_norm, b.destino_norm) > 0 or strpos(b.destino_norm, a.destino_norm) > 0)
      )
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
