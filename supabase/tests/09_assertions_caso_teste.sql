-- ============================================================================
-- Teste de regressão para a categoria "Caso de teste" (migration
-- 20260725000001_casos_de_teste.sql).
--
-- Cobre:
--   1. adm_master PODE marcar um caso como teste.
--   2. Depois de marcado, o dono do caso (vendedor) e o gerente da mesma
--      filial deixam de enxergar o caso via SELECT (auth_pode_ver_caso) —
--      mesmo sendo, antes disso, exatamente quem RLS liberava.
--   3. adm_master CONTINUA enxergando o caso normalmente depois de marcado.
--   4. "adm" (não-master) NÃO PODE marcar/desmarcar caso_teste, mesmo
--      dentro do bypass geral de auth_is_admin() que também cobre "adm".
--   5. O vendedor dono também não pode marcar/desmarcar (óbvio, mas testado
--      por completude — mesma trava vale pra qualquer não-adm_master).
--   6. adm_master reverte (caso_teste=false) e a visibilidade volta ao
--      normal pra vendedor e gerente.
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

-- "adm" (não-master) não existe no seed padrão (01_seed.sql só tem
-- adm_master) — precisa de um pra testar que o bypass de auth_is_admin()
-- não basta pra marcar caso_teste.
insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-000000000006', 'adm@teste.com', '{"nome_completo":"Adm","perfil":"adm"}');

-- Caso da Vendedor A (filial 1710), igual ao padrão dos outros testes.
set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000001';
set role authenticated;

insert into public.casos (
  id, tipo_caso, motivo, descricao, vendedor_dono, criado_por, prazo_vigencia,
  contrato_numero, cliente_nome, cliente_cpf
) values (
  '10000000-0000-0000-0000-000000000006', 'alteracao_data', 'pedido_cliente', 'teste caso de teste',
  '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', '2026-12-31',
  '17100000000006', 'Cliente Caso Teste', '11144477735'
);

select public._test_assert(
  'vendedor dono: enxerga o caso normalmente antes de ser marcado como teste',
  (select count(*) = 1 from public.casos where id = '10000000-0000-0000-0000-000000000006')
);

reset role;
reset request.jwt.claim.sub;

-- ----------------------------------------------------------------------------
-- "adm" (não-master) NÃO pode marcar caso_teste, mesmo com bypass geral de
-- auth_is_admin() (ver enforce_casos_update_permissions).
-- ----------------------------------------------------------------------------

set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000006';
set role authenticated;

\set ON_ERROR_STOP 0
update public.casos set caso_teste = true where id = '10000000-0000-0000-0000-000000000006';
\set ON_ERROR_STOP 1

select public._test_assert(
  '"adm" (não-master) NAO consegue marcar caso_teste, mesmo tendo bypass geral de auth_is_admin()',
  :'ERROR' = 'true'
);

reset role;
reset request.jwt.claim.sub;

-- ----------------------------------------------------------------------------
-- Vendedor dono também não pode marcar caso_teste no próprio caso.
-- ----------------------------------------------------------------------------

set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000001';
set role authenticated;

\set ON_ERROR_STOP 0
update public.casos set caso_teste = true where id = '10000000-0000-0000-0000-000000000006';
\set ON_ERROR_STOP 1

select public._test_assert(
  'vendedor dono NAO consegue marcar o próprio caso como teste',
  :'ERROR' = 'true'
);

reset role;
reset request.jwt.claim.sub;

-- ----------------------------------------------------------------------------
-- adm_master PODE marcar — e a partir daí, dono e gerente da filial deixam
-- de enxergar o caso via SELECT.
-- ----------------------------------------------------------------------------

set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000004';
set role authenticated;

update public.casos set caso_teste = true where id = '10000000-0000-0000-0000-000000000006';

select public._test_assert(
  'adm_master: marca o caso como teste com sucesso',
  (select caso_teste from public.casos where id = '10000000-0000-0000-0000-000000000006')
);

select public._test_assert(
  'adm_master: continua enxergando o caso normalmente depois de marcado como teste',
  (select count(*) = 1 from public.casos where id = '10000000-0000-0000-0000-000000000006')
);

reset role;
reset request.jwt.claim.sub;

set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000001';
set role authenticated;

select public._test_assert(
  'vendedor dono: NAO enxerga mais o próprio caso depois de marcado como teste',
  (select count(*) = 0 from public.casos where id = '10000000-0000-0000-0000-000000000006')
);

reset role;
reset request.jwt.claim.sub;

set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000003';
set role authenticated;

select public._test_assert(
  'gerente da mesma filial: NAO enxerga o caso de teste (mesma filial não basta mais)',
  (select count(*) = 0 from public.casos where id = '10000000-0000-0000-0000-000000000006')
);

reset role;
reset request.jwt.claim.sub;

set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000006';
set role authenticated;

select public._test_assert(
  '"adm" (não-master): NAO enxerga o caso de teste (só adm_master enxerga)',
  (select count(*) = 0 from public.casos where id = '10000000-0000-0000-0000-000000000006')
);

reset role;
reset request.jwt.claim.sub;

-- ----------------------------------------------------------------------------
-- adm_master reverte — visibilidade volta ao normal.
-- ----------------------------------------------------------------------------

set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000004';
set role authenticated;

update public.casos set caso_teste = false where id = '10000000-0000-0000-0000-000000000006';

select public._test_assert(
  'adm_master: reverte caso_teste para false com sucesso',
  not (select caso_teste from public.casos where id = '10000000-0000-0000-0000-000000000006')
);

reset role;
reset request.jwt.claim.sub;

set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000001';
set role authenticated;

select public._test_assert(
  'vendedor dono: volta a enxergar o caso normalmente depois do reverte',
  (select count(*) = 1 from public.casos where id = '10000000-0000-0000-0000-000000000006')
);

reset role;
reset request.jwt.claim.sub;

select 'todos os asserts de caso de teste passaram' as status;

set role postgres;
drop function public._test_assert(text, boolean);
reset role;
