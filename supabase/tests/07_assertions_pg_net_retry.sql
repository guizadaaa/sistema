-- ============================================================================
-- Teste de regressão para o 3º bug de produção em sequência: pg_net é
-- assíncrono (net.http_post só enfileira) e coletar a resposta
-- imediatamente em seguida, sem esperar o worker processar, é uma corrida
-- — "request matching request_id not found" (retornado pelo próprio
-- pg_net como um resultado normal, status=ERROR, não uma exceção do
-- Postgres). Simula um pg_net que só fica pronto depois de algumas
-- tentativas, usando uma tabela temporária pra contar chamadas por
-- request_id (o mock padrão de sucesso imediato nunca exercitaria o loop
-- de retry).
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

create temporary table _test_pg_net_tentativas (req_id bigint primary key, tentativas integer not null default 0);

-- ----------------------------------------------------------------------------
-- Fica pronto na 3ª tentativa (2 "not found" + 1 sucesso) — o retry deve
-- absorver isso e a função terminar com sucesso.
-- ----------------------------------------------------------------------------

create or replace function net._http_collect_response(request_id bigint, async boolean default true)
returns net.http_response_result
language plpgsql
as $$
declare
  v_tentativas integer;
begin
  insert into _test_pg_net_tentativas (req_id, tentativas) values (request_id, 1)
  on conflict (req_id) do update set tentativas = _test_pg_net_tentativas.tentativas + 1
  returning tentativas into v_tentativas;

  if v_tentativas < 3 then
    return row('ERROR'::net.request_status, 'request matching request_id not found', null::net.http_response)::net.http_response_result;
  end if;

  return row('SUCCESS'::net.request_status, null, row(200, '{}'::jsonb, '')::net.http_response)::net.http_response_result;
end;
$$;

select public._test_assert(
  'disparar_backup_dados_sensiveis: retry absorve "not found" e termina com sucesso na 3a tentativa',
  public.disparar_backup_dados_sensiveis() = 200
);

truncate _test_pg_net_tentativas;

-- ----------------------------------------------------------------------------
-- Nunca fica pronto — o retry deve desistir depois de um número finito de
-- tentativas, com uma exceção clara (não travar pra sempre).
-- ----------------------------------------------------------------------------

create or replace function net._http_collect_response(request_id bigint, async boolean default true)
returns net.http_response_result
language sql
as $$
  select row('ERROR'::net.request_status, 'request matching request_id not found', null::net.http_response)::net.http_response_result
$$;

do $$
declare
  v_inicio timestamptz := clock_timestamp();
begin
  perform public.disparar_backup_dados_sensiveis();
  raise exception 'FALHOU: disparar_backup_dados_sensiveis nao desistiu quando a resposta nunca fica pronta';
exception when others then
  if sqlerrm like 'FALHOU:%' then raise; end if;
  -- confirma que desistiu (não travou pra sempre) e que esperou pelo menos
  -- um pouco entre tentativas, não uma sequência instantânea sem sentido.
  if clock_timestamp() - v_inicio < interval '0.5 seconds' then
    raise exception 'FALHOU: desistiu rápido demais — parece não ter esperado entre tentativas';
  end if;
  raise notice 'ok: disparar_backup_dados_sensiveis desiste apos tentativas esgotadas (nao trava para sempre)';
end
$$;

truncate _test_pg_net_tentativas;

-- ----------------------------------------------------------------------------
-- Erro genuíno (não é "not found") deve falhar rápido, sem esperar as 5
-- tentativas à toa por algo que não vai se resolver sozinho.
-- ----------------------------------------------------------------------------

create or replace function net._http_collect_response(request_id bigint, async boolean default true)
returns net.http_response_result
language sql
as $$
  select row('ERROR'::net.request_status, 'connection refused (erro real, nao timing)', null::net.http_response)::net.http_response_result
$$;

do $$
declare
  v_inicio timestamptz := clock_timestamp();
begin
  perform public.disparar_backup_dados_sensiveis();
  raise exception 'FALHOU: disparar_backup_dados_sensiveis nao levantou excecao com erro real simulado';
exception when others then
  if sqlerrm like 'FALHOU:%' then raise; end if;
  if clock_timestamp() - v_inicio > interval '0.3 seconds' then
    raise exception 'FALHOU: demorou pra falhar um erro que nao era "not found" — nao deveria ter tentado de novo';
  end if;
  raise notice 'ok: erro que nao e "not found" falha rapido, sem esperar tentativas a toa';
end
$$;

-- Restaura o mock de sucesso padrão para qualquer teste que rode depois.
create or replace function net._http_collect_response(request_id bigint, async boolean default true)
returns net.http_response_result
language sql
as $$
  select row('SUCCESS'::net.request_status, null, row(200, '{}'::jsonb, '')::net.http_response)::net.http_response_result
$$;

select 'todos os asserts de retry do pg_net passaram' as status;

drop function public._test_assert(text, boolean);
reset role;
