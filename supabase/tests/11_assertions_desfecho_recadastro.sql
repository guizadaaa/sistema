-- ============================================================================
-- Teste de regressão para o tipo de desfecho "recadastro" (migration
-- 20260727000001_desfecho_recadastro.sql) — não carrega nenhum dado
-- adicional (sem valor, sem subtipo, sem dados bancários).
--
-- Cobre:
--   1. Admin consegue registrar um desfecho tipo=recadastro sem nenhum
--      campo específico de outro tipo preenchido.
--   2. A constraint desfechos_campos_por_tipo rejeita um recadastro que
--      tente carregar um valor (campo que só faz sentido pra outros tipos).
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

set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000004';
set role authenticated;

insert into public.desfechos (id, caso_id, tipo) values (
  '20000000-0000-0000-0000-000000000099', '10000000-0000-0000-0000-000000000001', 'recadastro'
);

-- Leitura via desfechos_visivel, não da tabela crua: authenticated só tem
-- INSERT em public.desfechos (SELECT direto é revogado propositalmente em
-- 20260717000002_desfechos_mascara_bancaria.sql).
select public._test_assert(
  'admin: consegue registrar desfecho tipo=recadastro sem campos adicionais',
  (
    select count(*) = 1 from public.desfechos_visivel
    where id = '20000000-0000-0000-0000-000000000099'
      and tipo = 'recadastro'
      and valor is null and subtipo_reembolso is null and subtipo_remarcacao is null
  )
);

\set ON_ERROR_STOP 0
insert into public.desfechos (id, caso_id, tipo, valor) values (
  '20000000-0000-0000-0000-000000000098', '10000000-0000-0000-0000-000000000001', 'recadastro', 100.00
);
\set ON_ERROR_STOP 1

select public._test_assert(
  'constraint rejeita recadastro com valor preenchido (campo não pertence a esse tipo)',
  :'ERROR' = 'true'
);

reset role;
reset request.jwt.claim.sub;

select 'todos os asserts de desfecho recadastro passaram' as status;

set role postgres;
drop function public._test_assert(text, boolean);
reset role;
