-- ============================================================================
-- Sistema de Gestão de Casos Operacionais — CVC
-- Migration: retry ao coletar resposta assíncrona do pg_net
--
-- Erro novo em produção depois de 20260724000002:
--   ERROR: P0001: Falha ao disparar backup de dados sensíveis — requisição
--   não teve sucesso (status ERROR, mensagem: request matching request_id
--   not found).
--
-- Causa: net.http_post (e net.http_delete) só ENFILEIRAM a requisição — um
-- worker assíncrono do pg_net processa a fila e só depois grava a resposta
-- (é isso que "assíncrono" quer dizer). Chamar
-- net._http_collect_response(request_id) imediatamente em seguida, sem
-- esperar nada, é uma corrida: se o worker ainda não processou aquele item
-- da fila, não existe resposta nenhuma pra encontrar ainda — daí "request
-- matching request_id not found" (essa mensagem vem do próprio pg_net,
-- retornada como um resultado normal com status=ERROR, não uma exceção do
-- Postgres — por isso o erro anterior não foi pego na correção passada).
--
-- Fix: espera curta com algumas tentativas antes de desistir, em vez de
-- coletar uma única vez. Só repete quando a mensagem é especificamente
-- "not found" (a corrida esperada) — qualquer outro erro (timeout de
-- verdade, DNS, TLS etc.) ainda falha na primeira tentativa, sem esperar à
-- toa por algo que não vai se resolver sozinho.
-- ============================================================================

create or replace function public.purgar_anexos_retencao_vencida()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ids uuid[];
  v_paths text[];
  v_service_role_key text;
  v_supabase_url text := 'https://csquqrcmctcyxfxlmdwk.supabase.co';
  v_request_id bigint;
  v_resposta net.http_response_result;
  v_status_code integer;
  v_tentativas integer := 0;
begin
  select array_agg(a.id), array_agg(a.storage_path)
  into v_ids, v_paths
  from public.anexos a
  join public.casos c on c.id = a.caso_id
  join lateral (
    select sh.entrou_em
    from public.status_historico sh
    where sh.caso_id = c.id and sh.status = 'resolvido'
    order by sh.entrou_em desc
    limit 1
  ) ultimo_resolvido on true
  where a.excluido_em is null
    and a.storage_path is not null
    and c.status_atual = 'resolvido'
    and ultimo_resolvido.entrou_em < now() - interval '90 days';

  if v_ids is null or array_length(v_ids, 1) is null then
    return 0;
  end if;

  select decrypted_secret into v_service_role_key
  from vault.decrypted_secrets
  where name = 'service_role_key';

  if v_service_role_key is null then
    raise exception 'Secret "service_role_key" não encontrado no Vault — configure antes de agendar esta função no pg_cron (ver instruções de ativação).';
  end if;

  -- Exclusão em lote via Storage API (mesmo endpoint que o app usa em
  -- validarEEnviarAnexos/upload — não um DELETE direto em storage.objects).
  select net.http_delete(
    url := v_supabase_url || '/storage/v1/object/anexos',
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || v_service_role_key,
      'apikey', v_service_role_key,
      'Content-Type', 'application/json'
    ),
    body := jsonb_build_object('prefixes', v_paths)
  ) into v_request_id;

  -- Espera a resposta antes de marcar qualquer linha como excluída — se o
  -- Storage falhar, nada aqui é considerado purgado (a próxima execução
  -- tenta de novo). net.http_post/http_delete são assíncronos — até 5
  -- tentativas com 0.4s de intervalo (2s no total) antes de desistir,
  -- só quando a resposta ainda não foi encontrada (corrida esperada).
  loop
    v_resposta := net._http_collect_response(v_request_id);
    exit when v_resposta.status <> 'ERROR' or v_resposta.message not ilike '%not found%';
    v_tentativas := v_tentativas + 1;
    exit when v_tentativas >= 5;
    perform pg_sleep(0.4);
  end loop;

  if v_resposta.status <> 'SUCCESS' then
    raise exception 'Falha ao excluir anexos no Storage — requisição não teve sucesso (status %, mensagem: %). Nenhuma linha foi marcada como excluída nesta execução.',
      v_resposta.status, v_resposta.message;
  end if;

  v_status_code := (v_resposta.response).status_code;

  if v_status_code is null or v_status_code >= 300 then
    raise exception 'Falha ao excluir anexos no Storage (HTTP status %) — nenhuma linha foi marcada como excluída nesta execução.', v_status_code;
  end if;

  update public.anexos
  set storage_path = null, nome_arquivo = null, excluido_em = now()
  where id = any(v_ids);

  return array_length(v_ids, 1);
end;
$$;

comment on function public.purgar_anexos_retencao_vencida() is
  'LGPD §12 — purga (Storage + colunas sensíveis) anexos de casos resolvidos há mais de 90 dias. Chamar manualmente para testar antes de agendar via pg_cron (ver instruções de ativação — não incluídas nesta migration por envolverem a service_role key).';

create or replace function public.disparar_backup_dados_sensiveis()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_service_role_key text;
  v_supabase_url text := 'https://csquqrcmctcyxfxlmdwk.supabase.co';
  v_request_id bigint;
  v_resposta net.http_response_result;
  v_status_code integer;
  v_tentativas integer := 0;
begin
  select decrypted_secret into v_service_role_key
  from vault.decrypted_secrets
  where name = 'service_role_key';

  if v_service_role_key is null then
    raise exception 'Secret "service_role_key" não encontrado no Vault — configure antes de agendar esta função no pg_cron.';
  end if;

  select net.http_post(
    url := v_supabase_url || '/functions/v1/backup-dados-sensiveis',
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || v_service_role_key,
      'Content-Type', 'application/json'
    ),
    body := '{}'::jsonb
  ) into v_request_id;

  -- net.http_post é assíncrono (só enfileira) — até 5 tentativas com 0.4s
  -- de intervalo (2s no total) antes de desistir, só quando a resposta
  -- ainda não foi encontrada (corrida esperada com o worker do pg_net).
  loop
    v_resposta := net._http_collect_response(v_request_id);
    exit when v_resposta.status <> 'ERROR' or v_resposta.message not ilike '%not found%';
    v_tentativas := v_tentativas + 1;
    exit when v_tentativas >= 5;
    perform pg_sleep(0.4);
  end loop;

  if v_resposta.status <> 'SUCCESS' then
    raise exception 'Falha ao disparar backup de dados sensíveis — requisição não teve sucesso (status %, mensagem: %).',
      v_resposta.status, v_resposta.message;
  end if;

  v_status_code := (v_resposta.response).status_code;

  if v_status_code is null or v_status_code >= 300 then
    raise exception 'Falha ao disparar backup de dados sensíveis (HTTP status %).', v_status_code;
  end if;

  return v_status_code;
end;
$$;

comment on function public.disparar_backup_dados_sensiveis() is
  'Chamar via pg_cron (semanal — ver supabase/backups/RESTAURACAO.md) para exportar+criptografar+subir o backup e limpar retenção antiga. Não agendado nesta migration.';
