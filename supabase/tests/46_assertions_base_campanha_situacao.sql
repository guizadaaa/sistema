-- ============================================================================
-- Migration 20261127000001: campanhas presas à situação da viagem
-- (Venda adicional = ainda não embarcou; Recompra = já voltou, "não comprou
-- depois de voltar" por cliente) + produto/serviço do "Comprou/Voltou de".
-- ============================================================================

set role postgres;

\ir ../migrations/20261127000001_base_campanha_situacao_produto.sql

create or replace function public._test_assert(p_rotulo text, p_condicao boolean)
returns void
language plpgsql
as $$
begin
  if not coalesce(p_condicao, false) then
    raise exception 'FALHOU: %', p_rotulo;
  end if;
  raise notice 'ok: %', p_rotulo;
end;
$$;

-- Datas relativas a hoje (São Paulo), como a função.
select public.conferencia_base('00000000-0000-0000-0000-000000000004', (
  with h as (select (now() at time zone 'America/Sao_Paulo')::date as d)
  select jsonb_build_object(
    'loja', '1714',
    'janela', jsonb_build_object('de', '2020-01-01', 'ate', '2030-12-31'),
    'reservas', jsonb_agg(jsonb_build_object(
      'reserva', r, 'vendedor_systur', 'Vendedor 46', 'excursao', exc,
      'data_confirmacao', h.d + conf, 'data_viagem', h.d + ida, 'data_retorno', h.d + volta,
      'destino', jsonb_build_object('cidade', dest), 'tipos_servico', to_jsonb(tipos),
      'contratantes', jsonb_build_array(jsonb_build_object('pessoa_id', pid, 'nome', nome, 'valor', 1000))
    ))
  )
  from h, (values
    -- Venda adicional
    ('R46-A1', '9.1.1', -30, 0, 5, 'ORLANDO', array['aereo'], '46001', 'Ana Embarca Hoje 46'),
    ('R46-A2', '9.1.2', -30, -1, 4, 'ORLANDO', array['aereo'], '46002', 'Bia Embarcou Ontem 46'),
    ('R46-A3', '9.1.3', -30, 1, 8, 'ORLANDO', array['aereo'], '46003', 'Caio Embarca Amanha 46'),
    ('R46-A4', '4.00018321.1', -10, 20, 27, 'FORTALEZA', array['aereo', 'hotel', 'passeio', 'transfer'], '46004', 'Dani Pacote 46'),
    -- Recompra
    ('R46-R1', '9.2.1', -60, -3, 2, 'ORLANDO', array['aereo'], '46005', 'Eva Ainda Viajando 46'),
    ('R46-R2', '9.2.2', -100, -40, -30, 'ORLANDO', array['aereo'], '46006', 'Fabi Voltou E Comprou 46'),
    ('R46-R2B', '9.2.3', -20, 60, 70, 'ORLANDO', array['aereo'], '46006', 'Fabi Voltou E Comprou 46'),
    ('R46-R3', '9.2.4', -120, -60, -50, 'ORLANDO', array['aereo'], '46007', 'Gil Voltou Antes 46'),
    ('R46-R3B', '9.2.5', -30, 90, 95, 'NATAL', array['hotel'], '46007', 'Gil Voltou Antes 46'),
    ('R46-R4', '9.2.6', -40, -20, -10, 'ORLANDO', array['aereo'], '46008', 'Hugo Voltou Depois 46'),
    ('R46-R4B', '9.2.7', -30, 100, 105, 'NATAL', array['hotel'], '46008', 'Hugo Voltou Depois 46'),
    ('R46-R5', '8.2.8', -300, -200, -190, 'CARIBE', array['cruzeiro'], '46009', 'Ivo Parado 46')
  ) v (r, exc, conf, ida, volta, dest, tipos, pid, nome)
));

create or replace function pg_temp.nomes(p_filtros jsonb)
returns text[]
language sql
as $$
  select coalesce(array_agg(nome order by nome) filter (where nome like '% 46'), '{}')
  from public.base_clientes_buscar(p_filtros || '{"loja":"1714"}', 1000, 0)
$$;

set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000004';
set role authenticated;

create temp table _r46 (caso text, nomes text[]);
insert into _r46
select caso, pg_temp.nomes(filtros::jsonb) from (values
  ('adicional vazia', '{"camp":"adicional"}'),
  ('adicional pacote com passeio', '{"camp":"adicional","produto":"4","servico":"passeio","ca_sem_tipo":"ingresso"}'),
  ('adicional pacote com ingresso', '{"camp":"adicional","produto":"4","servico":"ingresso","ca_sem_tipo":"seguro"}'),
  ('adicional internacional', '{"camp":"adicional","produto":"9","ca_sem_tipo":"seguro"}'),
  ('adicional ca_tipo antigo', '{"camp":"adicional","ca_tipo":"transfer","ca_sem_tipo":"seguro"}'),
  ('adicional embarque passado', '{"camp":"adicional","ca_de":"2020-01-01","ca_ate":"2030-12-31","ca_sem_tipo":"seguro"}'),
  ('recompra vazia', '{"camp":"recompra"}'),
  ('recompra mesmo destino', '{"camp":"recompra","cr_sem":"nada","cr_mesmo_destino":"1"}'),
  ('recompra sem hotel', '{"camp":"recompra","cr_sem":"hotel"}'),
  ('recompra retorno recente', '{"camp":"recompra","cr_sem":"nada","cr_a_de":"' || ((now() at time zone 'America/Sao_Paulo')::date - 15) || '","cr_a_ate":"' || ((now() at time zone 'America/Sao_Paulo')::date - 1) || '"}'),
  ('recompra cruzeiro', '{"camp":"recompra","produto":"8","servico":"cruzeiro","cr_sem":"nada"}'),
  ('recompra 2º período antigo ignorado', '{"camp":"recompra","cr_sem":"nada","cr_b_de":"2020-01-01","cr_b_ate":"2020-01-02"}')
) t (caso, filtros);
reset role;
reset request.jwt.claim.sub;

create or replace function pg_temp.r(p_caso text) returns text[] language sql as $$ select nomes from _r46 where caso = p_caso $$;

select public._test_assert('Venda adicional: embarque hoje ou ontem não aparece; amanhã aparece; frase vazia = só viagens futuras',
  pg_temp.r('adicional vazia') = '{"Caio Embarca Amanha 46","Dani Pacote 46","Fabi Voltou E Comprou 46","Gil Voltou Antes 46","Hugo Voltou Depois 46"}');
select public._test_assert('Venda adicional: nem com período de embarque no passado entra quem já embarcou',
  not pg_temp.r('adicional embarque passado') && '{"Ana Embarca Hoje 46","Bia Embarcou Ontem 46","Eva Ainda Viajando 46","Ivo Parado 46"}');
select public._test_assert('produto + serviço: "Pacote exclusivo" que inclui passeio',
  pg_temp.r('adicional pacote com passeio') = '{"Dani Pacote 46"}'
  and pg_temp.r('adicional pacote com ingresso') = '{}'
  and not pg_temp.r('adicional internacional') @> '{"Dani Pacote 46"}'
  and pg_temp.r('adicional internacional') @> '{"Caio Embarca Amanha 46"}');
select public._test_assert('ca_tipo antigo = serviço (sinônimo aceito)', pg_temp.r('adicional ca_tipo antigo') = '{"Dani Pacote 46"}');
select public._test_assert('Recompra: viagem que ainda não voltou não aparece; frase vazia = só clientes parados',
  pg_temp.r('recompra vazia') = '{"Hugo Voltou Depois 46","Ivo Parado 46"}');
select public._test_assert('"não comprou depois de voltar" por cliente: compra no mesmo dia (há 30 dias) tira Gil (voltou antes) e não tira Hugo (voltou depois)',
  pg_temp.r('recompra vazia') @> '{"Hugo Voltou Depois 46"}' and not pg_temp.r('recompra vazia') @> '{"Gil Voltou Antes 46"}');
select public._test_assert('Recompra para o mesmo destino: Gil (comprou Natal) volta; Fabi (comprou Orlando de novo) não',
  pg_temp.r('recompra mesmo destino') @> '{"Gil Voltou Antes 46","Hugo Voltou Depois 46","Ivo Parado 46"}'
  and not pg_temp.r('recompra mesmo destino') @> '{"Fabi Voltou E Comprou 46"}');
select public._test_assert('Recompra "não comprou hotel": Fabi (comprou aéreo depois) aparece; Gil (comprou hotel) não',
  pg_temp.r('recompra sem hotel') @> '{"Fabi Voltou E Comprou 46"}' and not pg_temp.r('recompra sem hotel') @> '{"Gil Voltou Antes 46"}');
select public._test_assert('1º período = data de RETORNO (últimos 15 dias: só Hugo)', pg_temp.r('recompra retorno recente') = '{"Hugo Voltou Depois 46"}');
select public._test_assert('Voltou de Cruzeiro (produto 8 + serviço cruzeiro)', pg_temp.r('recompra cruzeiro') = '{"Ivo Parado 46"}');
select public._test_assert('2º período antigo (cr_b_*) é ignorado', pg_temp.r('recompra 2º período antigo ignorado') = pg_temp.r('recompra vazia'));

set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000004';
set role authenticated;
select public._test_assert('produtos do cliente e da compra vêm na busca',
  (select produtos = '{4}' and compra_produto = 4 from public.base_clientes_buscar('{"camp":"adicional","loja":"1714"}', 1000, 0) where nome = 'Dani Pacote 46'));
reset role;
reset request.jwt.claim.sub;

\ir ../migrations/20261127000001_base_campanha_situacao_produto.sql
select public._test_assert('reaplicar a migration é idempotente; categoria repetida na compra',
  not exists (select 1 from public.cliente_compras c join public.cliente_excursoes e on e.reserva = c.reserva
              where c.categoria_codigo is distinct from e.categoria_codigo));

-- Mudou a categoria da reserva: a compra acompanha.
update public.cliente_excursoes set categoria_codigo = 5 where reserva = 'R46-A3';
select public._test_assert('gatilho: categoria da reserva propaga para a compra',
  (select bool_and(categoria_codigo = 5) from public.cliente_compras where reserva = 'R46-A3'));

drop function public._test_assert(text, boolean);

select 'todos os asserts das campanhas por situação da viagem passaram' as status;
