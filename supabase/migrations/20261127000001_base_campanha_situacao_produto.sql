-- ============================================================================
-- Base de clientes: campanhas presas à situação da viagem + produto/serviço.
--
-- base_clientes_buscar (mesmos parâmetros; o retorno ganha produtos e
-- compra_produto no fim):
--
--   Venda adicional (camp = 'adicional'): SÓ compras com embarque a partir
--     de amanhã (São Paulo) — quem está viajando hoje ou já voltou nunca
--     entra, nem com a frase vazia (frase vazia = todos com viagem futura).
--     "Não comprou [serviço] na mesma viagem": igual.
--
--   Recompra (camp = 'recompra'): SÓ viagens já encerradas (retorno antes
--     de hoje; sem retorno, a saída). 1º período (cr_a_de/cr_a_ate) = data
--     de RETORNO. "Não comprou [nada | serviço] [qualquer | mesmo destino]
--     depois de voltar": contado por compra/cliente — sai a viagem se o
--     cliente comprou algo (daquele serviço / para aquele destino) a partir
--     do dia seguinte ao retorno DELA. Frase vazia = clientes parados (viagem
--     encerrada sem compra depois do retorno).
--
--   Produto e serviço do "Comprou" / "Voltou de" (os dois opcionais e
--   combináveis):
--     produto  1º dígito do Roteiro Systur (categoria_codigo)
--     servico  etiqueta de tipos_servico
--
-- cliente_compras.categoria_codigo: repetido da reserva (como loja, datas e
-- tipos_servico) para filtrar e mostrar o produto sem juntar com
-- cliente_excursoes (com a junção, exportar 20 mil clientes passava de 2 s).
-- Mantido por dois gatilhos: preenche ao inserir a compra e propaga quando
-- a reserva muda de categoria. Backfill uma vez aqui.
--
--   Aceitos e IGNORADOS (chamadas antigas não quebram) — remover depois:
--     cr_b_de/cr_b_ate (2º período da Recompra, virou "depois de voltar"),
--     destino, tipo, embarque_*, compra_*, cr_escopo (já ignorados desde
--     20261120000001). Aceitos como sinônimo — remover depois: ca_tipo /
--     cr_tipo (= servico). futura e camp vazio seguem valendo para chamadas
--     antigas, mas a tela não manda mais.
--
-- Idempotente.
-- ============================================================================

alter table public.cliente_compras add column if not exists categoria_codigo smallint;

create or replace function public._cliente_compras_categoria_ao_inserir()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  select e.categoria_codigo into new.categoria_codigo from public.cliente_excursoes e where e.reserva = new.reserva;
  return new;
end;
$$;

drop trigger if exists cliente_compras_categoria on public.cliente_compras;
create trigger cliente_compras_categoria
  before insert on public.cliente_compras
  for each row execute function public._cliente_compras_categoria_ao_inserir();

create or replace function public._cliente_compras_categoria_da_excursao()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.cliente_compras c
  set categoria_codigo = new.categoria_codigo
  where c.reserva = new.reserva and c.categoria_codigo is distinct from new.categoria_codigo;
  return null;
end;
$$;

drop trigger if exists cliente_excursoes_compras_categoria on public.cliente_excursoes;
create trigger cliente_excursoes_compras_categoria
  after insert or update of categoria_codigo on public.cliente_excursoes
  for each row execute function public._cliente_compras_categoria_da_excursao();

revoke all on function public._cliente_compras_categoria_ao_inserir() from public, anon, authenticated;
revoke all on function public._cliente_compras_categoria_da_excursao() from public, anon, authenticated;

update public.cliente_compras c
set categoria_codigo = e.categoria_codigo
from public.cliente_excursoes e
where e.reserva = c.reserva and c.categoria_codigo is distinct from e.categoria_codigo;

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
  soma_parcial boolean,
  produtos smallint[],
  compra_produto smallint
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
  v_produto smallint;
  v_servico text;
  v_ca_destino text := public._like_contem(public.normalizar_nome(public._filtro_txt(f, 'ca_destino')));
  v_ca_de date := public._filtro_data(f, 'ca_de');
  v_ca_ate date := public._filtro_data(f, 'ca_ate');
  v_ca_sem text := public._filtro_txt(f, 'ca_sem_tipo');
  v_cr_destino text := public._like_contem(public.normalizar_nome(public._filtro_txt(f, 'cr_destino')));
  v_cr_a_de date := public._filtro_data(f, 'cr_a_de');
  v_cr_a_ate date := public._filtro_data(f, 'cr_a_ate');
  -- "e não comprou [nada | serviço] [qualquer destino | mesmo destino] depois de voltar"
  v_cr_sem text := coalesce(public._filtro_txt(f, 'cr_sem'), 'nada');
  v_cr_mesmo boolean := coalesce(public._filtro_txt(f, 'cr_mesmo_destino'), '') in ('1', 'true');
begin
  if v_lojas is null or cardinality(v_lojas) = 0 then
    return;
  end if;
  if v_vendedor ~ '^usuario:[0-9a-fA-F-]{36}$' then
    v_vend_uid := substr(v_vendedor, 9)::uuid;
  end if;
  if coalesce(public._filtro_txt(f, 'produto'), '') ~ '^\d$' then
    v_produto := public._filtro_txt(f, 'produto')::smallint;
  end if;
  v_servico := coalesce(
    public._filtro_txt(f, 'servico'),
    case v_camp when 'adicional' then public._filtro_txt(f, 'ca_tipo') when 'recompra' then public._filtro_txt(f, 'cr_tipo') end
  );

  return query
  with b_depois as materialized (
    -- Recompra: compras (daquele serviço / qualquer coisa) lidas uma vez;
    -- vazio nas outras campanhas. O "depois de voltar" de cada viagem é o
    -- anti-join abaixo.
    select b.cliente_id, b.data_confirmacao, b.destino_norm
    from public.cliente_compras b
    where v_camp = 'recompra'
      and b.data_confirmacao is not null
      and (v_cr_sem = 'nada' or b.tipos_servico @> array[v_cr_sem])
  ),
  casadas as materialized (
    -- Compras visíveis que casam com os filtros (só colunas de cliente_compras).
    select a.cliente_id, a.reserva, a.valor, a.loja, a.data_confirmacao, a.data_viagem, a.data_retorno,
      a.destino_cidade, a.tipos_servico, a.categoria_codigo
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
      -- "Comprou / Voltou de [produto] [serviço]".
      and (v_produto is null or a.categoria_codigo = v_produto)
      and (v_servico is null or a.tipos_servico @> array[v_servico])
      and (v_camp is distinct from 'adicional' or (
        -- Só viagem que ainda não embarcou (a partir de amanhã).
        a.data_viagem > v_hoje
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
        -- Só viagem encerrada (retorno antes de hoje; sem retorno, a saída).
        coalesce(a.data_retorno, a.data_viagem) < v_hoje
        and (v_cr_destino is null or a.destino_norm like v_cr_destino)
        and (v_cr_a_de is null or coalesce(a.data_retorno, a.data_viagem) >= v_cr_a_de)
        and (v_cr_a_ate is null or coalesce(a.data_retorno, a.data_viagem) <= v_cr_a_ate)
      ))
      -- Recompra: sai a viagem se o cliente comprou depois de voltar DELA.
      -- Fora do OR para virar anti-join com hash (b_depois é vazio fora da
      -- Recompra).
      and not exists (
        select 1 from b_depois b
        where b.cliente_id = a.cliente_id
          and b.data_confirmacao > coalesce(a.data_retorno, a.data_viagem)
          and (not v_cr_mesmo or (
            a.destino_norm is not null and b.destino_norm is not null
            and (strpos(a.destino_norm, b.destino_norm) > 0 or strpos(b.destino_norm, a.destino_norm) > 0)
          ))
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
      min(c.data_viagem) filter (where c.data_viagem >= v_hoje) as proxima,
      -- Produtos do cliente na mesma passada (um CTE à parte custava ~1,4 s
      -- ao exportar 20 mil clientes como adm_master).
      array_agg(distinct c.categoria_codigo order by c.categoria_codigo) filter (where c.categoria_codigo is not null) as produtos
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
    pg.n, coalesce(pg.soma_total, 0), pg.sem_valor, coalesce(pg.falta_total, false),
    coalesce(pg.produtos, '{}'), r.categoria_codigo
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
