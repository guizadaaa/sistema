-- ============================================================================
-- Teste de regressão para a base manual do mês (migration
-- 20261006000011_linkly_base_mes_manual.sql). Datas relativas ao MÊS ATUAL
-- de São Paulo (a função só aceita o mês corrente).
--
-- Cobre:
--   1. Permissões: vendedor, gerente e adm comum NÃO executam; adm_master sim.
--   2. Validações: dia diferente de 1, mês que não é o atual, negativo, maior
--      que o total atual, link sem total, snapshot real na data da base.
--   3. Cálculo do mês com a base aplicada: deixa de ser parcial; link sem
--      base continua parcial.
--   4. Idempotência: reaplicar substitui a base (uma linha só).
--   5. Atribuição de vendedor no meio do mês com a base aplicada.
--   6. Base manual não aparece como mês próprio (seletor) nem vira "mês
--      anterior com 0 cliques"; sincronização não sobrescreve base manual.
-- ============================================================================

set role postgres;

create or replace function public._test_assert(p_rotulo text, p_condicao boolean)
returns void
language plpgsql
as $$
begin
  if not p_condicao then
    raise exception 'FALHOU: %', p_rotulo;
  end if;
  raise notice 'ok: %', p_rotulo;
end;
$$;

insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-000000000006', 'adm@teste.com', '{"nome_completo":"Adm","perfil":"adm"}')
on conflict (id) do nothing;

-- Mês atual (SP), dia anterior a ele e mês anterior.
select date_trunc('month', now() at time zone 'America/Sao_Paulo')::date as d0,
       (date_trunc('month', now() at time zone 'America/Sao_Paulo')::date - 1) as base_data,
       (date_trunc('month', now() at time zone 'America/Sao_Paulo') - interval '1 month')::date as mes_anterior
\gset

-- Links: B1 (com base), B2 (sem base), B3 (já tem snapshot real na data da base), B4 (sem total).
set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000004';
set role authenticated;
insert into public.linkly_links (id, workspace_secret, linkly_link_id, short_url, tipo, filial) values
  ('29000000-0000-0000-0000-0000000000b1', 'linkly_api_key_1710', 'base-b1', 'https://linkly.link/baseb1', 'vendedor', '1710'),
  ('29000000-0000-0000-0000-0000000000b2', 'linkly_api_key_1710', 'base-b2', 'https://linkly.link/baseb2', 'vendedor', '1710'),
  ('29000000-0000-0000-0000-0000000000b3', 'linkly_api_key_1710', 'base-b3', 'https://linkly.link/baseb3', 'vendedor', '1710'),
  ('29000000-0000-0000-0000-0000000000b4', 'linkly_api_key_1710', 'base-b4', 'https://linkly.link/baseb4', 'vendedor', '1710');
reset role;
reset request.jwt.claim.sub;

set role postgres;
-- Totais atuais (sincronizados agora): snapshot 'sync' de hoje.
insert into public.linkly_cliques_totais (link_id, total_cliques, atualizado_em) values
  ('29000000-0000-0000-0000-0000000000b1', 1000, now()),
  ('29000000-0000-0000-0000-0000000000b2', 500, now()),
  ('29000000-0000-0000-0000-0000000000b3', 300, now());
-- B3: snapshot real no último dia do mês anterior.
insert into public.linkly_cliques_snapshots (link_id, data, total) values
  ('29000000-0000-0000-0000-0000000000b3', :'base_data', 250);

-- Vínculos de B1: Vendedor A desde antes do mês até o dia 1; Vendedor B a
-- partir do dia 2, assumindo com 950 no total.
insert into public.linkly_vendedor_mapeamento (link_id, usuario_id, cliques_totais_no_inicio, vigente_desde, vigente_ate, criado_por) values
  ('29000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-000000000001', 0, :'mes_anterior', :'d0', '00000000-0000-0000-0000-000000000004'),
  ('29000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-000000000002', 950, (:'d0'::date + 1), null, '00000000-0000-0000-0000-000000000004'),
  ('29000000-0000-0000-0000-0000000000b2', '00000000-0000-0000-0000-000000000001', 0, :'mes_anterior', null, '00000000-0000-0000-0000-000000000004');

-- ----------------------------------------------------------------------------
-- 1. Permissões negativas.
-- ----------------------------------------------------------------------------

set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000001';
set role authenticated;
\set ON_ERROR_STOP 0
select public.linkly_definir_base_mes('29000000-0000-0000-0000-0000000000b1', :'d0', 100);
\set ON_ERROR_STOP 1
select public._test_assert('vendedor: NAO define base', :'ERROR' = 'true' and :'LAST_ERROR_MESSAGE' like 'Apenas Adm Master%');
reset role;
reset request.jwt.claim.sub;

set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000003';
set role authenticated;
\set ON_ERROR_STOP 0
select public.linkly_definir_base_mes('29000000-0000-0000-0000-0000000000b1', :'d0', 100);
\set ON_ERROR_STOP 1
select public._test_assert('gerente: NAO define base', :'ERROR' = 'true' and :'LAST_ERROR_MESSAGE' like 'Apenas Adm Master%');
reset role;
reset request.jwt.claim.sub;

set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000006';
set role authenticated;
\set ON_ERROR_STOP 0
select public.linkly_definir_base_mes('29000000-0000-0000-0000-0000000000b1', :'d0', 100);
\set ON_ERROR_STOP 1
select public._test_assert('adm comum: NAO define base', :'ERROR' = 'true' and :'LAST_ERROR_MESSAGE' like 'Apenas Adm Master%');
reset role;
reset request.jwt.claim.sub;

select public._test_assert('anon NAO executa', not has_function_privilege('anon', 'public.linkly_definir_base_mes(uuid, date, bigint)', 'execute'));

-- ----------------------------------------------------------------------------
-- 2. Validações (adm_master).
-- ----------------------------------------------------------------------------

set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000004';
set role authenticated;

\set ON_ERROR_STOP 0
select public.linkly_definir_base_mes('29000000-0000-0000-0000-0000000000b1', (:'d0'::date + 1), 100);
\set ON_ERROR_STOP 1
select public._test_assert('recusa mês que não é o dia 1', :'ERROR' = 'true' and :'LAST_ERROR_MESSAGE' like 'O mês deve ser informado pelo dia 1%');

\set ON_ERROR_STOP 0
select public.linkly_definir_base_mes('29000000-0000-0000-0000-0000000000b1', :'mes_anterior', 100);
\set ON_ERROR_STOP 1
select public._test_assert('recusa mês que não é o atual', :'ERROR' = 'true' and :'LAST_ERROR_MESSAGE' like 'A base só pode ser definida para o mês atual%');

\set ON_ERROR_STOP 0
select public.linkly_definir_base_mes('29000000-0000-0000-0000-0000000000b1', :'d0', -1);
\set ON_ERROR_STOP 1
select public._test_assert('recusa cliques negativos', :'ERROR' = 'true' and :'LAST_ERROR_MESSAGE' like '%negativo%');

\set ON_ERROR_STOP 0
select public.linkly_definir_base_mes('29000000-0000-0000-0000-0000000000b1', :'d0', 1001);
\set ON_ERROR_STOP 1
select public._test_assert('recusa cliques maior que o total atual', :'ERROR' = 'true' and :'LAST_ERROR_MESSAGE' like 'Cliques no mês (1001) maior que o total atual do link (1000)%');

\set ON_ERROR_STOP 0
select public.linkly_definir_base_mes('29000000-0000-0000-0000-0000000000b4', :'d0', 1);
\set ON_ERROR_STOP 1
select public._test_assert('recusa link sem total sincronizado', :'ERROR' = 'true' and :'LAST_ERROR_MESSAGE' like '%ainda não tem total sincronizado%');

\set ON_ERROR_STOP 0
select public.linkly_definir_base_mes('29000000-0000-0000-0000-0000000000b3', :'d0', 10);
\set ON_ERROR_STOP 1
select public._test_assert('recusa substituir snapshot real na data da base', :'ERROR' = 'true' and :'LAST_ERROR_MESSAGE' like 'Já existe um snapshot real%');

-- ----------------------------------------------------------------------------
-- 3 e 4. Base aplicada, reaplicada.
-- ----------------------------------------------------------------------------

select public._test_assert(
  'antes da base: B1 é parcial (contagem a partir de hoje)',
  (select bool_and(base_parcial) from public.linkly_cliques_mes(:'d0') where link_id = '29000000-0000-0000-0000-0000000000b1')
);

select public._test_assert('adm_master: define base com 120 cliques no mês (devolve 880)',
  public.linkly_definir_base_mes('29000000-0000-0000-0000-0000000000b1', :'d0', 120) = 880);

select public._test_assert('reaplicar substitui (100 cliques => base 900)',
  public.linkly_definir_base_mes('29000000-0000-0000-0000-0000000000b1', :'d0', 100) = 900);

reset role;
reset request.jwt.claim.sub;

select public._test_assert(
  'idempotente: uma única linha base_manual no último dia do mês anterior, com o valor mais recente',
  (select count(*) = 1 and max(total) = 900 and bool_and(origem = 'base_manual')
   from public.linkly_cliques_snapshots where link_id = '29000000-0000-0000-0000-0000000000b1' and data = :'base_data')
);

set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000004';
set role authenticated;

select public._test_assert(
  'com a base: B1 deixa de ser parcial e o mês soma 1000 - 900 = 100',
  (select bool_and(not base_parcial) and sum(cliques) = 100
   from public.linkly_cliques_mes(:'d0') where link_id = '29000000-0000-0000-0000-0000000000b1')
);

-- 5. Atribuição no meio do mês: A até o dia 1 (900 -> 950), B do dia 2 (950 -> 1000).
select public._test_assert(
  'vendedor A (até o dia 1): 950 - 900 = 50',
  (select cliques = 50 from public.linkly_cliques_mes(:'d0')
   where link_id = '29000000-0000-0000-0000-0000000000b1' and usuario_id = '00000000-0000-0000-0000-000000000001')
);
select public._test_assert(
  'vendedor B (do dia 2): 1000 - 950 = 50',
  (select cliques = 50 and not base_parcial from public.linkly_cliques_mes(:'d0')
   where link_id = '29000000-0000-0000-0000-0000000000b1' and usuario_id = '00000000-0000-0000-0000-000000000002')
);

select public._test_assert(
  'link sem base (B2) continua parcial',
  (select bool_and(base_parcial) from public.linkly_cliques_mes(:'d0') where link_id = '29000000-0000-0000-0000-0000000000b2')
);

-- 6. A base não cria um "mês anterior" com 0 cliques.
select public._test_assert(
  'mês anterior: B1 não aparece só por causa da base manual',
  (select count(*) = 0 from public.linkly_cliques_mes(:'mes_anterior') where link_id = '29000000-0000-0000-0000-0000000000b1')
);

reset role;
reset request.jwt.claim.sub;

-- Sincronização com data igual à da base não a sobrescreve.
set role postgres;
update public.linkly_cliques_totais
set total_cliques = 777, atualizado_em = (:'base_data'::date + time '12:00') at time zone 'America/Sao_Paulo'
where link_id = '29000000-0000-0000-0000-0000000000b1';
select public._test_assert(
  'sincronização não sobrescreve a base manual',
  (select total = 900 and origem = 'base_manual' from public.linkly_cliques_snapshots
   where link_id = '29000000-0000-0000-0000-0000000000b1' and data = :'base_data')
);
update public.linkly_cliques_totais set total_cliques = 1000, atualizado_em = now()
where link_id = '29000000-0000-0000-0000-0000000000b1';

-- Mês que só tem base manual não entra no seletor de meses.
insert into public.linkly_cliques_snapshots (link_id, data, total, origem)
values ('29000000-0000-0000-0000-0000000000b2', '2020-01-31', 1, 'base_manual');
set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000004';
set role authenticated;
select public._test_assert(
  'meses com registro ignoram base manual (jan/2020 só tem base manual)',
  not exists (select 1 from public.linkly_meses_com_registro() where mes = '2020-01-01')
);
reset role;
reset request.jwt.claim.sub;
set role postgres;
delete from public.linkly_cliques_snapshots where link_id = '29000000-0000-0000-0000-0000000000b2' and data = '2020-01-31';

-- Idempotência da migration.
\ir ../migrations/20261006000011_linkly_base_mes_manual.sql
select public._test_assert(
  'migration reaplicada: base preservada e constraint única',
  (select total = 900 from public.linkly_cliques_snapshots where link_id = '29000000-0000-0000-0000-0000000000b1' and data = :'base_data')
  and (select count(*) = 1 from pg_constraint where conname = 'linkly_cliques_snapshots_origem_valida')
);

select 'todos os asserts de linkly_definir_base_mes passaram' as status;

set role postgres;
drop function public._test_assert(text, boolean);
reset role;
