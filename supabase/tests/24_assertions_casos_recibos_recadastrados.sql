-- ============================================================================
-- Teste de regressão para casos_recibos_recadastrados (migration
-- 20261006000006_casos_recibos_recadastrados.sql).
--
-- Cobre:
--   1. Dono do caso de Recadastro registra vários recibos; criado_por vem do
--      banco, nunca do client.
--   2. Constraints: 14 dígitos, sem repetir no caso, só em caso de Recadastro.
--   3. RLS igual à do caso: gerente da filial e admin veem; colega da mesma
--      filial e gerente de outra filial NÃO veem nem inserem.
--   4. Sem UPDATE/DELETE para authenticated.
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

-- Vendedor A: caso de Recadastro (R) e caso de Alteração de data (S).
set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000001';
set role authenticated;

insert into public.casos (id, tipo_caso, descricao, vendedor_dono, criado_por, prazo_vigencia, contrato_numero, cliente_nome, cliente_cpf)
values ('24000000-0000-0000-0000-00000000000a', 'recadastro_sem_reserva', 'recadastro com recibos',
  '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', '2026-12-31', '17100000000241', 'Cliente R', '11144477735');

insert into public.casos (id, tipo_caso, motivo, descricao, vendedor_dono, criado_por, prazo_vigencia, contrato_numero, cliente_nome, cliente_cpf)
values ('24000000-0000-0000-0000-00000000000b', 'alteracao_data', 'pedido_cliente', 'não é recadastro',
  '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', '2026-12-31', '17100000000242', 'Cliente S', '11144477735');

insert into public.casos_recibos_recadastrados (caso_id, recibo_numero, criado_por) values
  ('24000000-0000-0000-0000-00000000000a', '17109999000001', '00000000-0000-0000-0000-000000000002'),
  ('24000000-0000-0000-0000-00000000000a', '17109999000002', '00000000-0000-0000-0000-000000000002');

select public._test_assert(
  'dono: registra vários recibos no caso de Recadastro',
  (select count(*) = 2 from public.casos_recibos_recadastrados where caso_id = '24000000-0000-0000-0000-00000000000a')
);

select public._test_assert(
  'criado_por nunca vem do client — sempre quem inseriu',
  (select bool_and(criado_por = '00000000-0000-0000-0000-000000000001') from public.casos_recibos_recadastrados
   where caso_id = '24000000-0000-0000-0000-00000000000a')
);

\set ON_ERROR_STOP 0
insert into public.casos_recibos_recadastrados (caso_id, recibo_numero) values ('24000000-0000-0000-0000-00000000000a', '1710999900000');
\set ON_ERROR_STOP 1
select public._test_assert('constraint: recibo com 13 dígitos é recusado', :'ERROR' = 'true');

\set ON_ERROR_STOP 0
insert into public.casos_recibos_recadastrados (caso_id, recibo_numero) values ('24000000-0000-0000-0000-00000000000a', '1710999900000A');
\set ON_ERROR_STOP 1
select public._test_assert('constraint: recibo com letra é recusado', :'ERROR' = 'true');

\set ON_ERROR_STOP 0
insert into public.casos_recibos_recadastrados (caso_id, recibo_numero) values ('24000000-0000-0000-0000-00000000000a', '17109999000001');
\set ON_ERROR_STOP 1
select public._test_assert('constraint: mesmo recibo repetido no caso é recusado', :'ERROR' = 'true');

\set ON_ERROR_STOP 0
insert into public.casos_recibos_recadastrados (caso_id, recibo_numero) values ('24000000-0000-0000-0000-00000000000b', '17109999000003');
\set ON_ERROR_STOP 1
select public._test_assert('trigger: recibo em caso que não é Recadastro é recusado', :'ERROR' = 'true');

\set ON_ERROR_STOP 0
update public.casos_recibos_recadastrados set recibo_numero = '17109999000009' where caso_id = '24000000-0000-0000-0000-00000000000a';
\set ON_ERROR_STOP 1
select public._test_assert('sem UPDATE para authenticated (nem o dono)', :'ERROR' = 'true');

\set ON_ERROR_STOP 0
delete from public.casos_recibos_recadastrados where caso_id = '24000000-0000-0000-0000-00000000000a';
\set ON_ERROR_STOP 1
select public._test_assert('sem DELETE para authenticated (nem o dono)', :'ERROR' = 'true');

reset role;
reset request.jwt.claim.sub;

-- Vendedor B (mesma filial, não dono): não vê nem insere.
set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000002';
set role authenticated;
select public._test_assert(
  'colega da mesma filial: NAO vê os recibos',
  (select count(*) = 0 from public.casos_recibos_recadastrados where caso_id = '24000000-0000-0000-0000-00000000000a')
);
\set ON_ERROR_STOP 0
insert into public.casos_recibos_recadastrados (caso_id, recibo_numero) values ('24000000-0000-0000-0000-00000000000a', '17109999000004');
\set ON_ERROR_STOP 1
select public._test_assert('colega da mesma filial: NAO insere recibo', :'ERROR' = 'true');
reset role;
reset request.jwt.claim.sub;

-- Gerente 1714: não vê.
set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000005';
set role authenticated;
select public._test_assert(
  'gerente de outra filial: NAO vê os recibos',
  (select count(*) = 0 from public.casos_recibos_recadastrados where caso_id = '24000000-0000-0000-0000-00000000000a')
);
reset role;
reset request.jwt.claim.sub;

-- Gerente 1710: vê e insere.
set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000003';
set role authenticated;
insert into public.casos_recibos_recadastrados (caso_id, recibo_numero) values ('24000000-0000-0000-0000-00000000000a', '17109999000005');
select public._test_assert(
  'gerente da filial: vê e insere recibo',
  (select count(*) = 3 from public.casos_recibos_recadastrados where caso_id = '24000000-0000-0000-0000-00000000000a')
);
reset role;
reset request.jwt.claim.sub;

-- Admin: vê.
set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000006';
set role authenticated;
select public._test_assert(
  'adm: vê os recibos',
  (select count(*) = 3 from public.casos_recibos_recadastrados where caso_id = '24000000-0000-0000-0000-00000000000a')
);
reset role;
reset request.jwt.claim.sub;

-- Idempotência: reaplicar a migration não falha nem perde dados.
\ir ../migrations/20261006000006_casos_recibos_recadastrados.sql
select public._test_assert(
  'migration reaplicada: recibos preservados',
  (select count(*) = 3 from public.casos_recibos_recadastrados where caso_id = '24000000-0000-0000-0000-00000000000a')
);

select 'todos os asserts de casos_recibos_recadastrados passaram' as status;

set role postgres;
drop function public._test_assert(text, boolean);
reset role;
