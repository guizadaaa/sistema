-- ============================================================================
-- Testes de RLS — provam que os 3 vazamentos críticos da auditoria de 22/07
-- continuam fechados (C1: desfechos_visivel, C2: casos_contratos_adicionais)
-- e que a centralização em auth_pode_ver_caso() (M1) não regrediu nenhum dos
-- 5 papéis testados em nenhuma das 6 tabelas/views que passaram a usá-la.
--
-- Convenção: cada assert é uma linha `select assert_count('rótulo', esperado,
-- (select count(*) from ...));`. Uma falha levanta exceção e o script para
-- (rode com `psql -v ON_ERROR_STOP=1`, que scripts/test-rls.sh já faz) — sem
-- falha nenhuma, o script termina imprimindo só "status: todos os asserts
-- passaram".
-- ============================================================================

set role postgres;

create or replace function public._test_assert_count(p_rotulo text, p_esperado bigint, p_obtido bigint)
returns void
language plpgsql
as $$
begin
  if p_obtido is distinct from p_esperado then
    raise exception 'FALHOU: % — esperado %, obtido %', p_rotulo, p_esperado, p_obtido;
  end if;
  raise notice 'ok: %', p_rotulo;
end;
$$;

reset role;

-- ----------------------------------------------------------------------------
-- C2 — casos_contratos_adicionais: vendedor B (mesma filial, não-dono) não
-- pode ver nem inserir; dono, gerente da filial e admin continuam vendo.
-- ----------------------------------------------------------------------------

set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000002';
select public._test_assert_count(
  'C2: vendedor B NAO ve contrato adicional de caso alheio',
  0,
  (select count(*) from public.casos_contratos_adicionais where caso_id = '10000000-0000-0000-0000-000000000001')
);
reset role;
reset request.jwt.claim.sub;

-- SET ROLE/claim.sub feitos ANTES do DO block (não dentro) — o bloco só
-- tenta o insert já impersonando vendedor B.
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000002';
do $$
begin
  insert into public.casos_contratos_adicionais (caso_id, contrato_numero)
  values ('10000000-0000-0000-0000-000000000001', '17100000000088');
  raise exception 'FALHOU: C2 vendedor B conseguiu inserir contrato adicional em caso alheio';
exception when insufficient_privilege then
  raise notice 'ok: C2: vendedor B NAO consegue inserir contrato adicional em caso alheio';
end
$$;
reset role;
reset request.jwt.claim.sub;

set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000001';
select public._test_assert_count(
  'C2: vendedor A (dono) ve o proprio contrato adicional',
  1,
  (select count(*) from public.casos_contratos_adicionais where caso_id = '10000000-0000-0000-0000-000000000001')
);
reset role;
reset request.jwt.claim.sub;

set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000003';
select public._test_assert_count(
  'C2: gerente da mesma filial ve o contrato adicional',
  1,
  (select count(*) from public.casos_contratos_adicionais where caso_id = '10000000-0000-0000-0000-000000000001')
);
reset role;
reset request.jwt.claim.sub;

-- ----------------------------------------------------------------------------
-- C1 — desfechos_visivel: vendedor B não vê a linha; dono vê dados bancários
-- completos; gerente da filial vê a linha com banco_* mascarado.
-- ----------------------------------------------------------------------------

set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000002';
select public._test_assert_count(
  'C1: vendedor B NAO ve desfecho de caso alheio',
  0,
  (select count(*) from public.desfechos_visivel where caso_id = '10000000-0000-0000-0000-000000000001')
);
reset role;
reset request.jwt.claim.sub;

set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000001';
select public._test_assert_count(
  'C1: vendedor A (dono) ve o proprio desfecho com banco_cpf preenchido',
  1,
  (select count(*) from public.desfechos_visivel
   where caso_id = '10000000-0000-0000-0000-000000000001' and banco_cpf = '11144477735')
);
reset role;
reset request.jwt.claim.sub;

set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000003';
select public._test_assert_count(
  'C1: gerente da filial ve o desfecho, mas com banco_cpf mascarado (NULL)',
  1,
  (select count(*) from public.desfechos_visivel
   where caso_id = '10000000-0000-0000-0000-000000000001' and banco_cpf is null and valor = 1000.00)
);
reset role;
reset request.jwt.claim.sub;

-- ----------------------------------------------------------------------------
-- M1 — regressão nas 6 tabelas/views migradas para auth_pode_ver_caso(),
-- incluindo um gerente de OUTRA filial como controle negativo novo.
-- ----------------------------------------------------------------------------

set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000001';
select public._test_assert_count('M1 casos: vendedor A (dono)', 1, (select count(*) from public.casos where id = '10000000-0000-0000-0000-000000000001'));
reset role; reset request.jwt.claim.sub;

set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000002';
select public._test_assert_count('M1 casos: vendedor B (NAO)', 0, (select count(*) from public.casos where id = '10000000-0000-0000-0000-000000000001'));
select public._test_assert_count('M1 status_historico: vendedor B (NAO)', 0, (select count(*) from public.status_historico where caso_id = '10000000-0000-0000-0000-000000000001'));
select public._test_assert_count('M1 anexos: vendedor B (NAO)', 0, (select count(*) from public.anexos where caso_id = '10000000-0000-0000-0000-000000000001'));
select public._test_assert_count('M1 storage.objects: vendedor B (NAO)', 0, (select count(*) from storage.objects where bucket_id = 'anexos' and name like '10000000-0000-0000-0000-000000000001/%'));
reset role; reset request.jwt.claim.sub;

set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000003';
select public._test_assert_count('M1 casos: gerente 1710 (mesma filial)', 1, (select count(*) from public.casos where id = '10000000-0000-0000-0000-000000000001'));
select public._test_assert_count('M1 status_historico: gerente 1710', 1, (select count(*) from public.status_historico where caso_id = '10000000-0000-0000-0000-000000000001'));
select public._test_assert_count('M1 anexos: gerente 1710', 1, (select count(*) from public.anexos where caso_id = '10000000-0000-0000-0000-000000000001'));
select public._test_assert_count('M1 storage.objects: gerente 1710', 1, (select count(*) from storage.objects where bucket_id = 'anexos' and name like '10000000-0000-0000-0000-000000000001/%'));
reset role; reset request.jwt.claim.sub;

set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000005';
select public._test_assert_count('M1 casos: gerente 1714 (OUTRA filial, controle negativo)', 0, (select count(*) from public.casos where id = '10000000-0000-0000-0000-000000000001'));
select public._test_assert_count('M1 anexos: gerente 1714 (controle negativo)', 0, (select count(*) from public.anexos where caso_id = '10000000-0000-0000-0000-000000000001'));
reset role; reset request.jwt.claim.sub;

set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000004';
select public._test_assert_count('M1 casos: adm_master ve tudo', 1, (select count(*) from public.casos where id = '10000000-0000-0000-0000-000000000001'));
select public._test_assert_count('M1 desfechos_visivel: adm_master ve tudo', 1, (select count(*) from public.desfechos_visivel where caso_id = '10000000-0000-0000-0000-000000000001'));
reset role; reset request.jwt.claim.sub;

select 'todos os asserts passaram' as status;

set role postgres;
drop function public._test_assert_count(text, bigint, bigint);
reset role;
