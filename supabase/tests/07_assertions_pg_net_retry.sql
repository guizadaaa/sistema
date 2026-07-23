-- ============================================================================
-- Teste de regressão para o retry ao coletar resposta assíncrona do pg_net
-- (20260724000003) — pg_net é assíncrono (net.http_post só enfileira) e
-- coletar a resposta imediatamente em seguida, sem esperar o worker
-- processar, é uma corrida — "request matching request_id not found"
-- (retornado pelo próprio pg_net como um resultado normal, status=ERROR,
-- não uma exceção do Postgres). Simula um pg_net que só fica pronto depois
-- de algumas tentativas, usando uma tabela temporária pra contar chamadas
-- por request_id (o mock padrão de sucesso imediato nunca exercitaria o
-- loop de retry).
--
-- Desde 20260724000004, purgar_anexos_retencao_vencida e
-- disparar_backup_dados_sensiveis são PROCEDURES (não functions) — o commit
-- explícito que elas dão logo após enfileirar (necessário para o worker do
-- pg_net enxergar a requisição — ver essa migration e
-- scripts/test-pg-net-commit-visibilidade.sh) só é permitido dentro de
-- procedures/blocos DO no nível mais alto, não dentro de functions. Por
-- serem procedures, chamam-se com CALL, e não dá pra envolver esse CALL num
-- bloco `exception when others` (o commit interno conflita com a
-- subtransação implícita que um bloco com EXCEPTION cria — "invalid
-- transaction termination"). Por isso os testes de falha abaixo desligam
-- `ON_ERROR_STOP` só para o CALL problemático e conferem a variável
-- automática `:ERROR` do psql, e usam `\gset` pra capturar timestamps
-- antes/depois em vez de medir dentro de um bloco plpgsql.
--
-- Desde 20260724000005, a janela é 15 tentativas x 0.5s (até ~7.5s) em vez
-- de 5 x 0.4s (~2s) — dimensionada com medição real em produção (delay
-- observado: resolvido na 3a tentativa, 2.03s), não mais uma estimativa.
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
-- absorver isso e a procedure terminar com sucesso.
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

do $$
declare
  v_status integer;
begin
  call public.disparar_backup_dados_sensiveis(v_status);
  perform public._test_assert(
    'disparar_backup_dados_sensiveis: retry absorve "not found" e termina com sucesso na 3a tentativa',
    v_status = 200
  );
end
$$;

truncate _test_pg_net_tentativas;

-- ----------------------------------------------------------------------------
-- Nunca fica pronto — o retry deve desistir depois de um número finito de
-- tentativas, com uma exceção clara (não travar pra sempre), e sem desistir
-- rápido demais (confirma que esperou entre tentativas).
-- ----------------------------------------------------------------------------

create or replace function net._http_collect_response(request_id bigint, async boolean default true)
returns net.http_response_result
language sql
as $$
  select row('ERROR'::net.request_status, 'request matching request_id not found', null::net.http_response)::net.http_response_result
$$;

select clock_timestamp() as t_inicio_nunca_pronto \gset

\set ON_ERROR_STOP 0
call public.disparar_backup_dados_sensiveis(null);
\set ON_ERROR_STOP 1

-- Captura :ERROR JUNTO com o timestamp final, na mesma instrução — se
-- fossem duas instruções separadas, a segunda (mesmo um SELECT inofensivo)
-- já teria resetado :ERROR para 'false' ao suceder, mascarando o resultado
-- do CALL anterior.
select clock_timestamp() as t_fim_nunca_pronto, :'ERROR' as v_erro_nunca_pronto \gset

select public._test_assert(
  'disparar_backup_dados_sensiveis: desiste apos tentativas esgotadas quando resposta nunca fica pronta (nao trava para sempre)',
  :'v_erro_nunca_pronto' = 'true'
);

select public._test_assert(
  'disparar_backup_dados_sensiveis: nao desistiu rapido demais — esperou entre tentativas antes de desistir (janela de ~7.5s, 15x0.5s)',
  (:'t_fim_nunca_pronto'::timestamptz - :'t_inicio_nunca_pronto'::timestamptz) >= interval '6 seconds'
);

truncate _test_pg_net_tentativas;

-- ----------------------------------------------------------------------------
-- Erro genuíno (não é "not found") deve falhar rápido, sem esperar as 15
-- tentativas à toa por algo que não vai se resolver sozinho.
-- ----------------------------------------------------------------------------

create or replace function net._http_collect_response(request_id bigint, async boolean default true)
returns net.http_response_result
language sql
as $$
  select row('ERROR'::net.request_status, 'connection refused (erro real, nao timing)', null::net.http_response)::net.http_response_result
$$;

select clock_timestamp() as t_inicio_erro_real \gset

\set ON_ERROR_STOP 0
call public.disparar_backup_dados_sensiveis(null);
\set ON_ERROR_STOP 1

select clock_timestamp() as t_fim_erro_real, :'ERROR' as v_erro_erro_real \gset

select public._test_assert(
  'disparar_backup_dados_sensiveis: levanta excecao com erro real simulado (nao "not found")',
  :'v_erro_erro_real' = 'true'
);

select public._test_assert(
  'disparar_backup_dados_sensiveis: erro que nao e "not found" falha rapido, sem esperar tentativas a toa',
  (:'t_fim_erro_real'::timestamptz - :'t_inicio_erro_real'::timestamptz) < interval '0.3 seconds'
);

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
