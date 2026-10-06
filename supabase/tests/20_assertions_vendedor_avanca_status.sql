-- ============================================================================
-- Teste de regressão para "vendedor também avança status" (migration
-- 20261006000002_vendedor_avanca_status.sql).
--
-- Cobre:
--   1. Vendedor avança o status do PRÓPRIO caso; histórico e auditoria
--      registram o vendedor como autor, sem "via delegação".
--   2. Vendedor NÃO avança caso de colega da mesma filial nem de outra
--      filial (RLS de status_historico).
--   3. Vendedor NÃO consegue Ouvidoria e NÃO marca Resolvido sem comentário.
--   4. Vendedor NÃO troca status_atual com UPDATE direto em casos (sem
--      passar pelo histórico), mas continua editando o prazo_vigencia.
--   5. Vendedor NÃO registra desfecho (escopo é só status).
--   6. Sem regressão: gerente com delegação avança (via_delegacao=true),
--      gerente sem delegação não avança, admin avança.
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

-- Delegação ativa para o gerente 1710 — só cria se 04_* não deixou uma vigente
-- (validate_delegacao recusa sobreposição).
insert into public.delegacoes (adm_id, gerente_id, inicio, fim, ativa)
select '00000000-0000-0000-0000-000000000004', '00000000-0000-0000-0000-000000000003', now() - interval '1 day', now() + interval '10 days', true
where not exists (
  select 1 from public.delegacoes
  where gerente_id = '00000000-0000-0000-0000-000000000003' and ativa and now() >= inicio and (fim is null or now() <= fim)
);

select public._test_assert(
  'pré-condição: gerente 1710 tem delegação ativa',
  exists (
    select 1 from public.delegacoes
    where gerente_id = '00000000-0000-0000-0000-000000000003' and ativa and now() >= inicio and (fim is null or now() <= fim)
  )
);

select public._test_assert(
  'pré-condição: gerente 1714 não tem delegação ativa',
  not exists (
    select 1 from public.delegacoes
    where gerente_id = '00000000-0000-0000-0000-000000000005' and ativa and now() >= inicio and (fim is null or now() <= fim)
  )
);

-- Casos: A (vendedor A, 1710), B (vendedor B, 1710), C (vendedor C, 1714).
set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000001';
set role authenticated;
insert into public.casos (id, tipo_caso, motivo, descricao, vendedor_dono, criado_por, prazo_vigencia, contrato_numero, cliente_nome, cliente_cpf)
values ('20000000-0000-0000-0000-00000000000a', 'alteracao_data', 'pedido_cliente', 'caso do vendedor A',
  '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', '2026-12-31', '17100000000201', 'Cliente A', '11144477735');
reset role;
reset request.jwt.claim.sub;

set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000002';
set role authenticated;
insert into public.casos (id, tipo_caso, motivo, descricao, vendedor_dono, criado_por, prazo_vigencia, contrato_numero, cliente_nome, cliente_cpf)
values ('20000000-0000-0000-0000-00000000000b', 'alteracao_data', 'pedido_cliente', 'caso do vendedor B',
  '00000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000002', '2026-12-31', '17100000000202', 'Cliente B', '11144477735');
reset role;
reset request.jwt.claim.sub;

set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000017';
set role authenticated;
insert into public.casos (id, tipo_caso, motivo, descricao, vendedor_dono, criado_por, prazo_vigencia, contrato_numero, cliente_nome, cliente_cpf)
values ('20000000-0000-0000-0000-00000000000c', 'alteracao_data', 'pedido_cliente', 'caso do vendedor C',
  '00000000-0000-0000-0000-000000000017', '00000000-0000-0000-0000-000000000017', '2026-12-31', '17140000000203', 'Cliente C', '11144477735');
reset role;
reset request.jwt.claim.sub;

-- ----------------------------------------------------------------------------
-- 1. Vendedor A avança o próprio caso.
-- ----------------------------------------------------------------------------

set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000001';
set role authenticated;

insert into public.status_historico (caso_id, status) values ('20000000-0000-0000-0000-00000000000a', 'recepcionado');
insert into public.status_historico (caso_id, status) values ('20000000-0000-0000-0000-00000000000a', 'em_andamento_interno');

select public._test_assert(
  'vendedor: avança o status do próprio caso',
  (select status_atual = 'em_andamento_interno' from public.casos where id = '20000000-0000-0000-0000-00000000000a')
);

reset role;
reset request.jwt.claim.sub;

select public._test_assert(
  'histórico: vendedor registrado como autor, sem "via delegação"',
  (
    select bool_and(alterado_por = '00000000-0000-0000-0000-000000000001' and not via_delegacao) and count(*) = 2
    from public.status_historico
    where caso_id = '20000000-0000-0000-0000-00000000000a' and status in ('recepcionado', 'em_andamento_interno')
  )
);

select public._test_assert(
  'auditoria: mudança de status_atual registrada com o vendedor como autor',
  exists (
    select 1 from public.auditoria
    where tabela = 'casos' and registro_id = '20000000-0000-0000-0000-00000000000a' and acao = 'update'
      and realizado_por = '00000000-0000-0000-0000-000000000001'
      and dados_novos ->> 'status_atual' = 'em_andamento_interno'
  )
);

-- ----------------------------------------------------------------------------
-- 2 e 3. Negativos do vendedor A.
-- ----------------------------------------------------------------------------

set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000001';
set role authenticated;

\set ON_ERROR_STOP 0
insert into public.status_historico (caso_id, status) values ('20000000-0000-0000-0000-00000000000b', 'recepcionado');
\set ON_ERROR_STOP 1
select public._test_assert('vendedor: NAO avança caso de colega da mesma filial', :'ERROR' = 'true');

\set ON_ERROR_STOP 0
insert into public.status_historico (caso_id, status) values ('20000000-0000-0000-0000-00000000000c', 'recepcionado');
\set ON_ERROR_STOP 1
select public._test_assert('vendedor: NAO avança caso de outra filial', :'ERROR' = 'true');

\set ON_ERROR_STOP 0
insert into public.status_historico (caso_id, status) values ('20000000-0000-0000-0000-00000000000a', 'ouvidoria');
\set ON_ERROR_STOP 1
select public._test_assert('vendedor: NAO move para Ouvidoria (exclusivo admin)', :'ERROR' = 'true');

\set ON_ERROR_STOP 0
insert into public.status_historico (caso_id, status) values ('20000000-0000-0000-0000-00000000000a', 'resolvido');
\set ON_ERROR_STOP 1
select public._test_assert('vendedor: NAO marca Resolvido sem comentário', :'ERROR' = 'true');

-- ----------------------------------------------------------------------------
-- 4. UPDATE direto em casos.status_atual não passa; prazo continua editável.
-- ----------------------------------------------------------------------------

\set ON_ERROR_STOP 0
update public.casos set status_atual = 'resolvido' where id = '20000000-0000-0000-0000-00000000000a';
\set ON_ERROR_STOP 1
select public._test_assert('vendedor: NAO troca status_atual com UPDATE direto (fora do histórico)', :'ERROR' = 'true');

update public.casos set prazo_vigencia = '2027-01-31' where id = '20000000-0000-0000-0000-00000000000a';
select public._test_assert(
  'vendedor: continua editando o prazo_vigencia do próprio caso',
  (select prazo_vigencia = '2027-01-31' from public.casos where id = '20000000-0000-0000-0000-00000000000a')
);

-- Com comentário, Resolvido passa.
insert into public.casos_complementos (caso_id, texto) values ('20000000-0000-0000-0000-00000000000a', 'cliente confirmou a nova data');
insert into public.status_historico (caso_id, status) values ('20000000-0000-0000-0000-00000000000a', 'resolvido');
select public._test_assert(
  'vendedor: com comentário, marca o próprio caso como Resolvido',
  (select status_atual = 'resolvido' from public.casos where id = '20000000-0000-0000-0000-00000000000a')
);

-- ----------------------------------------------------------------------------
-- 5. Desfecho continua fora do alcance do vendedor.
-- ----------------------------------------------------------------------------

\set ON_ERROR_STOP 0
insert into public.desfechos (caso_id, tipo, valor) values ('20000000-0000-0000-0000-00000000000a', 'carta_credito', 100);
\set ON_ERROR_STOP 1
select public._test_assert('vendedor: NAO registra desfecho (escopo é só status)', :'ERROR' = 'true');

reset role;
reset request.jwt.claim.sub;

select public._test_assert(
  'casos de colega e de outra filial continuam em Inicial',
  (select bool_and(status_atual = 'inicial') from public.casos
   where id in ('20000000-0000-0000-0000-00000000000b', '20000000-0000-0000-0000-00000000000c'))
);

-- ----------------------------------------------------------------------------
-- 6. Sem regressão para gerente e admin.
-- ----------------------------------------------------------------------------

set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000003';
set role authenticated;
insert into public.status_historico (caso_id, status) values ('20000000-0000-0000-0000-00000000000b', 'recepcionado');
reset role;
reset request.jwt.claim.sub;

select public._test_assert(
  'gerente 1710 com delegação: avança caso da filial, marcado via delegação',
  (select via_delegacao and alterado_por = '00000000-0000-0000-0000-000000000003'
   from public.status_historico where caso_id = '20000000-0000-0000-0000-00000000000b' and status = 'recepcionado')
  and (select status_atual = 'recepcionado' from public.casos where id = '20000000-0000-0000-0000-00000000000b')
);

-- Desde 20261006000004 o gerente avança na própria filial sem delegação
-- (coberto em 22_*); aqui fica o negativo de outra filial.
set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000005';
set role authenticated;
\set ON_ERROR_STOP 0
insert into public.status_historico (caso_id, status) values ('20000000-0000-0000-0000-00000000000b', 'em_andamento_interno');
\set ON_ERROR_STOP 1
select public._test_assert('gerente 1714: NAO avança caso de outra filial (1710)', :'ERROR' = 'true');
reset role;
reset request.jwt.claim.sub;

set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000006';
set role authenticated;
insert into public.status_historico (caso_id, status) values ('20000000-0000-0000-0000-00000000000c', 'recepcionado');
reset role;
reset request.jwt.claim.sub;

select public._test_assert(
  'adm: avança caso de qualquer filial, sem "via delegação"',
  (select not via_delegacao and alterado_por = '00000000-0000-0000-0000-000000000006'
   from public.status_historico where caso_id = '20000000-0000-0000-0000-00000000000c' and status = 'recepcionado')
);

select 'todos os asserts de vendedor avança status passaram' as status;

set role postgres;
drop function public._test_assert(text, boolean);
reset role;
