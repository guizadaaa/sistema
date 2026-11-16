-- ============================================================================
-- Clientes: vendedores atuais × ex-vendedores × Site/Internet, aviso de
-- vínculo útil e cobertura da base por mês.
--
-- Regra (calculada na consulta, nada é gravado):
--   site   nome do Systur com "Internet" ou "Agencia De Viagens Cvc Tur"
--          (ex.: "Agencia De Viagens Cvc Tur - Internet");
--   atual  venda ligada (pelo mapeamento) a um usuário da Aura ativo;
--   ex     todo o resto: nome sem vínculo, vinculado a usuário inativo ou
--          marcado inativo no mapeamento (o vínculo é limpo nas vendas —
--          systur_mapeamento_propagar_vinculo).
-- Vincular um nome a um usuário ativo o torna "atual"; inativar o usuário o
-- devolve a "ex" na hora.
--
-- Filtro "vendedor" de base_clientes_buscar: 'grupo:ex', 'grupo:site',
-- 'usuario:<uuid>' (equipe atual) ou um nome do Systur (ex-vendedor
-- específico / filtros salvos antigos).
--
-- Idempotente (create or replace / drop + create quando o retorno muda).
-- ============================================================================

create or replace function public.vendedor_eh_site(p_nome text)
returns boolean
language sql
immutable
set search_path = public
as $$
  select coalesce(
    strpos(public.normalizar_nome(p_nome), 'internet') > 0
    or strpos(public.normalizar_nome(p_nome), 'agencia de viagens cvc tur') > 0,
    false
  );
$$;

-- p_usuario_ativo: usuarios.ativo do vendedor_usuario_id da venda (null = sem vínculo).
create or replace function public.vendedor_categoria(p_nome text, p_usuario_ativo boolean)
returns text
language sql
immutable
set search_path = public
as $$
  select case
    when public.vendedor_eh_site(p_nome) then 'site'
    when coalesce(p_usuario_ativo, false) then 'atual'
    else 'ex'
  end;
$$;

grant execute on function public.vendedor_eh_site(text) to authenticated, service_role;
grant execute on function public.vendedor_categoria(text, boolean) to authenticated, service_role;

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
    select c.*, e.vendedor_nome_systur, e.vendedor_usuario_id as vend_uid, cat.categoria as vend_cat,
      case when cat.categoria = 'atual' then u.nome_completo else e.vendedor_nome_systur end as vendedor_exibir
    from public.cliente_compras c
    join public.cliente_excursoes e on e.reserva = c.reserva
    left join public.usuarios u on u.id = e.vendedor_usuario_id
    cross join lateral (select public.vendedor_categoria(e.vendedor_nome_systur, u.ativo) as categoria) cat
    where c.loja = any (v_lojas)
  ),
  casadas as (
    select a.* from vis a
    where (v_loja is null or a.loja::text = v_loja)
      and (v_vendedor is null
        or (v_vendedor = 'grupo:ex' and a.vend_cat = 'ex')
        or (v_vendedor = 'grupo:site' and a.vend_cat = 'site')
        or (v_vendedor like 'usuario:%' and a.vend_cat = 'atual' and a.vend_uid::text = substr(v_vendedor, 9))
        or a.vendedor_nome_systur = v_vendedor)
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
      r.data_retorno as r_retorno, r.valor as r_valor, r.vendedor_exibir as r_vendedor, r.vend_cat as r_vend_cat, r.loja as r_loja,
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
    pg.r_reserva, pg.r_destino, pg.r_embarque, pg.r_retorno, pg.r_valor, pg.r_vendedor, pg.r_vend_cat, pg.r_loja, pg.r_tipos,
    pg.n, coalesce(pg.soma_total, 0), pg.sem_valor, coalesce(pg.falta_total, false)
  from paginada pg
  join public.clientes cl on cl.id = pg.cliente_id
  order by pg.ultima desc nulls last, pg.cliente_id;
end;
$$;

revoke all on function public.base_clientes_buscar(jsonb, integer, integer) from public, anon;
grant execute on function public.base_clientes_buscar(jsonb, integer, integer) to authenticated, service_role;

-- Compras do cliente: vendedor exibido + categoria (ex-vendedor mostra o
-- nome do Systur, mesmo vinculado a usuário inativo).
drop function if exists public.base_clientes_compras(uuid);

create function public.base_clientes_compras(p_cliente uuid)
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
  cross join lateral (select public.vendedor_categoria(e.vendedor_nome_systur, u.ativo) as categoria) cat
  where c.cliente_id = p_cliente and c.loja = any (public._lojas_visiveis())
  order by c.data_confirmacao desc nulls last, c.data_viagem desc nulls last, c.reserva;
$$;

revoke all on function public.base_clientes_compras(uuid) from public, anon;
grant execute on function public.base_clientes_compras(uuid) to authenticated, service_role;

-- ----------------------------------------------------------------------------
-- Opções do filtro "Vendedor" (substitui base_clientes_vendedores).
--   atual: usuários ativos vinculados (mapeamento ativo) a um nome do Systur
--          numa loja visível; loja = usuarios.filial (tela filtra pela loja
--          escolhida). valor = 'usuario:<uuid>'.
--   ex:    nomes do Systur das vendas visíveis que hoje são de ex-vendedor
--          (a tela só mostra quando o usuário digita). valor = o nome.
-- ----------------------------------------------------------------------------

drop function if exists public.base_clientes_vendedores();

create or replace function public.base_clientes_vendedores_opcoes()
returns table (categoria text, valor text, rotulo text, loja filial_cvc)
language sql
stable
security definer
set search_path = public
as $$
  select distinct 'atual', 'usuario:' || u.id::text, u.nome_completo, u.filial
  from public.systur_vendedor_mapeamento m
  join public.usuarios u on u.id = m.usuario_id and u.ativo
  where m.ativo
    and not public.vendedor_eh_site(m.nome_systur)
    and m.loja = any (public._lojas_visiveis())
  union
  select distinct 'ex', e.vendedor_nome_systur, e.vendedor_nome_systur, e.loja
  from public.cliente_excursoes e
  left join public.usuarios u on u.id = e.vendedor_usuario_id
  where e.vendedor_nome_systur is not null
    and e.loja = any (public._lojas_visiveis())
    and public.vendedor_categoria(e.vendedor_nome_systur, u.ativo) = 'ex'
    and exists (select 1 from public.cliente_compras c where c.reserva = e.reserva)
  order by 1, 3;
$$;

revoke all on function public.base_clientes_vendedores_opcoes() from public, anon;
grant execute on function public.base_clientes_vendedores_opcoes() to authenticated, service_role;

-- ----------------------------------------------------------------------------
-- Aviso de vínculo: nomes do Systur sem vínculo (ativos no mapeamento) cujo
-- nome, sem acento e sem diferenciar maiúsculas, é igual ao de um usuário
-- ativo da Aura. Só adm/adm_master.
-- ----------------------------------------------------------------------------

create or replace function public.systur_nomes_parecem_ativos()
returns table (mapeamento_id uuid, nome_systur text, loja filial_cvc, usuario_id uuid, usuario_nome text)
language sql
stable
security definer
set search_path = public
as $$
  select m.id, m.nome_systur, m.loja, u.id, u.nome_completo
  from public.systur_vendedor_mapeamento m
  join public.usuarios u on u.ativo and public.normalizar_nome(u.nome_completo) = public.normalizar_nome(m.nome_systur)
  where public.auth_is_admin()
    and m.usuario_id is null
    and m.ativo
  order by m.loja, m.nome_systur;
$$;

revoke all on function public.systur_nomes_parecem_ativos() from public, anon;
grant execute on function public.systur_nomes_parecem_ativos() to authenticated, service_role;

-- ----------------------------------------------------------------------------
-- Cobertura da base por mês (adm_master): para cada loja, os meses entre a
-- primeira e a última saída coletadas; coberto = alguma janela cobre parte do
-- mês; reservas = reservas coletadas pelo bot com data_viagem no mês.
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
    group by j.loja
  ),
  meses as (
    select l.loja, g::date as mes
    from limites l, generate_series(l.ini, l.fim, interval '1 month') g
  ),
  contagem as (
    select e.loja, date_trunc('month', e.data_viagem)::date as mes, count(*)::int as n
    from public.cliente_excursoes e
    where e.coletado_em is not null and e.data_viagem is not null
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
  where public.auth_is_adm_master()
  order by m.loja, m.mes;
$$;

revoke all on function public.base_cobertura_meses() from public, anon;
grant execute on function public.base_cobertura_meses() to authenticated, service_role;

-- Resumo por loja: faixa de saídas, reservas coletadas e última coleta.
create or replace function public.base_cobertura_resumo()
returns table (loja filial_cvc, saida_de date, saida_ate date, reservas integer, ultima_coleta timestamptz)
language sql
stable
security definer
set search_path = public
as $$
  select j.loja, min(j.de), max(j.ate),
    (select count(*)::int from public.cliente_excursoes e where e.loja = j.loja and e.coletado_em is not null),
    max(j.coletado_em)
  from public.base_coleta_janelas j
  where public.auth_is_adm_master()
  group by j.loja
  order by j.loja;
$$;

revoke all on function public.base_cobertura_resumo() from public, anon;
grant execute on function public.base_cobertura_resumo() to authenticated, service_role;
