-- ============================================================================
-- Teste de regressão para casos.subtipo_recadastro (migration
-- 20261006000008_subtipo_recadastro.sql).
--
-- Cobre:
--   1. Recadastro novo SEM subtipo é recusado; com cada um dos 4 subtipos, aceito.
--   2. Subtipo em outro tipo de caso é recusado (constraint).
--   3. Recadastro ANTIGO (subtipo NULL, criado antes da regra) continua
--      editável pelo dono (prazo), tem o status avançado e é editável por admin.
--   4. Dono não altera o subtipo depois de criado; ninguém o apaga.
--   5. RLS do caso: gerente de outra filial não vê o caso (nem o subtipo).
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

-- Recadastro "antigo": criado com a trigger desligada, simulando um caso de
-- antes de 20261006000008 (subtipo NULL).
alter table public.casos disable trigger casos_exige_subtipo_recadastro;
set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000001';
set role authenticated;
insert into public.casos (id, tipo_caso, descricao, vendedor_dono, criado_por, prazo_vigencia, contrato_numero, cliente_nome, cliente_cpf)
values ('26000000-0000-0000-0000-0000000000a0', 'recadastro_sem_reserva', 'recadastro antigo',
  '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', '2026-12-31', '17100000000260', 'Cliente Antigo', '11144477735');
reset role;
reset request.jwt.claim.sub;
alter table public.casos enable trigger casos_exige_subtipo_recadastro;

set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000001';
set role authenticated;

-- 1. Sem subtipo: recusado.
\set ON_ERROR_STOP 0
insert into public.casos (tipo_caso, descricao, vendedor_dono, criado_por, prazo_vigencia, contrato_numero, cliente_nome, cliente_cpf)
values ('recadastro_sem_reserva', 'sem subtipo', '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', '2026-12-31', '17100000000261', 'X', '11144477735');
\set ON_ERROR_STOP 1
select public._test_assert('Recadastro novo sem subtipo é recusado', :'ERROR' = 'true');

-- Os 4 subtipos.
insert into public.casos (id, tipo_caso, subtipo_recadastro, descricao, vendedor_dono, criado_por, prazo_vigencia, contrato_numero, cliente_nome, cliente_cpf) values
  ('26000000-0000-0000-0000-0000000000a1', 'recadastro_sem_reserva', 'troca_passageiro', 'a', '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', '2026-12-31', '17100000000262', 'A', '11144477735'),
  ('26000000-0000-0000-0000-0000000000a2', 'recadastro_sem_reserva', 'inclusao_passageiro', 'b', '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', '2026-12-31', '17100000000263', 'B', '11144477735'),
  ('26000000-0000-0000-0000-0000000000a3', 'recadastro_sem_reserva', 'troca_fornecedor', 'c', '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', '2026-12-31', '17100000000264', 'C', '11144477735'),
  ('26000000-0000-0000-0000-0000000000a4', 'recadastro_sem_reserva', 'inclusao_servicos', 'd', '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', '2026-12-31', '17100000000265', 'D', '11144477735');
select public._test_assert(
  'os 4 subtipos são aceitos em Recadastro',
  (select count(distinct subtipo_recadastro) = 4 from public.casos where id::text like '26000000-0000-0000-0000-0000000000a_')
);

-- 2. Subtipo fora de Recadastro: recusado.
\set ON_ERROR_STOP 0
insert into public.casos (tipo_caso, subtipo_recadastro, motivo, descricao, vendedor_dono, criado_por, prazo_vigencia, contrato_numero, cliente_nome, cliente_cpf)
values ('alteracao_data', 'troca_passageiro', 'pedido_cliente', 'x', '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', '2026-12-31', '17100000000266', 'X', '11144477735');
\set ON_ERROR_STOP 1
select public._test_assert('constraint: subtipo em Alteração de data é recusado', :'ERROR' = 'true');

-- 3. Recadastro antigo continua editável pelo dono.
update public.casos set prazo_vigencia = '2027-03-31' where id = '26000000-0000-0000-0000-0000000000a0';
select public._test_assert(
  'Recadastro antigo (subtipo NULL): dono continua editando o prazo',
  (select prazo_vigencia = '2027-03-31' and subtipo_recadastro is null from public.casos where id = '26000000-0000-0000-0000-0000000000a0')
);

insert into public.status_historico (caso_id, status) values ('26000000-0000-0000-0000-0000000000a0', 'recepcionado');
select public._test_assert(
  'Recadastro antigo: status avança normalmente (UPDATE de status_atual passa)',
  (select status_atual = 'recepcionado' from public.casos where id = '26000000-0000-0000-0000-0000000000a0')
);

-- 4. Dono não altera o subtipo.
\set ON_ERROR_STOP 0
update public.casos set subtipo_recadastro = 'troca_fornecedor' where id = '26000000-0000-0000-0000-0000000000a1';
\set ON_ERROR_STOP 1
select public._test_assert('vendedor dono: NAO altera o subtipo depois de criado', :'ERROR' = 'true');

reset role;
reset request.jwt.claim.sub;

-- Admin: edita Recadastro antigo, preenche subtipo nele, mas não apaga subtipo.
set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000006';
set role authenticated;

update public.casos set descricao = 'recadastro antigo (revisado)' where id = '26000000-0000-0000-0000-0000000000a0';
select public._test_assert(
  'adm: edita Recadastro antigo sem precisar informar subtipo',
  (select descricao = 'recadastro antigo (revisado)' from public.casos where id = '26000000-0000-0000-0000-0000000000a0')
);

update public.casos set subtipo_recadastro = 'inclusao_passageiro' where id = '26000000-0000-0000-0000-0000000000a0';
select public._test_assert(
  'adm: pode completar o subtipo de um Recadastro antigo',
  (select subtipo_recadastro = 'inclusao_passageiro' from public.casos where id = '26000000-0000-0000-0000-0000000000a0')
);

\set ON_ERROR_STOP 0
update public.casos set subtipo_recadastro = null where id = '26000000-0000-0000-0000-0000000000a1';
\set ON_ERROR_STOP 1
select public._test_assert('ninguém (nem adm) apaga um subtipo já preenchido', :'ERROR' = 'true');

reset role;
reset request.jwt.claim.sub;

-- 5. RLS: gerente de outra filial não vê.
set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000005';
set role authenticated;
select public._test_assert(
  'gerente de outra filial: NAO vê os casos de Recadastro da 1710',
  (select count(*) = 0 from public.casos where id::text like '26000000-%')
);
reset role;
reset request.jwt.claim.sub;

-- Idempotência.
\ir ../migrations/20261006000008_subtipo_recadastro.sql
select public._test_assert(
  'migration reaplicada: constraint e trigger únicas, dados preservados',
  (select count(*) = 1 from pg_constraint where conname = 'casos_subtipo_recadastro_por_tipo')
  and (select count(*) = 1 from pg_trigger where tgname = 'casos_exige_subtipo_recadastro')
  and (select subtipo_recadastro = 'troca_passageiro' from public.casos where id = '26000000-0000-0000-0000-0000000000a1')
);

select 'todos os asserts de subtipo_recadastro passaram' as status;

set role postgres;
drop function public._test_assert(text, boolean);
reset role;
