-- ============================================================================
-- Teste de regressão para casos_complementos (migration
-- 20260725000003_casos_complementos.sql) — informação complementar num
-- caso já criado, sempre visível no histórico com data e autor.
--
-- Cobre:
--   1. Vendedor dono do caso pode adicionar um complemento.
--   2. criado_por nunca vem do client — é sempre auth.uid() de quem
--      inseriu, mesmo que o client tente mandar outro valor (trigger
--      set_complemento_criado_por sobrescreve incondicionalmente).
--   3. Vendedor B (sem relação com o caso, outra pessoa da mesma filial
--      mas não dono) NÃO pode ver nem inserir — mesma regra de
--      auth_pode_ver_caso de qualquer outra tabela filha de casos.
--   4. Gerente da mesma filial PODE ver e inserir (auth_pode_ver_caso já
--      libera isso).
--   5. Sem UPDATE/DELETE — nenhuma policy pra nenhum dos dois.
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

-- Caso da Vendedor A (filial 1710), igual ao padrão dos outros testes.
set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000001';
set role authenticated;

insert into public.casos (
  id, tipo_caso, motivo, descricao, vendedor_dono, criado_por, prazo_vigencia,
  contrato_numero, cliente_nome, cliente_cpf
) values (
  '10000000-0000-0000-0000-000000000007', 'alteracao_data', 'pedido_cliente', 'teste complementos',
  '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', '2026-12-31',
  '17100000000007', 'Cliente Complemento', '11144477735'
);

-- Tenta forjar criado_por com outro id — deve ser ignorado (trigger
-- sobrescreve com o auth.uid() de quem está inserindo de verdade).
insert into public.casos_complementos (caso_id, texto, criado_por) values (
  '10000000-0000-0000-0000-000000000007',
  'Cliente pediu retorno por e-mail, esqueci de registrar na abertura.',
  '00000000-0000-0000-0000-000000000004'
);

select public._test_assert(
  'vendedor dono: consegue adicionar complemento ao próprio caso',
  (select count(*) = 1 from public.casos_complementos where caso_id = '10000000-0000-0000-0000-000000000007')
);

select public._test_assert(
  'criado_por nunca vem do client — trigger sobrescreve com quem inseriu de verdade',
  (
    select criado_por = '00000000-0000-0000-0000-000000000001'
    from public.casos_complementos
    where caso_id = '10000000-0000-0000-0000-000000000007'
  )
);

reset role;
reset request.jwt.claim.sub;

-- ----------------------------------------------------------------------------
-- Vendedor B (mesma filial, mas não é dono nem gerente) não vê nem insere.
-- ----------------------------------------------------------------------------

set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000002';
set role authenticated;

select public._test_assert(
  'vendedor B: NAO enxerga o complemento do caso de outro vendedor',
  (select count(*) = 0 from public.casos_complementos where caso_id = '10000000-0000-0000-0000-000000000007')
);

\set ON_ERROR_STOP 0
insert into public.casos_complementos (caso_id, texto) values (
  '10000000-0000-0000-0000-000000000007', 'tentativa de inserir sem permissão'
);
\set ON_ERROR_STOP 1

select public._test_assert(
  'vendedor B: NAO consegue inserir complemento em caso de outro vendedor',
  :'ERROR' = 'true'
);

reset role;
reset request.jwt.claim.sub;

-- ----------------------------------------------------------------------------
-- Gerente da mesma filial (1710) vê e consegue inserir.
-- ----------------------------------------------------------------------------

set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000003';
set role authenticated;

select public._test_assert(
  'gerente da mesma filial: enxerga o complemento existente',
  (select count(*) = 1 from public.casos_complementos where caso_id = '10000000-0000-0000-0000-000000000007')
);

insert into public.casos_complementos (caso_id, texto) values (
  '10000000-0000-0000-0000-000000000007', 'Gerente confirmou o endereço de cobrança com o cliente.'
);

select public._test_assert(
  'gerente da mesma filial: consegue inserir um segundo complemento',
  (select count(*) = 2 from public.casos_complementos where caso_id = '10000000-0000-0000-0000-000000000007')
);

reset role;
reset request.jwt.claim.sub;

-- ----------------------------------------------------------------------------
-- Sem UPDATE/DELETE — histórico imutável.
-- ----------------------------------------------------------------------------

set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000001';
set role authenticated;

\set ON_ERROR_STOP 0
update public.casos_complementos set texto = 'editado' where caso_id = '10000000-0000-0000-0000-000000000007';
\set ON_ERROR_STOP 1

select public._test_assert(
  'nenhum UPDATE permitido em casos_complementos (sem policy de update)',
  :'ERROR' = 'true'
);

\set ON_ERROR_STOP 0
delete from public.casos_complementos where caso_id = '10000000-0000-0000-0000-000000000007';
\set ON_ERROR_STOP 1

select public._test_assert(
  'nenhum DELETE permitido em casos_complementos (sem policy de delete)',
  :'ERROR' = 'true'
);

reset role;
reset request.jwt.claim.sub;

select 'todos os asserts de casos_complementos passaram' as status;

set role postgres;
drop function public._test_assert(text, boolean);
reset role;
