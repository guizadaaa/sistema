-- ============================================================================
-- Teste: casos_log_auditoria (item 1 do backlog de 22/07) — confirma que uma
-- edição administrativa em public.casos (ex.: correção de CPF) fica
-- registrada em auditoria com quem fez, quando, e o valor antigo/novo.
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

reset role;

-- adm_master corrige o CPF do caso de teste (casos_update libera admin pra
-- qualquer coluna) — deve deixar rastro em auditoria.
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000004';

update public.casos
set cliente_cpf = '52998224725'
where id = '10000000-0000-0000-0000-000000000001';

select public._test_assert(
  'casos_log_auditoria: gravou 1 linha em auditoria para o UPDATE de cliente_cpf',
  (
    select count(*) = 1 from public.auditoria
    where tabela = 'casos' and registro_id = '10000000-0000-0000-0000-000000000001' and acao = 'update'
  )
);

select public._test_assert(
  'casos_log_auditoria: realizado_por é quem fez a alteração (adm_master)',
  (
    select realizado_por = '00000000-0000-0000-0000-000000000004'
    from public.auditoria
    where tabela = 'casos' and registro_id = '10000000-0000-0000-0000-000000000001' and acao = 'update'
  )
);

select public._test_assert(
  'casos_log_auditoria: guarda o CPF antigo em dados_antigos',
  (
    select dados_antigos ->> 'cliente_cpf' = '11144477735'
    from public.auditoria
    where tabela = 'casos' and registro_id = '10000000-0000-0000-0000-000000000001' and acao = 'update'
  )
);

select public._test_assert(
  'casos_log_auditoria: guarda o CPF novo em dados_novos',
  (
    select dados_novos ->> 'cliente_cpf' = '52998224725'
    from public.auditoria
    where tabela = 'casos' and registro_id = '10000000-0000-0000-0000-000000000001' and acao = 'update'
  )
);

reset role;
reset request.jwt.claim.sub;

-- Vendedor comum não deve conseguir ler auditoria (RLS já existente,
-- auditoria_select_adm_master — só confirma que a extensão para "casos" não
-- abriu leitura pra mais ninguém).
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000001';

select public._test_assert(
  'auditoria continua invisivel para vendedor (mesmo dono do caso)',
  (select count(*) = 0 from public.auditoria where tabela = 'casos')
);

reset role;
reset request.jwt.claim.sub;

select 'todos os asserts de auditoria de casos passaram' as status;

set role postgres;
drop function public._test_assert(text, boolean);
reset role;
