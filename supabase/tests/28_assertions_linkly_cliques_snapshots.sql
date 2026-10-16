-- ============================================================================
-- Teste de regressão para o histórico diário de cliques do Linkly
-- (migration 20261006000010_linkly_cliques_snapshots.sql).
--
-- Cobre:
--   1. Trigger: gravar linkly_cliques_totais grava o snapshot do dia, com a
--      data em America/Sao_Paulo (01:30 UTC do dia 1 ainda é o dia anterior).
--   2. RLS: authenticated não lê linkly_cliques_snapshots direto.
--   3. Virada de mês: setembro e outubro de um mesmo link somam o total certo.
--   4. Reatribuição no meio do mês: cada vendedor recebe só o seu trecho.
--   5. Mês sem snapshot anterior: base parcial, com a data de início do registro.
--   6. Total que diminui no Linkly: 0, nunca negativo.
--   7. Visibilidade: vendedor só os próprios; gerente a filial; adm tudo;
--      vitrine só admin/gerente da loja.
--   8. Meses disponíveis e última sincronização; idempotência.
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
  ('00000000-0000-0000-0000-000000000017', 'vendedorC1714@teste.com', '{"nome_completo":"Vendedor C 1714","perfil":"vendedor","filial":"1714"}'),
  ('00000000-0000-0000-0000-000000000006', 'adm@teste.com', '{"nome_completo":"Adm","perfil":"adm"}')
on conflict (id) do nothing;

-- Links: L1 (1710, vendedor), L2 (1714, vendedor), L3 (1710, vendedor), V (1710, vitrine).
set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000004';
set role authenticated;
insert into public.linkly_links (id, workspace_secret, linkly_link_id, short_url, tipo, filial) values
  ('28000000-0000-0000-0000-0000000000a1', 'linkly_api_key_1710', 'snap-l1', 'https://linkly.link/snapl1', 'vendedor', '1710'),
  ('28000000-0000-0000-0000-0000000000a2', 'linkly_api_key_1714', 'snap-l2', 'https://linkly.link/snapl2', 'vendedor', '1714'),
  ('28000000-0000-0000-0000-0000000000a3', 'linkly_api_key_1710', 'snap-l3', 'https://linkly.link/snapl3', 'vendedor', '1710'),
  ('28000000-0000-0000-0000-0000000000a4', 'linkly_api_key_vitrine', 'snap-v', 'https://linkly.link/snapv', 'vitrine', '1710');
reset role;
reset request.jwt.claim.sub;

set role postgres;

-- 1. Trigger: total gravado às 01:30 UTC de 01/10 => snapshot de 30/09 (São Paulo).
insert into public.linkly_cliques_totais (link_id, total_cliques, atualizado_em)
values ('28000000-0000-0000-0000-0000000000a1', 200, '2026-10-01 01:30:00+00');

select public._test_assert(
  'trigger: snapshot criado com a data de São Paulo (30/09)',
  (select total = 200 from public.linkly_cliques_snapshots
   where link_id = '28000000-0000-0000-0000-0000000000a1' and data = '2026-09-30')
);

update public.linkly_cliques_totais set total_cliques = 300, atualizado_em = '2026-10-20 15:00:00+00'
where link_id = '28000000-0000-0000-0000-0000000000a1';
update public.linkly_cliques_totais set total_cliques = 305, atualizado_em = '2026-10-20 18:00:00+00'
where link_id = '28000000-0000-0000-0000-0000000000a1';
update public.linkly_cliques_totais set total_cliques = 300, atualizado_em = '2026-10-20 19:00:00+00'
where link_id = '28000000-0000-0000-0000-0000000000a1';

select public._test_assert(
  'trigger: várias sincronizações no mesmo dia atualizam o MESMO snapshot (último valor)',
  (select count(*) = 1 and max(total) = 300 from public.linkly_cliques_snapshots
   where link_id = '28000000-0000-0000-0000-0000000000a1' and data = '2026-10-20')
);

-- Demais snapshots direto na tabela (histórico controlado).
insert into public.linkly_cliques_snapshots (link_id, data, total) values
  ('28000000-0000-0000-0000-0000000000a1', '2026-08-31', 100),
  ('28000000-0000-0000-0000-0000000000a1', '2026-09-15', 150),
  ('28000000-0000-0000-0000-0000000000a1', '2026-10-10', 260),
  -- L2: só existe registro a partir de 14/10.
  ('28000000-0000-0000-0000-0000000000a2', '2026-10-14', 500),
  ('28000000-0000-0000-0000-0000000000a2', '2026-10-20', 530),
  -- L3: Linkly reduziu o total.
  ('28000000-0000-0000-0000-0000000000a3', '2026-09-30', 100),
  ('28000000-0000-0000-0000-0000000000a3', '2026-10-20', 90),
  -- Vitrine.
  ('28000000-0000-0000-0000-0000000000a4', '2026-09-30', 1000),
  ('28000000-0000-0000-0000-0000000000a4', '2026-10-20', 1080)
on conflict (link_id, data) do update set total = excluded.total;

-- Vínculos: L1 = Vendedor A até 09/10, Vendedor B a partir de 10/10 (total 260
-- na troca). L2 = Vendedor C desde setembro. L3 = Vendedor A.
insert into public.linkly_vendedor_mapeamento (link_id, usuario_id, cliques_totais_no_inicio, vigente_desde, vigente_ate, criado_por) values
  ('28000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-000000000001', 50, '2026-08-01', '2026-10-09', '00000000-0000-0000-0000-000000000004'),
  ('28000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-000000000002', 260, '2026-10-10', null, '00000000-0000-0000-0000-000000000004'),
  ('28000000-0000-0000-0000-0000000000a2', '00000000-0000-0000-0000-000000000017', 0, '2026-09-01', null, '00000000-0000-0000-0000-000000000004'),
  ('28000000-0000-0000-0000-0000000000a3', '00000000-0000-0000-0000-000000000001', 0, '2026-09-01', null, '00000000-0000-0000-0000-000000000004');

-- ----------------------------------------------------------------------------
-- Cálculos como admin (vê tudo).
-- ----------------------------------------------------------------------------

select max(atualizado_em) as ultima_esperada from public.linkly_cliques_totais \gset

set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000006';
set role authenticated;

create temp table _set as select * from public.linkly_cliques_mes('2026-09-10');
create temp table _out as select * from public.linkly_cliques_mes('2026-10-25');

select public._test_assert(
  'setembro, L1 (Vendedor A): 200 - 100 (snapshot de 31/08) = 100',
  (select cliques = 100 and not base_parcial from _set
   where link_id = '28000000-0000-0000-0000-0000000000a1' and usuario_id = '00000000-0000-0000-0000-000000000001')
);

select public._test_assert(
  'outubro, L1 (Vendedor A até 09/10): 260 (troca) - 200 (30/09) = 60',
  (select cliques = 60 and inicio = '2026-10-01' and fim = '2026-10-09' from _out
   where link_id = '28000000-0000-0000-0000-0000000000a1' and usuario_id = '00000000-0000-0000-0000-000000000001')
);

select public._test_assert(
  'outubro, L1 (Vendedor B desde 10/10): 300 - 260 (atribuição) = 40',
  (select cliques = 40 and inicio = '2026-10-10' from _out
   where link_id = '28000000-0000-0000-0000-0000000000a1' and usuario_id = '00000000-0000-0000-0000-000000000002')
);

select public._test_assert(
  'virada de mês: A + B em outubro = total do link no mês (300 - 200), sem contar setembro de novo',
  (select sum(cliques) = 100 from _out where link_id = '28000000-0000-0000-0000-0000000000a1')
);

select public._test_assert(
  'outubro, L2 sem snapshot anterior: base parcial a partir de 14/10 (530 - 500 = 30)',
  (select cliques = 30 and base_parcial and contagem_desde = '2026-10-14' from _out
   where link_id = '28000000-0000-0000-0000-0000000000a2')
);

select public._test_assert(
  'outubro, L3 com total reduzido no Linkly (100 -> 90): 0, nunca negativo',
  (select cliques = 0 from _out where link_id = '28000000-0000-0000-0000-0000000000a3')
);

select public._test_assert(
  'novembro sem nenhum snapshot no mês: vínculos aparecem com 0 (base = fim = último total)',
  (select coalesce(sum(cliques), 0) = 0 from public.linkly_cliques_mes('2026-11-01'))
);

select public._test_assert(
  'agosto: L1 só tem o snapshot de 31/08 — base parcial a partir de 31/08, 0 cliques',
  (select cliques = 0 and base_parcial and contagem_desde = '2026-08-31' from public.linkly_cliques_mes('2026-08-01')
   where link_id = '28000000-0000-0000-0000-0000000000a1')
);

select public._test_assert(
  'vitrine (adm): outubro = 1080 - 1000 = 80',
  (select cliques = 80 from public.linkly_cliques_vitrine_mes('2026-10-01') where link_id = '28000000-0000-0000-0000-0000000000a4')
);

select public._test_assert(
  'meses com registro inclui ago, set e out/2026',
  (select count(*) = 3 from public.linkly_meses_com_registro() where mes in ('2026-08-01', '2026-09-01', '2026-10-01'))
);

select public._test_assert(
  'última sincronização = maior atualizado_em de linkly_cliques_totais',
  public.linkly_ultima_sincronizacao() = :'ultima_esperada'::timestamptz
);

reset role;
reset request.jwt.claim.sub;

-- ----------------------------------------------------------------------------
-- Visibilidade.
-- ----------------------------------------------------------------------------

-- Vendedor A: só as próprias linhas (L1 até 09/10 e L3).
set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000001';
set role authenticated;
select public._test_assert(
  'vendedor A: só vê os próprios vínculos (nunca o do Vendedor B no mesmo link)',
  (select bool_and(usuario_id = '00000000-0000-0000-0000-000000000001') and count(*) = 2
   from public.linkly_cliques_mes('2026-10-01') where link_id::text like '28000000-%')
);
select public._test_assert(
  'vendedor A: o próprio trecho continua certo mesmo sem ver o vínculo seguinte (60)',
  (select cliques = 60 from public.linkly_cliques_mes('2026-10-01') where link_id = '28000000-0000-0000-0000-0000000000a1')
);
select public._test_assert('vendedor: NAO vê vitrine', (select count(*) = 0 from public.linkly_cliques_vitrine_mes('2026-10-01')));
\set ON_ERROR_STOP 0
select count(*) from public.linkly_cliques_snapshots;
\set ON_ERROR_STOP 1
select public._test_assert('authenticated: NAO lê linkly_cliques_snapshots direto', :'ERROR' = 'true');
reset role;
reset request.jwt.claim.sub;

-- Vendedor B: só o próprio trecho de L1.
set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000002';
set role authenticated;
select public._test_assert(
  'vendedor B: só o próprio trecho (40)',
  (select count(*) = 1 and sum(cliques) = 40 from public.linkly_cliques_mes('2026-10-01') where link_id::text like '28000000-%')
);
reset role;
reset request.jwt.claim.sub;

-- Gerente 1710: L1 e L3 (filial), nunca L2 (1714); vitrine da própria loja.
set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000003';
set role authenticated;
select public._test_assert(
  'gerente 1710: vê os vínculos da filial (3 em outubro), nenhum da 1714',
  (select count(*) = 3 and bool_and(filial = '1710') from public.linkly_cliques_mes('2026-10-01') where link_id::text like '28000000-%')
);
select public._test_assert(
  'gerente 1710: vê a vitrine da própria loja',
  (select count(*) = 1 from public.linkly_cliques_vitrine_mes('2026-10-01') where link_id = '28000000-0000-0000-0000-0000000000a4')
);
reset role;
reset request.jwt.claim.sub;

-- Gerente 1714: só L2; não vê a vitrine da 1710.
set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000005';
set role authenticated;
select public._test_assert(
  'gerente 1714: só L2',
  (select count(*) = 1 and bool_and(link_id = '28000000-0000-0000-0000-0000000000a2')
   from public.linkly_cliques_mes('2026-10-01') where link_id::text like '28000000-%')
);
select public._test_assert(
  'gerente 1714: NAO vê a vitrine da 1710',
  (select count(*) = 0 from public.linkly_cliques_vitrine_mes('2026-10-01') where link_id = '28000000-0000-0000-0000-0000000000a4')
);
reset role;
reset request.jwt.claim.sub;

-- ----------------------------------------------------------------------------
-- Virada de mês com sincronização de hora em hora (link de vitrine V2,
-- nov -> dez/2026). O snapshot de um dia guarda o ÚLTIMO total do dia; a
-- base de dezembro é o snapshot de 30/11 (sync das 23h). Os cliques entre
-- 23h e 00h de 30/11 contam em dezembro: erro de até ~1 h na virada. Se a
-- base fosse o primeiro snapshot de 01/12, ele guardaria o total do FIM do
-- dia 1 (sync das 23h de 01/12) e o dia 1 inteiro sumiria de dezembro.
-- ----------------------------------------------------------------------------

set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000004';
set role authenticated;
insert into public.linkly_links (id, workspace_secret, linkly_link_id, short_url, tipo, filial) values
  ('28000000-0000-0000-0000-0000000000a5', 'linkly_api_key_vitrine', 'snap-v2', 'https://linkly.link/snapv2', 'vitrine', '1714');
reset role;
reset request.jwt.claim.sub;

set role postgres;
insert into public.linkly_cliques_totais (link_id, total_cliques, atualizado_em)
values ('28000000-0000-0000-0000-0000000000a5', 100, timestamp '2026-11-30 20:00' at time zone 'America/Sao_Paulo');
update public.linkly_cliques_totais set total_cliques = 130, atualizado_em = timestamp '2026-11-30 23:00' at time zone 'America/Sao_Paulo'
where link_id = '28000000-0000-0000-0000-0000000000a5';
update public.linkly_cliques_totais set total_cliques = 135, atualizado_em = timestamp '2026-12-01 00:00' at time zone 'America/Sao_Paulo'
where link_id = '28000000-0000-0000-0000-0000000000a5';
update public.linkly_cliques_totais set total_cliques = 200, atualizado_em = timestamp '2026-12-01 23:00' at time zone 'America/Sao_Paulo'
where link_id = '28000000-0000-0000-0000-0000000000a5';

select public._test_assert(
  'virada: snapshot de 30/11 guarda o total da última sync do dia (23h = 130); o de 01/12, o da última de 01/12 (200)',
  (select total = 130 from public.linkly_cliques_snapshots where link_id = '28000000-0000-0000-0000-0000000000a5' and data = '2026-11-30')
  and (select total = 200 from public.linkly_cliques_snapshots where link_id = '28000000-0000-0000-0000-0000000000a5' and data = '2026-12-01')
);

set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000006';
set role authenticated;
select public._test_assert(
  'virada: dezembro conta a partir da última sync de 30/11 (200 - 130 = 70, inclui o dia 1 inteiro), não parcial',
  (select cliques = 70 and not base_parcial from public.linkly_cliques_vitrine_mes('2026-12-01')
   where link_id = '28000000-0000-0000-0000-0000000000a5')
);
reset role;
reset request.jwt.claim.sub;

-- anon não executa as funções.
select public._test_assert('anon NAO executa linkly_cliques_mes', not has_function_privilege('anon', 'public.linkly_cliques_mes(date)', 'execute'));
select public._test_assert('authenticated NAO executa a função interna', not has_function_privilege('authenticated', 'public._linkly_links_no_mes(date)', 'execute'));

-- Idempotência.
\ir ../migrations/20261006000010_linkly_cliques_snapshots.sql
-- Reaplicar uma migration antiga recria as funções na versão DELA; reaplica
-- também as posteriores que redefinem os mesmos objetos, para os arquivos
-- de teste seguintes rodarem contra o schema atual.
\ir ../migrations/20261006000011_linkly_base_mes_manual.sql
select public._test_assert(
  'migration reaplicada: snapshots preservados e trigger única',
  (select total = 300 from public.linkly_cliques_snapshots where link_id = '28000000-0000-0000-0000-0000000000a1' and data = '2026-10-20')
  and (select count(*) = 1 from pg_trigger where tgname = 'linkly_cliques_totais_snapshot')
);

select 'todos os asserts de linkly_cliques_snapshots passaram' as status;

set role postgres;
drop function public._test_assert(text, boolean);
reset role;
