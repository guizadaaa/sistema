-- ============================================================================
-- Teste de regressão para nomes_usuarios_casos (migration
-- 20261005000001_nomes_usuarios_casos.sql) — bug de "—" no lugar do nome de
-- quem registrou o caso, avançou status ou comentou, para vendedor/gerente.
--
-- Cobre:
--   1. Causa raiz: a RLS de usuarios esconde de vendedor/gerente o nome do
--      admin que avançou o status (continua escondendo — não foi afrouxada).
--   2. Vendedor dono, gerente da filial e admin recebem o nome de todo
--      participante do caso (criador, dono, ator do status, autor do
--      comentário).
--   3. Vendedor que não enxerga o caso e gerente de outra filial: nenhuma
--      linha. Pedido misturando caso visível e invisível só devolve os
--      participantes do visível.
--   4. A função só expõe (id, nome_completo) — nada de e-mail/perfil/filial.
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

-- Vendedor C, filial 1714 — dono de um caso que ninguém da 1710 enxerga.
insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-000000000017', 'vendedorC1714@teste.com', '{"nome_completo":"Vendedor C 1714","perfil":"vendedor","filial":"1714"}'),
  ('00000000-0000-0000-0000-000000000006', 'adm@teste.com', '{"nome_completo":"Adm","perfil":"adm"}')
on conflict (id) do nothing;

-- Caso X: Vendedor A (1710) registra.
set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000001';
set role authenticated;
insert into public.casos (
  id, tipo_caso, motivo, descricao, vendedor_dono, criado_por, prazo_vigencia,
  contrato_numero, cliente_nome, cliente_cpf
) values (
  '17000000-0000-0000-0000-000000000001', 'alteracao_data', 'pedido_cliente', 'teste nomes 1710',
  '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', '2026-12-31',
  '17100000000171', 'Cliente Nomes', '11144477735'
);
reset role;
reset request.jwt.claim.sub;

-- adm_master avança o status do caso X.
set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000004';
set role authenticated;
insert into public.status_historico (caso_id, status) values ('17000000-0000-0000-0000-000000000001', 'recepcionado');
reset role;
reset request.jwt.claim.sub;

-- Gerente 1710 comenta no caso X.
set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000003';
set role authenticated;
insert into public.casos_complementos (caso_id, texto) values ('17000000-0000-0000-0000-000000000001', 'comentário do gerente');
reset role;
reset request.jwt.claim.sub;

-- Caso Y: Vendedor C (1714) registra.
set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000017';
set role authenticated;
insert into public.casos (
  id, tipo_caso, motivo, descricao, vendedor_dono, criado_por, prazo_vigencia,
  contrato_numero, cliente_nome, cliente_cpf
) values (
  '17000000-0000-0000-0000-000000000002', 'alteracao_data', 'pedido_cliente', 'teste nomes 1714',
  '00000000-0000-0000-0000-000000000017', '00000000-0000-0000-0000-000000000017', '2026-12-31',
  '17140000000171', 'Cliente Outra Filial', '11144477735'
);
reset role;
reset request.jwt.claim.sub;

-- ----------------------------------------------------------------------------
-- Vendedor A (dono do caso X)
-- ----------------------------------------------------------------------------

set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000001';
set role authenticated;

select public._test_assert(
  'causa raiz: RLS de usuarios esconde do vendedor o nome do adm_master (e continua escondendo)',
  (select count(*) = 0 from public.usuarios where id = '00000000-0000-0000-0000-000000000004')
);

select public._test_assert(
  'RLS de usuarios não foi afrouxada: vendedor segue vendo só a própria linha',
  (select count(*) = 1 from public.usuarios)
);

select public._test_assert(
  'vendedor dono: recebe nome de quem registrou, avançou status e comentou',
  (
    select array_agg(nome_completo order by nome_completo) = array['Adm Master', 'Gerente 1710', 'Vendedor A']
    from public.nomes_usuarios_casos(array['17000000-0000-0000-0000-000000000001']::uuid[])
  )
);

select public._test_assert(
  'vendedor: pedido com caso de outra filial junto só devolve participantes do caso visível',
  (
    select count(*) = 0
    from public.nomes_usuarios_casos(array[
      '17000000-0000-0000-0000-000000000001', '17000000-0000-0000-0000-000000000002'
    ]::uuid[])
    where id = '00000000-0000-0000-0000-000000000017'
  )
);

reset role;
reset request.jwt.claim.sub;

-- ----------------------------------------------------------------------------
-- Vendedor B (mesma filial, não é dono) — não enxerga o caso X.
-- ----------------------------------------------------------------------------

set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000002';
set role authenticated;

select public._test_assert(
  'vendedor que não enxerga o caso: nenhum nome',
  (select count(*) = 0 from public.nomes_usuarios_casos(array['17000000-0000-0000-0000-000000000001']::uuid[]))
);

reset role;
reset request.jwt.claim.sub;

-- ----------------------------------------------------------------------------
-- Gerente 1710 — enxerga o caso X; antes não via o nome do adm_master.
-- ----------------------------------------------------------------------------

set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000003';
set role authenticated;

select public._test_assert(
  'causa raiz: RLS de usuarios esconde do gerente o adm_master (filial nula)',
  (select count(*) = 0 from public.usuarios where id = '00000000-0000-0000-0000-000000000004')
);

select public._test_assert(
  'gerente da filial: recebe todos os nomes do caso X, inclusive o adm_master',
  (
    select array_agg(nome_completo order by nome_completo) = array['Adm Master', 'Gerente 1710', 'Vendedor A']
    from public.nomes_usuarios_casos(array['17000000-0000-0000-0000-000000000001']::uuid[])
  )
);

select public._test_assert(
  'gerente 1710: caso da 1714 não devolve nenhum nome',
  (select count(*) = 0 from public.nomes_usuarios_casos(array['17000000-0000-0000-0000-000000000002']::uuid[]))
);

reset role;
reset request.jwt.claim.sub;

-- ----------------------------------------------------------------------------
-- Gerente 1714 — não enxerga o caso X.
-- ----------------------------------------------------------------------------

set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000005';
set role authenticated;

select public._test_assert(
  'gerente de outra filial: nenhum nome do caso X',
  (select count(*) = 0 from public.nomes_usuarios_casos(array['17000000-0000-0000-0000-000000000001']::uuid[]))
);

select public._test_assert(
  'gerente 1714: recebe o nome do vendedor do próprio caso da filial',
  (
    select array_agg(nome_completo) = array['Vendedor C 1714']
    from public.nomes_usuarios_casos(array['17000000-0000-0000-0000-000000000002']::uuid[])
  )
);

reset role;
reset request.jwt.claim.sub;

-- ----------------------------------------------------------------------------
-- Admin (adm comum) — enxerga tudo.
-- ----------------------------------------------------------------------------

set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000006';
set role authenticated;

select public._test_assert(
  'adm: recebe os participantes dos dois casos',
  (
    select count(*) = 4
    from public.nomes_usuarios_casos(array[
      '17000000-0000-0000-0000-000000000001', '17000000-0000-0000-0000-000000000002'
    ]::uuid[])
  )
);

reset role;
reset request.jwt.claim.sub;

-- ----------------------------------------------------------------------------
-- Formato: só id + nome; anon não executa.
-- ----------------------------------------------------------------------------

select public._test_assert(
  'nomes_usuarios_casos expõe apenas (id, nome_completo)',
  pg_get_function_result('public.nomes_usuarios_casos(uuid[])'::regprocedure) = 'TABLE(id uuid, nome_completo text)'
);

select public._test_assert(
  'anon não tem EXECUTE em nomes_usuarios_casos',
  not has_function_privilege('anon', 'public.nomes_usuarios_casos(uuid[])', 'execute')
);

select 'todos os asserts de nomes_usuarios_casos passaram' as status;

set role postgres;
drop function public._test_assert(text, boolean);
reset role;
