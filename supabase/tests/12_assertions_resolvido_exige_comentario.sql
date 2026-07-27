-- ============================================================================
-- Teste de regressão: caso não pode ir para "Resolvido" sem comentário
-- (migration 20260727000003_resolvido_exige_comentario.sql).
--
-- Cobre:
--   1. Admin NÃO consegue inserir status_historico com status='resolvido'
--      para um caso sem nenhuma linha em casos_complementos.
--   2. Depois de um comentário ser registrado, o mesmo admin consegue.
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

-- Caso da Vendedor A (10000000-...-001, seed), sem nenhum comentário ainda.
set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000004';
set role authenticated;

\set ON_ERROR_STOP 0
insert into public.status_historico (caso_id, status) values (
  '10000000-0000-0000-0000-000000000001', 'resolvido'
);
\set ON_ERROR_STOP 1

select public._test_assert(
  'trigger bloqueia Resolvido sem nenhum comentário registrado',
  :'ERROR' = 'true'
);

reset role;
reset request.jwt.claim.sub;

-- Vendedor A registra um comentário (casos_complementos_insert libera pra
-- quem já enxerga o caso, mesmo padrão de anexos/contratos adicionais).
set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000001';
set role authenticated;

insert into public.casos_complementos (caso_id, texto) values (
  '10000000-0000-0000-0000-000000000001', 'Cliente confirmou os novos dados da viagem por telefone.'
);

reset role;
reset request.jwt.claim.sub;

-- Agora o mesmo admin consegue marcar como Resolvido.
set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000004';
set role authenticated;

insert into public.status_historico (caso_id, status) values (
  '10000000-0000-0000-0000-000000000001', 'resolvido'
);

select public._test_assert(
  'com ao menos um comentário registrado, Resolvido é aceito',
  (
    select count(*) = 1 from public.status_historico
    where caso_id = '10000000-0000-0000-0000-000000000001' and status = 'resolvido'
  )
);

reset role;
reset request.jwt.claim.sub;

select 'todos os asserts de resolvido-exige-comentario passaram' as status;

set role postgres;
drop function public._test_assert(text, boolean);
reset role;
