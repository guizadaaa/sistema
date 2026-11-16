-- ============================================================================
-- Base de clientes: valor ainda não coletado.
--
-- Compras vindas só da conferência (sync) ainda não têm valor. Em
-- base_clientes_buscar:
--   total_comprado     soma só os valores conhecidos; null se nenhum é conhecido
--   compras_sem_valor  compras visíveis do cliente sem valor (> 0 = "parcial")
--   soma_parcial       alguma compra que casou no filtro está sem valor
-- Mesma função de 20261113000001 com essas colunas a mais (o retorno muda:
-- drop + create).
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
as $$
declare
  f jsonb := coalesce(p_filtros, '{}'::jsonb);
  v_lojas filial_cvc[] := public._lojas_visiveis();
  v_hoje date := (now() at time zone 'America/Sao_Paulo')::date;
  v_loja text := public._filtro_txt(f, 'loja');
  v_vendedor text := public._filtro_txt(f, 'vendedor');
  v_destino text := public.normalizar_nome(public._filtro_txt(f, 'destino'));
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
  v_ca_destino text := public.normalizar_nome(public._filtro_txt(f, 'ca_destino'));
  v_ca_de date := public._filtro_data(f, 'ca_de');
  v_ca_ate date := public._filtro_data(f, 'ca_ate');
  v_ca_sem text := public._filtro_txt(f, 'ca_sem_tipo');
  v_cr_tipo text := public._filtro_txt(f, 'cr_tipo');
  v_cr_destino text := public.normalizar_nome(public._filtro_txt(f, 'cr_destino'));
  v_cr_a_de date := public._filtro_data(f, 'cr_a_de');
  v_cr_a_ate date := public._filtro_data(f, 'cr_a_ate');
  v_cr_b_de date := public._filtro_data(f, 'cr_b_de');
  v_cr_b_ate date := public._filtro_data(f, 'cr_b_ate');
  v_cr_escopo text := coalesce(public._filtro_txt(f, 'cr_escopo'), 'nada');
begin
  if v_lojas is null or cardinality(v_lojas) = 0 then
    return;
  end if;

  return query
  with vis as (
    select c.*, e.vendedor_nome_systur, coalesce(u.nome_completo, e.vendedor_nome_systur) as vendedor_exibir
    from public.cliente_compras c
    join public.cliente_excursoes e on e.reserva = c.reserva
    left join public.usuarios u on u.id = e.vendedor_usuario_id
    where c.loja = any (v_lojas)
  ),
  casadas as (
    select a.* from vis a
    where (v_loja is null or a.loja::text = v_loja)
      and (v_vendedor is null or a.vendedor_nome_systur = v_vendedor)
      and (v_destino is null or strpos(coalesce(public.normalizar_nome(a.destino_cidade), ''), v_destino) > 0)
      and (v_tipo is null or v_tipo = any (a.tipos_servico))
      and (v_valor_de is null or a.valor >= v_valor_de)
      and (v_valor_ate is null or a.valor <= v_valor_ate)
      and (v_emb_de is null or a.data_viagem >= v_emb_de)
      and (v_emb_ate is null or a.data_viagem <= v_emb_ate)
      and (v_cmp_de is null or a.data_confirmacao >= v_cmp_de)
      and (v_cmp_ate is null or a.data_confirmacao <= v_cmp_ate)
      and (v_camp is distinct from 'adicional' or (
        (v_ca_tipo is null or v_ca_tipo = any (a.tipos_servico))
        and (v_ca_destino is null or strpos(coalesce(public.normalizar_nome(a.destino_cidade), ''), v_ca_destino) > 0)
        and (v_ca_de is null or a.data_viagem >= v_ca_de)
        and (v_ca_ate is null or a.data_viagem <= v_ca_ate)
        and (v_ca_sem is null or not exists (
          select 1 from public.cliente_compras b
          where b.cliente_id = a.cliente_id
            and v_ca_sem = any (b.tipos_servico)
            and public._destinos_batem(a.destino_cidade, b.destino_cidade)
            and b.data_viagem between a.data_viagem - 3 and coalesce(a.data_retorno, a.data_viagem) + 3
        ))
      ))
      and (v_camp is distinct from 'recompra' or (
        (v_cr_tipo is null or v_cr_tipo = any (a.tipos_servico))
        and (v_cr_destino is null or strpos(coalesce(public.normalizar_nome(a.destino_cidade), ''), v_cr_destino) > 0)
        and (v_cr_a_de is null or a.data_confirmacao >= v_cr_a_de)
        and (v_cr_a_ate is null or a.data_confirmacao <= v_cr_a_ate)
        and not exists (
          select 1 from public.cliente_compras b
          where b.cliente_id = a.cliente_id
            and (v_cr_b_de is null or b.data_confirmacao >= v_cr_b_de)
            and (v_cr_b_ate is null or b.data_confirmacao <= v_cr_b_ate)
            and (v_cr_escopo = 'nada' or (
              (v_cr_tipo is null or v_cr_tipo = any (b.tipos_servico))
              and (v_cr_destino is null or strpos(coalesce(public.normalizar_nome(b.destino_cidade), ''), v_cr_destino) > 0)
            ))
        )
      ))
  ),
  por_cliente as (
    select v.cliente_id,
      array_agg(distinct v.loja::text order by v.loja::text) as lojas,
      count(distinct v.reserva)::int as qtd_viagens,
      sum(v.valor)::numeric as total,
      count(*) filter (where v.valor is null)::int as sem_valor,
      max(v.data_confirmacao) as ultima,
      min(v.data_viagem) filter (where v.data_viagem >= v_hoje) as proxima
    from vis v
    where v.cliente_id in (select distinct cs.cliente_id from casadas cs)
    group by v.cliente_id
  ),
  rep as (
    select distinct on (cs.cliente_id) cs.*
    from casadas cs
    order by cs.cliente_id, cs.data_viagem desc nulls last, cs.data_confirmacao desc nulls last, cs.reserva
  ),
  soma_casadas as (
    select cs.cliente_id, sum(cs.valor) as soma, bool_or(cs.valor is null) as falta from casadas cs group by cs.cliente_id
  ),
  final as (
    select p.*, r.reserva as r_reserva, r.destino_cidade as r_destino, r.data_viagem as r_embarque,
      r.data_retorno as r_retorno, r.valor as r_valor, r.vendedor_exibir as r_vendedor, r.loja as r_loja,
      r.tipos_servico as r_tipos, s.soma, s.falta
    from por_cliente p
    join rep r on r.cliente_id = p.cliente_id
    join soma_casadas s on s.cliente_id = p.cliente_id
    where (v_total_de is null or coalesce(p.total, 0) >= v_total_de)
      and (v_total_ate is null or coalesce(p.total, 0) <= v_total_ate)
      and (not v_futura or p.proxima is not null)
  ),
  paginada as (
    select fi.*, count(*) over () as n, sum(fi.soma) over () as soma_total, bool_or(fi.falta) over () as falta_total
    from final fi
    order by fi.ultima desc nulls last, fi.cliente_id
    limit greatest(coalesce(p_limite, 50), 1) offset greatest(coalesce(p_offset, 0), 0)
  )
  select pg.cliente_id, cl.nome, cl.telefones, pg.lojas, pg.qtd_viagens, pg.total, pg.ultima, pg.proxima,
    (select coalesce(array_agg(distinct t order by t), '{}') from vis v2, unnest(v2.tipos_servico) t
     where v2.cliente_id = pg.cliente_id),
    pg.r_reserva, pg.r_destino, pg.r_embarque, pg.r_retorno, pg.r_valor, pg.r_vendedor, pg.r_loja, pg.r_tipos,
    pg.n, coalesce(pg.soma_total, 0), pg.sem_valor, coalesce(pg.falta_total, false)
  from paginada pg
  join public.clientes cl on cl.id = pg.cliente_id
  order by pg.ultima desc nulls last, pg.cliente_id;
end;
$$;

revoke all on function public.base_clientes_buscar(jsonb, integer, integer) from public, anon;
grant execute on function public.base_clientes_buscar(jsonb, integer, integer) to authenticated, service_role;
