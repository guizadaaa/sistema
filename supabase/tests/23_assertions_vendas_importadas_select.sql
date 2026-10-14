-- ============================================================================
-- Teste de regressão para o SELECT em vendas_importadas (migration
-- 20261006000005_vendas_importadas_select.sql, aplicada antes à mão).
--
-- Cobre:
--   1. A migration é idempotente (reaplicar não falha).
--   2. Admin faz o upsert com ON CONFLICT DO UPDATE que falhava com 42501.
--   3. Admin (adm e adm_master) lê a tabela crua.
--   4. Vendedor e gerente NÃO leem a tabela crua (0 linhas).
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

-- 1. Reaplicar a migration não falha (idempotência).
\ir ../migrations/20261006000005_vendas_importadas_select.sql

select public._test_assert(
  'migration reaplicada: continua existindo uma única policy vendas_importadas_select',
  (select count(*) = 1 from pg_policies where tablename = 'vendas_importadas' and policyname = 'vendas_importadas_select')
);

-- 2. Upsert com ON CONFLICT DO UPDATE pelo admin (o caminho que falhava).
set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000004';
set role authenticated;

insert into public.vendas_importadas (filial, venda_numero, vendedor_nome_planilha, data_venda, pagante, produto, valor_total)
values ('1710', 923001, 'FULANO SELECT', '2026-10-01', 'Cliente Select', 'Pacote', 100)
on conflict (filial, venda_numero) do update set valor_total = excluded.valor_total;

insert into public.vendas_importadas (filial, venda_numero, vendedor_nome_planilha, data_venda, pagante, produto, valor_total)
values ('1710', 923001, 'FULANO SELECT', '2026-10-01', 'Cliente Select', 'Pacote', 250)
on conflict (filial, venda_numero) do update set valor_total = excluded.valor_total;

select public._test_assert(
  'adm_master: upsert com ON CONFLICT DO UPDATE funciona e lê o valor atualizado',
  (select valor_total = 250 from public.vendas_importadas where filial = '1710' and venda_numero = 923001)
);

reset role;
reset request.jwt.claim.sub;

-- 3. adm comum também lê.
set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000006';
set role authenticated;
select public._test_assert(
  'adm: lê a tabela crua vendas_importadas',
  (select count(*) = 1 from public.vendas_importadas where venda_numero = 923001)
);
reset role;
reset request.jwt.claim.sub;

-- 4. Vendedor e gerente não leem a tabela crua.
set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000001';
set role authenticated;
select public._test_assert(
  'vendedor: NAO lê a tabela crua vendas_importadas',
  (select count(*) = 0 from public.vendas_importadas)
);
reset role;
reset request.jwt.claim.sub;

set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000003';
set role authenticated;
select public._test_assert(
  'gerente: NAO lê a tabela crua vendas_importadas',
  (select count(*) = 0 from public.vendas_importadas)
);
reset role;
reset request.jwt.claim.sub;

select 'todos os asserts de vendas_importadas_select passaram' as status;

set role postgres;
drop function public._test_assert(text, boolean);
reset role;
