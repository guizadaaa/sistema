-- ============================================================================
-- Teste de regressão para disparar_sincronizacao_linkly (migration
-- 20261006000009_linkly_disparo_timeout.sql). A chamada HTTP real ao pg_net
-- só é validada em produção; aqui o pg_net é simulado.
--
-- Cobre:
--   1. Assinatura (OUT p_status_code integer) e grants: postgres e
--      service_role executam; anon e authenticated NÃO.
--   2. net.http_post recebe timeout_milliseconds = 60000.
--   3. Resposta ainda pendente (PENDING / "not found") NÃO vira falsa falha:
--      a procedure espera e termina com o status 2xx.
--   4. Timeout/erro do pg_net e HTTP >= 300 falham com mensagem clara.
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

insert into vault.decrypted_secrets (name, decrypted_secret) values ('service_role_key', 'chave-de-teste-service-role')
on conflict (name) do nothing;

-- 1. Assinatura e grants.
select public._test_assert(
  'procedure existe com a mesma assinatura (OUT p_status_code integer)',
  (select pg_get_function_arguments(p.oid) = 'OUT p_status_code integer' and p.prokind = 'p'
   from pg_proc p where p.oid = 'public.disparar_sincronizacao_linkly'::regproc)
);
select public._test_assert('postgres executa', has_function_privilege('postgres', 'public.disparar_sincronizacao_linkly'::regproc, 'execute'));
select public._test_assert('service_role executa', has_function_privilege('service_role', 'public.disparar_sincronizacao_linkly'::regproc, 'execute'));
select public._test_assert('authenticated NAO executa', not has_function_privilege('authenticated', 'public.disparar_sincronizacao_linkly'::regproc, 'execute'));
select public._test_assert('anon NAO executa', not has_function_privilege('anon', 'public.disparar_sincronizacao_linkly'::regproc, 'execute'));

-- Simulação do pg_net: http_post grava o timeout pedido; a coleta segue um
-- roteiro de respostas por cenário (tabela temporária, sobrevive ao COMMIT
-- interno da procedure).
create temporary table _test_linkly_post (timeout_ms integer, url text);
create temporary table _test_linkly_roteiro (ordem integer primary key, status net.request_status, mensagem text, http integer);
create temporary table _test_linkly_coletas (n integer not null default 0);
insert into _test_linkly_coletas values (0);

create or replace function net.http_post(
  url text, body jsonb default '{}'::jsonb, params jsonb default '{}'::jsonb,
  headers jsonb default '{"Content-Type": "application/json"}'::jsonb, timeout_milliseconds integer default 5000
) returns bigint language plpgsql as $$
begin
  insert into _test_linkly_post values (timeout_milliseconds, url);
  return 1;
end;
$$;

-- Cada coleta consome o próximo passo do roteiro; o último passo se repete.
create or replace function net._http_collect_response(request_id bigint, async boolean default true)
returns net.http_response_result
language plpgsql
as $$
declare
  v_n integer;
  v_passo record;
begin
  update _test_linkly_coletas set n = n + 1 returning n into v_n;
  select * into v_passo from _test_linkly_roteiro where ordem <= v_n order by ordem desc limit 1;
  return row(
    v_passo.status,
    v_passo.mensagem,
    case when v_passo.http is null then null else row(v_passo.http, '{}'::jsonb, '{"ok":false}')::net.http_response end
  )::net.http_response_result;
end;
$$;

-- 2 e 3. Pendente por 3 coletas (2 PENDING + 1 "not found"), depois 200.
insert into _test_linkly_roteiro values
  (1, 'PENDING', 'request is pending processing', null),
  (2, 'ERROR', 'request matching request_id not found', null),
  (3, 'PENDING', 'request is pending processing', null),
  (4, 'SUCCESS', 'ok', 200);

call public.disparar_sincronizacao_linkly(null) \gset resultado_

select public._test_assert('resposta pendente não vira falha: termina com HTTP 200', :resultado_p_status_code = 200);
select public._test_assert('esperou as coletas pendentes (4 coletas)', (select n = 4 from _test_linkly_coletas));
select public._test_assert(
  'net.http_post chamado com timeout_milliseconds = 60000 e a mesma URL',
  (select timeout_ms = 60000 and url = 'https://csquqrcmctcyxfxlmdwk.supabase.co/functions/v1/sincronizar-linkly' from _test_linkly_post)
);

-- 4a. Timeout do próprio pg_net: falha na hora, com a mensagem do pg_net.
truncate _test_linkly_roteiro;
update _test_linkly_coletas set n = 0;
insert into _test_linkly_roteiro values (1, 'ERROR', 'Timeout of 60000 ms reached. Total time: 60000.12 ms', null);

-- A exceção desfaz a transação (inclusive o contador de coletas), então
-- "não ficou esperando" é medido pelo tempo decorrido.
select clock_timestamp() as inicio_timeout \gset
\set ON_ERROR_STOP 0
call public.disparar_sincronizacao_linkly(null);
\set ON_ERROR_STOP 1
select public._test_assert(
  'timeout do pg_net: falha visível com a mensagem original',
  :'ERROR' = 'true' and :'LAST_ERROR_MESSAGE' like 'Falha ao disparar sincronização do Linkly — requisição não teve sucesso (status ERROR, mensagem: Timeout of 60000 ms%'
);
select public._test_assert(
  'erro definitivo não fica esperando (falha em menos de 1 s)',
  clock_timestamp() - :'inicio_timeout'::timestamptz < interval '1 second'
);

-- 4b. HTTP 500 da Edge Function.
truncate _test_linkly_roteiro;
update _test_linkly_coletas set n = 0;
insert into _test_linkly_roteiro values (1, 'SUCCESS', 'ok', 500);

\set ON_ERROR_STOP 0
call public.disparar_sincronizacao_linkly(null);
\set ON_ERROR_STOP 1
select public._test_assert(
  'HTTP 500: falha visível com o status',
  :'ERROR' = 'true' and :'LAST_ERROR_MESSAGE' like 'Falha ao disparar sincronização do Linkly (HTTP status 500)%'
);

-- 4c. HTTP 207 (sincronização parcial) conta como 2xx.
truncate _test_linkly_roteiro;
update _test_linkly_coletas set n = 0;
insert into _test_linkly_roteiro values (1, 'SUCCESS', 'ok', 207);
call public.disparar_sincronizacao_linkly(null) \gset resultado_
select public._test_assert('HTTP 207 conta como sucesso (2xx)', :resultado_p_status_code = 207);

-- Restaura os mocks padrão (sucesso imediato, 200) para os arquivos seguintes.
create or replace function net.http_post(
  url text, body jsonb default '{}'::jsonb, params jsonb default '{}'::jsonb,
  headers jsonb default '{"Content-Type": "application/json"}'::jsonb, timeout_milliseconds integer default 5000
) returns bigint language sql as $$ select 1::bigint $$;

create or replace function net._http_collect_response(request_id bigint, async boolean default true)
returns net.http_response_result
language sql
as $$
  select row('SUCCESS'::net.request_status, null, row(200, '{}'::jsonb, '')::net.http_response)::net.http_response_result
$$;

-- Idempotência: reaplicar a migration não falha.
\ir ../migrations/20261006000009_linkly_disparo_timeout.sql
select public._test_assert(
  'migration reaplicada: grants continuam corretos',
  not has_function_privilege('authenticated', 'public.disparar_sincronizacao_linkly'::regproc, 'execute')
);

select 'todos os asserts de disparar_sincronizacao_linkly passaram' as status;

set role postgres;
drop function public._test_assert(text, boolean);
reset role;
