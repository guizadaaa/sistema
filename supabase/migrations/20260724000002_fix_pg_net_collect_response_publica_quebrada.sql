-- ============================================================================
-- Sistema de Gestão de Casos Operacionais — CVC
-- Migration: troca net.http_collect_response (pública) por net._http_collect_response
--
-- Erro novo em produção, depois de aplicar 20260724000001 (que já corrigira
-- a leitura de response.status_code e a troca de SELECT INTO por atribuição
-- direta):
--
--   ERROR: 42601: query has no destination for result data
--   HINT: If you want to discard the results of a SELECT, use PERFORM instead.
--   CONTEXT: PL/pgSQL function net.http_collect_response(bigint,boolean) line 4 at SQL statement
--            PL/pgSQL function disparar_backup_dados_sensiveis() line 26 at assignment
--
-- A CONTEXT deixa claro que o erro nasce DENTRO da própria
-- net.http_collect_response (linha 4), não na nossa função. Definição real
-- capturada em produção (via pg_get_functiondef, mesma técnica de antes):
--
--   CREATE OR REPLACE FUNCTION net.http_collect_response(request_id bigint, async boolean DEFAULT true)
--    RETURNS net.http_response_result
--    LANGUAGE plpgsql
--   AS $function$
--   begin
--     raise notice 'The net.http_collect_response function is deprecated.';
--     select net._http_collect_response(request_id, async);
--   end;
--   $function$
--
-- O corpo dessa função tem um `select` sem destino (nem INTO, nem PERFORM,
-- nem RETURN) dentro de um bloco plpgsql — isso é inválido e SEMPRE lança
-- "query has no destination for result data" quando chamada, não importa
-- como. Ou seja: a função pública "deprecated" está de fato quebrada nesta
-- versão do pg_net (0.20.4) instalada no projeto — não dá pra usá-la de
-- jeito nenhum, chamando corretamente ou não.
--
-- Reversão da decisão registrada em 20260724000001 (deprecated-mas-pública
-- > privada-mas-não-deprecated): esse raciocínio só vale quando a pública
-- funciona. Aqui ela não funciona — a única implementação utilizável é
-- net._http_collect_response diretamente. Mantém-se o registro de que isso
-- é uma dependência de uma função interna do pg_net (prefixo "_"), sem
-- garantia de estabilidade entre versões — se uma atualização futura do
-- pg_net remover ou mudar a assinatura dela, esta função vai quebrar nessa
-- linha; reavaliar nessa hora (o comportamento de http_collect_response
-- pode até ter sido corrigido a essa altura).
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
  -- tenta de novo). net._http_collect_response (privada) diretamente — a
  -- pública está quebrada nesta versão do pg_net, ver nota no topo.
  v_resposta := net._http_collect_response(v_request_id);

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

  -- net._http_collect_response (privada) diretamente — a pública está
  -- quebrada nesta versão do pg_net, ver nota no topo.
  v_resposta := net._http_collect_response(v_request_id);

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
