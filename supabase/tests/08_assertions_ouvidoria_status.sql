-- ============================================================================
-- Teste de regressão para a mudança de Ouvidoria de "flag + reabertura pós
-- Resolvido, exclusiva de admin" para "status normal, alcançável a partir
-- de Em andamento interno, ainda exclusivo de admin" (migration
-- 20260724000006_ouvidoria_status_na_timeline.sql).
--
-- Cobre exatamente o que a policy status_historico_insert precisa garantir
-- agora que não depende mais da coluna elegivel_ouvidoria (removida):
--   1. Admin PODE inserir 'ouvidoria' e depois 'resolvido' a partir dela.
--   2. Gerente com delegação ativa (NÃO admin) NÃO PODE inserir 'ouvidoria'
--      — continua exclusivo de admin, só que agora sem o flag.
--   3. O mesmo gerente delegado CONTINUA podendo inserir 'reavaliacao' —
--      prova que a restrição é específica de 'ouvidoria', não um efeito
--      colateral que bloqueou o gerente delegado em geral.
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

-- ----------------------------------------------------------------------------
-- Caso 1: admin move Em andamento interno -> Ouvidoria -> Resolvido.
-- ----------------------------------------------------------------------------

set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000001';
set role authenticated;

insert into public.casos (
  id, tipo_caso, motivo, descricao, vendedor_dono, criado_por, prazo_vigencia,
  contrato_numero, cliente_nome, cliente_cpf
) values (
  '10000000-0000-0000-0000-000000000004', 'alteracao_data', 'pedido_cliente', 'teste ouvidoria (admin)',
  '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', '2026-12-31',
  '17100000000004', 'Cliente Ouvidoria Admin', '11144477735'
);

reset role;
reset request.jwt.claim.sub;

set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000004';
set role authenticated;

insert into public.status_historico (caso_id, status) values ('10000000-0000-0000-0000-000000000004', 'recepcionado');
insert into public.status_historico (caso_id, status) values ('10000000-0000-0000-0000-000000000004', 'em_andamento_interno');

\set ON_ERROR_STOP 0
insert into public.status_historico (caso_id, status) values ('10000000-0000-0000-0000-000000000004', 'ouvidoria');
\set ON_ERROR_STOP 1

select public._test_assert(
  'admin: insere status ouvidoria com sucesso (sem flag elegivel_ouvidoria nenhum)',
  :'ERROR' = 'false'
);

select public._test_assert(
  'admin: status_atual do caso sincronizado para ouvidoria',
  (select status_atual = 'ouvidoria' from public.casos where id = '10000000-0000-0000-0000-000000000004')
);

insert into public.status_historico (caso_id, status) values ('10000000-0000-0000-0000-000000000004', 'resolvido');

select public._test_assert(
  'admin: Ouvidoria -> Resolvido funciona normalmente',
  (select status_atual = 'resolvido' from public.casos where id = '10000000-0000-0000-0000-000000000004')
);

reset role;
reset request.jwt.claim.sub;

-- ----------------------------------------------------------------------------
-- Caso 2: gerente com delegação ativa NÃO pode mover para Ouvidoria, mas
-- continua podendo mover para Reavaliação (a restrição é só de Ouvidoria).
-- ----------------------------------------------------------------------------

-- Reaproveita a delegação ativa do gerente 1710 já semeada em
-- 04_assertions_notificacoes.sql (inicio now()-1d, fim now()+1d, ativa) —
-- inserir outra aqui colidiria com a checagem de sobreposição de
-- validate_delegacao().
set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000001';
set role authenticated;

insert into public.casos (
  id, tipo_caso, motivo, descricao, vendedor_dono, criado_por, prazo_vigencia,
  contrato_numero, cliente_nome, cliente_cpf
) values (
  '10000000-0000-0000-0000-000000000005', 'alteracao_data', 'pedido_cliente', 'teste ouvidoria (gerente delegado)',
  '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', '2026-12-31',
  '17100000000005', 'Cliente Ouvidoria Gerente', '11144477735'
);

reset role;
reset request.jwt.claim.sub;

set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000003';
set role authenticated;

insert into public.status_historico (caso_id, status) values ('10000000-0000-0000-0000-000000000005', 'recepcionado');
insert into public.status_historico (caso_id, status) values ('10000000-0000-0000-0000-000000000005', 'em_andamento_interno');

\set ON_ERROR_STOP 0
insert into public.status_historico (caso_id, status) values ('10000000-0000-0000-0000-000000000005', 'ouvidoria');
\set ON_ERROR_STOP 1

select public._test_assert(
  'gerente delegado: NAO consegue inserir status ouvidoria (continua exclusivo de admin)',
  :'ERROR' = 'true'
);

select public._test_assert(
  'gerente delegado: status_atual do caso continua em_andamento_interno (insert de ouvidoria rejeitado, nada mudou)',
  (select status_atual = 'em_andamento_interno' from public.casos where id = '10000000-0000-0000-0000-000000000005')
);

insert into public.status_historico (caso_id, status) values ('10000000-0000-0000-0000-000000000005', 'reavaliacao');

select public._test_assert(
  'gerente delegado: continua conseguindo inserir reavaliacao normalmente (restrição é só de ouvidoria)',
  (select status_atual = 'reavaliacao' from public.casos where id = '10000000-0000-0000-0000-000000000005')
);

reset role;
reset request.jwt.claim.sub;

select 'todos os asserts de ouvidoria como status passaram' as status;

set role postgres;
drop function public._test_assert(text, boolean);
reset role;
