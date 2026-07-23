-- ============================================================================
-- Sistema de Gestão de Casos Operacionais — CVC
-- Migration: corrige leitura do status_code de net.http_collect_response
--
-- Erro em produção ao testar disparar_backup_dados_sensiveis():
--   ERROR: 42703: column "status_code" not found in data type net.http_response_result
--
-- Causa: a suposição original (herdada de purgar_anexos_retencao_vencida,
-- escrita antes de qualquer chamada real acontecer) era que
-- net.http_collect_response(request_id) devolvia um tipo com status_code no
-- topo. Confirmado contra a instalação real (pg_net 0.20.4, via
-- pg_attribute/pg_get_functiondef, não suposição):
--
--   net.http_response_result: status (net.request_status), message (text), response (net.http_response)
--   net.http_response:        status_code (integer), headers (jsonb), body (text)
--   net.request_status (enum): PENDING, SUCCESS, ERROR
--
-- Ou seja, o código HTTP mora em response.status_code, não no topo — e o
-- tipo ainda carrega um status de nível mais alto (o enum) que diz se a
-- requisição em si teve sucesso, timeout ou erro, independente do código
-- HTTP devolvido.
--
-- purgar_anexos_retencao_vencida() tem exatamente o mesmo bug, só nunca
-- executou essa linha em produção ainda: ela só chega ao net.http_delete
-- quando existe pelo menos um anexo elegível pra purga (caso resolvido há
-- mais de 90 dias), o que ainda não aconteceu — mas o bug está lá,
-- corrigido aqui também antes que aconteça de vez.
--
-- net.http_collect_response (a função pública) está marcada deprecated
-- pela própria definição (só chama net._http_collect_response por baixo e
-- emite um `raise notice`), mas continua sendo a API pública/suportada —
-- optei por manter o uso dela em vez de chamar net._http_collect_response
-- diretamente: funções com "_" no início são convenção de "privada/interna"
-- em pg_net, sem garantia nenhuma de estabilidade entre versões (podem
-- mudar de assinatura ou sumir sem aviso, diferente de uma função pública
-- deprecated, que normalmente fica disponível por várias versões até ser
-- removida de fato). Deprecated-mas-pública é mais estável a longo prazo
-- do que privada-mas-não-deprecated.
--
-- Segunda armadilha encontrada só ao testar de verdade (não aparece no
-- tsc/lint, nem por inspeção do SQL): `select net.http_collect_response(id)
-- into v_resposta` corrompe o valor quando v_resposta é uma variável de
-- tipo composto — o PL/pgSQL trata isso como um "SELECT col1, col2, col3
-- INTO ..." de 1 coluna só e tenta redistribuir os campos internos do
-- composto retornado nos campos de v_resposta, em vez de atribuir o
-- composto inteiro (reproduzido isoladamente: o enum status recebia a
-- representação em texto da linha inteira). `v_resposta :=
-- net.http_collect_response(id)` (atribuição direta, não SELECT INTO) é o
-- padrão correto para capturar o retorno de uma função que devolve tipo
-- composto em PL/pgSQL.
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
  -- tenta de novo).
  v_resposta := net.http_collect_response(v_request_id);

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

  v_resposta := net.http_collect_response(v_request_id);

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
