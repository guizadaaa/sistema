-- ============================================================================
-- Teste de regressão para casos.contrato_origem (migration
-- 20261006000007_casos_contrato_origem.sql).
--
-- Cobre:
--   1. Aceito (opcional) em cancelamento e inadimplência; NULL em qualquer tipo.
--   2. Constraints: 14 dígitos; recusado em tipos que não são cancelamento.
--   3. Casos antigos (sem o campo) continuam editáveis (prazo pelo dono).
--   4. Não-admin não altera contrato_origem depois de criado; admin altera.
--   5. RLS do caso: quem não enxerga o caso não acha o caso pelo contrato
--      de origem; quem enxerga, acha.
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

-- Gerente 1710 abre um Cancelamento para o Vendedor A, com contrato de origem.
set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000003';
set role authenticated;
insert into public.casos (id, tipo_caso, motivo, descricao, vendedor_dono, criado_por, prazo_vigencia, contrato_numero, cliente_nome, cliente_cpf, contrato_origem)
values ('25000000-0000-0000-0000-00000000000a', 'cancelamento', 'pedido_cliente', 'cancelamento com origem',
  '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000003', '2026-12-31', '17100000000251', 'Cliente Cancela', '11144477735',
  '17100000000250');
reset role;
reset request.jwt.claim.sub;

set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000001';
set role authenticated;

-- Inadimplência com contrato de origem, e sem (opcional).
insert into public.casos (id, tipo_caso, vendedor_dono, criado_por, prazo_vigencia, contrato_numero, cliente_nome, cliente_cpf, parcelas_em_aberto, data_cancelamento, contrato_origem)
values ('25000000-0000-0000-0000-00000000000b', 'inadimplencia',
  '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', '2026-12-31', '17100000000252', 'Cliente Inadimplente', '11144477735', 2, '2026-10-01',
  '17100000000259');
insert into public.casos (id, tipo_caso, vendedor_dono, criado_por, prazo_vigencia, contrato_numero, cliente_nome, cliente_cpf, parcelas_em_aberto, data_cancelamento)
values ('25000000-0000-0000-0000-00000000000c', 'inadimplencia',
  '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', '2026-12-31', '17100000000253', 'Cliente Sem Origem', '11144477735', 1, '2026-10-01');

select public._test_assert(
  'cancelamento e inadimplência aceitam contrato de origem; ele é opcional',
  (select count(*) = 3 from public.casos where id::text like '25000000-%')
  and (select contrato_origem is null from public.casos where id = '25000000-0000-0000-0000-00000000000c')
);

\set ON_ERROR_STOP 0
insert into public.casos (tipo_caso, vendedor_dono, criado_por, prazo_vigencia, contrato_numero, cliente_nome, cliente_cpf, parcelas_em_aberto, data_cancelamento, contrato_origem)
values ('inadimplencia', '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', '2026-12-31', '17100000000254', 'X', '11144477735', 1, '2026-10-01', '123');
\set ON_ERROR_STOP 1
select public._test_assert('constraint: contrato de origem fora dos 14 dígitos é recusado', :'ERROR' = 'true');

\set ON_ERROR_STOP 0
insert into public.casos (tipo_caso, motivo, descricao, vendedor_dono, criado_por, prazo_vigencia, contrato_numero, cliente_nome, cliente_cpf, contrato_origem)
values ('alteracao_data', 'pedido_cliente', 'x', '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', '2026-12-31', '17100000000255', 'X', '11144477735', '17100000000256');
\set ON_ERROR_STOP 1
select public._test_assert('constraint: contrato de origem em Alteração de data é recusado', :'ERROR' = 'true');

\set ON_ERROR_STOP 0
insert into public.casos (tipo_caso, descricao, vendedor_dono, criado_por, prazo_vigencia, contrato_numero, cliente_nome, cliente_cpf, contrato_origem)
values ('recadastro_sem_reserva', 'x', '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', '2026-12-31', '17100000000257', 'X', '11144477735', '17100000000258');
\set ON_ERROR_STOP 1
select public._test_assert('constraint: contrato de origem em Recadastro é recusado', :'ERROR' = 'true');

-- Caso antigo (seed, sem contrato de origem) segue editável pelo dono.
update public.casos set prazo_vigencia = '2027-02-28' where id = '10000000-0000-0000-0000-000000000001';
select public._test_assert(
  'caso antigo sem o campo: dono continua editando o prazo',
  (select prazo_vigencia = '2027-02-28' from public.casos where id = '10000000-0000-0000-0000-000000000001')
);

-- Dono não altera contrato_origem depois de criado.
\set ON_ERROR_STOP 0
update public.casos set contrato_origem = '17100000000299' where id = '25000000-0000-0000-0000-00000000000b';
\set ON_ERROR_STOP 1
select public._test_assert('vendedor dono: NAO altera contrato de origem depois de criado', :'ERROR' = 'true');

-- Busca: o dono acha o caso pelo contrato de origem.
select public._test_assert(
  'dono: acha o caso pelo contrato de origem',
  (select count(*) = 1 from public.casos where contrato_origem like '%00000000259%')
);

reset role;
reset request.jwt.claim.sub;

-- Admin altera.
set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000006';
set role authenticated;
update public.casos set contrato_origem = '17100000000299' where id = '25000000-0000-0000-0000-00000000000b';
select public._test_assert(
  'adm: altera contrato de origem',
  (select contrato_origem = '17100000000299' from public.casos where id = '25000000-0000-0000-0000-00000000000b')
);
reset role;
reset request.jwt.claim.sub;

-- Quem não enxerga o caso não o encontra pelo contrato de origem.
set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000002';
set role authenticated;
select public._test_assert(
  'colega da mesma filial: NAO acha o caso pelo contrato de origem',
  (select count(*) = 0 from public.casos where contrato_origem in ('17100000000250', '17100000000299'))
);
reset role;
reset request.jwt.claim.sub;

set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000005';
set role authenticated;
select public._test_assert(
  'gerente de outra filial: NAO acha o caso pelo contrato de origem',
  (select count(*) = 0 from public.casos where contrato_origem is not null)
);
reset role;
reset request.jwt.claim.sub;

set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000003';
set role authenticated;
select public._test_assert(
  'gerente da filial: acha os casos pelo contrato de origem',
  (select count(*) = 2 from public.casos where contrato_origem in ('17100000000250', '17100000000299'))
);
reset role;
reset request.jwt.claim.sub;

-- Idempotência.
\ir ../migrations/20261006000007_casos_contrato_origem.sql
select public._test_assert(
  'migration reaplicada: constraints não duplicadas e dados preservados',
  (select count(*) = 1 from pg_constraint where conname = 'casos_contrato_origem_formato')
  and (select contrato_origem = '17100000000250' from public.casos where id = '25000000-0000-0000-0000-00000000000a')
);

select 'todos os asserts de contrato_origem passaram' as status;

set role postgres;
drop function public._test_assert(text, boolean);
reset role;
