-- ============================================================================
-- Sistema de Gestão de Casos Operacionais — CVC
-- Migration: cliques por link do Linkly (QR da vitrine + link por vendedor)
--
-- Desenho aprovado pelo cliente: 4 contas/workspaces Linkly separados (uma
-- comum às 3 lojas, pro QR da vitrine física; três, uma por loja, cada uma
-- com um link por vendedor daquela loja), cada workspace com sua própria API
-- key (Vault). Quando um vendedor sai, o link físico não é recriado — é
-- reaproveitado pro próximo que assume aquele posto.
--
-- Três tabelas:
--
-- 1. linkly_links: registro dos links rastreados (Adm Master cadastra à
--    mão — a API do Linkly não nos diz "qual link é de qual vendedor", só
--    dá contagem de cliques). tipo 'vitrine' = QR comum às 3 lojas (sem
--    filial); tipo 'vendedor' = link de um posto específico de uma loja
--    (filial obrigatória).
--
-- 2. linkly_vendedor_mapeamento: vínculo HISTÓRICO link -> usuario_id (só
--    pra links tipo 'vendedor'). Mesmo espírito de vendedores_mapeamento
--    (vendas): nunca edita nem apaga o vínculo antigo quando o posto muda de
--    dono — abre uma linha NOVA. Diferença importante: aqui a troca de dono
--    é o caso de uso CENTRAL (não uma exceção rara), então em vez de INSERT
--    direto pelo client, a troca passa pela função atribuir_vendedor_link()
--    abaixo, que fecha a linha antiga (vigente_ate) e abre a nova numa única
--    transação — cliente nunca faz UPDATE/INSERT direto nesta tabela.
--
--    cliques_totais_no_inicio: snapshot do total de cliques do Linkly no
--    momento em que ESTE vendedor assumiu o link. Cliques do período de um
--    vendedor = total no fim do período (snapshot do PRÓXIMO vendedor que
--    assumiu, ou o total atual do Linkly se ainda for o vigente) menos este
--    snapshot — não depende de nenhum filtro de data na API do Linkly, só de
--    tirarmos a foto na hora da troca.
--
-- 3. linkly_cliques_totais: 1 linha por link, total de cliques bruto vindo
--    do Linkly (atualizado pela sincronização — ver
--    disparar_sincronizacao_linkly() e a Edge Function sincronizar-linkly).
--
-- A view linkly_cliques_por_periodo calcula o delta por período via window
-- function (lead) e só DEPOIS aplica a visibilidade por perfil — teria que
-- ser em duas camadas (subquery + WHERE externo) porque window function
-- roda sobre o resultado já filtrado pelo WHERE da MESMA query, e um
-- vendedor só vê a própria linha de linkly_vendedor_mapeamento: se o filtro
-- rodasse antes do lead(), o cálculo do período de vendedores anteriores
-- (que o vendedor atual não pode ver) ficaria invisível pro cálculo do
-- vendedor atual, quebrando o encadeamento.
-- ============================================================================

create table public.linkly_links (
  id uuid primary key default gen_random_uuid(),
  workspace_secret text not null,
  linkly_link_id text not null,
  short_url text not null,
  tipo text not null check (tipo in ('vendedor', 'vitrine')),
  filial filial_cvc,
  criado_por uuid not null references public.usuarios (id),
  criado_em timestamptz not null default now(),

  unique (linkly_link_id),
  constraint linkly_links_filial_por_tipo check (
    (tipo = 'vendedor' and filial is not null)
    or (tipo = 'vitrine' and filial is null)
  )
);

comment on table public.linkly_links is
  'Registro dos links do Linkly rastreados pelo sistema — cadastro manual (Adm Master), a API do Linkly não expõe "dono" do link. workspace_secret é o nome do secret no Vault com a API key do workspace/conta Linkly desse link.';
comment on column public.linkly_links.workspace_secret is
  'Nome do secret no Vault (ex.: linkly_api_key_1730, linkly_api_key_vitrine) — não a key em si.';

create function public.set_linkly_link_criado_por()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  new.criado_por := auth.uid();
  return new;
end;
$$;

create trigger linkly_links_set_criado_por
  before insert on public.linkly_links
  for each row execute function public.set_linkly_link_criado_por();

create table public.linkly_cliques_totais (
  link_id uuid primary key references public.linkly_links (id),
  total_cliques bigint not null default 0,
  atualizado_em timestamptz not null default now()
);

comment on table public.linkly_cliques_totais is
  'Total bruto de cliques por link, vindo da API do Linkly — só a sincronização (service_role) escreve aqui.';

create table public.linkly_vendedor_mapeamento (
  id uuid primary key default gen_random_uuid(),
  link_id uuid not null references public.linkly_links (id),
  usuario_id uuid not null references public.usuarios (id),
  cliques_totais_no_inicio bigint not null default 0,
  vigente_desde date not null default current_date,
  vigente_ate date,
  criado_por uuid not null references public.usuarios (id),
  criado_em timestamptz not null default now(),

  constraint linkly_vendedor_mapeamento_periodo_valido
    check (vigente_ate is null or vigente_desde <= vigente_ate)
);

create index linkly_vendedor_mapeamento_link_idx
  on public.linkly_vendedor_mapeamento (link_id, vigente_desde);

comment on table public.linkly_vendedor_mapeamento is
  'Vínculo histórico link -> usuario_id, só pra linkly_links.tipo = ''vendedor''. Escrita exclusiva via atribuir_vendedor_link() — nunca INSERT/UPDATE direto do client (a troca de dono precisa fechar a linha antiga e abrir a nova atomicamente).';
comment on column public.linkly_vendedor_mapeamento.cliques_totais_no_inicio is
  'Snapshot de linkly_cliques_totais.total_cliques no momento em que este vendedor assumiu o link — base pro cálculo de cliques do período.';

-- ----------------------------------------------------------------------------
-- Trigger de segurança (defesa em profundidade): bloqueia duas linhas do
-- mesmo link com período sobreposto, mesmo padrão de validate_delegacao /
-- validate_vendedor_mapeamento. Na prática nunca deveria disparar — a
-- própria atribuir_vendedor_link() já fecha a linha antiga antes de abrir a
-- nova — mas protege contra um INSERT direto via service_role/bug futuro.
-- ----------------------------------------------------------------------------

create function public.validate_linkly_vendedor_mapeamento()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if exists (
    select 1 from public.linkly_vendedor_mapeamento m
    where m.link_id = new.link_id
      and coalesce(m.vigente_desde, '-infinity'::date) <= coalesce(new.vigente_ate, 'infinity'::date)
      and coalesce(new.vigente_desde, '-infinity'::date) <= coalesce(m.vigente_ate, 'infinity'::date)
  ) then
    raise exception 'Já existe um vínculo vigente para este link em período sobreposto.';
  end if;
  return new;
end;
$$;

create trigger linkly_vendedor_mapeamento_validate
  before insert on public.linkly_vendedor_mapeamento
  for each row execute function public.validate_linkly_vendedor_mapeamento();

-- ----------------------------------------------------------------------------
-- atribuir_vendedor_link: único caminho de escrita em
-- linkly_vendedor_mapeamento pro client. Fecha a linha vigente (se houver) e
-- abre uma nova, na mesma transação — atômico, sem depender de duas
-- chamadas separadas do client (que poderiam aplicar só uma metade).
-- ----------------------------------------------------------------------------

create function public.atribuir_vendedor_link(
  p_link_id uuid,
  p_usuario_id uuid,
  p_vigente_desde date default current_date
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ativo record;
  v_total_atual bigint;
  v_novo_id uuid;
begin
  if not public.auth_is_adm_master() then
    raise exception 'Apenas Adm Master pode atribuir vendedor a um link.';
  end if;

  if not exists (select 1 from public.linkly_links where id = p_link_id and tipo = 'vendedor') then
    raise exception 'Link não encontrado ou não é do tipo "vendedor".';
  end if;

  select * into v_ativo
  from public.linkly_vendedor_mapeamento
  where link_id = p_link_id and vigente_ate is null
  order by vigente_desde desc
  limit 1;

  if found and v_ativo.usuario_id = p_usuario_id then
    raise exception 'Este vendedor já é o responsável vigente por este link.';
  end if;

  if found and v_ativo.vigente_desde >= p_vigente_desde then
    raise exception 'A data informada (%) precisa ser posterior ao início do vínculo vigente (%).', p_vigente_desde, v_ativo.vigente_desde;
  end if;

  if found then
    update public.linkly_vendedor_mapeamento
    set vigente_ate = p_vigente_desde - 1
    where id = v_ativo.id;
  end if;

  select coalesce(max(total_cliques), 0) into v_total_atual
  from public.linkly_cliques_totais
  where link_id = p_link_id;

  insert into public.linkly_vendedor_mapeamento
    (link_id, usuario_id, cliques_totais_no_inicio, vigente_desde, vigente_ate, criado_por)
  values
    (p_link_id, p_usuario_id, v_total_atual, p_vigente_desde, null, auth.uid())
  returning id into v_novo_id;

  return v_novo_id;
end;
$$;

comment on function public.atribuir_vendedor_link(uuid, uuid, date) is
  'Atribui (ou reatribui) o vendedor responsável por um link — fecha o vínculo vigente anterior (se houver) e abre um novo, com snapshot do total de cliques atual. Único caminho de escrita em linkly_vendedor_mapeamento pro client.';

revoke execute on function public.atribuir_vendedor_link(uuid, uuid, date) from public;
grant execute on function public.atribuir_vendedor_link(uuid, uuid, date) to authenticated;

-- ----------------------------------------------------------------------------
-- Vault: API key por workspace do Linkly. Parametrizada (4 secrets
-- diferentes, um por workspace) — mesmo padrão de obter_backup_encryption_key,
-- mas recebendo o nome do secret em vez de um nome fixo.
-- ----------------------------------------------------------------------------

create function public.obter_linkly_api_key(p_nome_secret text)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select decrypted_secret from vault.decrypted_secrets where name = p_nome_secret;
$$;

comment on function public.obter_linkly_api_key(text) is
  'Só a Edge Function de sincronização (via service_role) deve chamar isto — nunca exposta a authenticated/anon.';

revoke execute on function public.obter_linkly_api_key(text) from public;
grant execute on function public.obter_linkly_api_key(text) to service_role;

-- ----------------------------------------------------------------------------
-- Disparo da sincronização — PROCEDURE (não function): precisa de COMMIT
-- entre o net.http_post e a coleta da resposta pro worker do pg_net
-- conseguir ver a requisição enfileirada (mesma causa raiz e mesmo fix de
-- disparar_backup_dados_sensiveis, 20260724000004/20260724000005 — commit
-- só é permitido dentro de procedure SEM security definer e SEM cláusula
-- set, então esta procedure roda com o privilégio de quem a chama
-- (pg_cron/SQL Editor, sempre postgres) em vez de elevar via security
-- definer). Chamar com CALL, não SELECT.
-- ----------------------------------------------------------------------------

create procedure public.disparar_sincronizacao_linkly(out p_status_code integer)
language plpgsql
as $$
declare
  v_service_role_key text;
  v_supabase_url text := 'https://csquqrcmctcyxfxlmdwk.supabase.co';
  v_request_id bigint;
  v_resposta net.http_response_result;
  v_tentativas integer := 0;
begin
  select decrypted_secret into v_service_role_key
  from vault.decrypted_secrets
  where name = 'service_role_key';

  if v_service_role_key is null then
    raise exception 'Secret "service_role_key" não encontrado no Vault — configure antes de agendar esta rotina no pg_cron.';
  end if;

  select net.http_post(
    url := v_supabase_url || '/functions/v1/sincronizar-linkly',
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || v_service_role_key,
      'Content-Type', 'application/json'
    ),
    body := '{}'::jsonb
  ) into v_request_id;

  -- Commit obrigatório — ver nota no topo desta procedure.
  commit;

  -- Janela de retry medida em produção pra disparar_backup_dados_sensiveis
  -- (20260724000005): 15 tentativas x 0.5s = até 7.5s, ~3.7x o delay real
  -- observado (2.03s). Reaproveitada aqui pelo mesmo mecanismo (pg_net).
  loop
    v_resposta := net._http_collect_response(v_request_id);
    exit when v_resposta.status <> 'ERROR' or v_resposta.message not ilike '%not found%';
    v_tentativas := v_tentativas + 1;
    exit when v_tentativas >= 15;
    perform pg_sleep(0.5);
  end loop;

  if v_resposta.status <> 'SUCCESS' then
    raise exception 'Falha ao disparar sincronização do Linkly — requisição não teve sucesso (status %, mensagem: %).',
      v_resposta.status, v_resposta.message;
  end if;

  p_status_code := (v_resposta.response).status_code;

  if p_status_code is null or p_status_code >= 300 then
    raise exception 'Falha ao disparar sincronização do Linkly (HTTP status %).', p_status_code;
  end if;
end;
$$;

comment on procedure public.disparar_sincronizacao_linkly(out integer) is
  'Chamar via pg_cron (ver supabase/linkly/ATIVACAO.md) com CALL (não SELECT — é procedure) para atualizar linkly_cliques_totais. Não agendado nesta migration. Para o botão "Atualizar agora" (Adm/Adm Master), o Next.js chama a Edge Function diretamente — ver src/lib/linkly/sincronizar.ts — não esta procedure, que só existe pro contexto de trigger interno (pg_cron/SQL Editor).';

revoke all on procedure public.disparar_sincronizacao_linkly(out integer) from public;
grant execute on procedure public.disparar_sincronizacao_linkly(out integer) to postgres, service_role;

-- ----------------------------------------------------------------------------
-- RLS
-- ----------------------------------------------------------------------------

alter table public.linkly_links enable row level security;

create policy linkly_links_select
  on public.linkly_links for select to authenticated
  using (public.auth_is_adm_master());

create policy linkly_links_insert
  on public.linkly_links for insert to authenticated
  with check (public.auth_is_adm_master());

create policy linkly_links_update
  on public.linkly_links for update to authenticated
  using (public.auth_is_adm_master())
  with check (public.auth_is_adm_master());

alter table public.linkly_vendedor_mapeamento enable row level security;

-- Sem policy de INSERT/UPDATE — escrita exclusiva via atribuir_vendedor_link()
-- (security definer, bypassa RLS). SELECT liberado pro adm_master ver o
-- histórico completo na tela de mapeamento.
create policy linkly_vendedor_mapeamento_select
  on public.linkly_vendedor_mapeamento for select to authenticated
  using (public.auth_is_adm_master());

alter table public.linkly_cliques_totais enable row level security;
-- Sem nenhuma policy — só a view linkly_cliques_por_periodo/linkly_cliques_vitrine
-- (e service_role) leem esta tabela.

-- ----------------------------------------------------------------------------
-- Views: mesmo padrão de segurança de vendas_com_vendedor — a tabela crua
-- não tem policy de select pra authenticated, a visibilidade mora no WHERE
-- da view.
-- ----------------------------------------------------------------------------

create view public.linkly_cliques_por_periodo as
select *
from (
  select
    m.id as mapeamento_id,
    m.link_id,
    l.filial,
    l.short_url,
    m.usuario_id,
    m.vigente_desde,
    m.vigente_ate,
    m.cliques_totais_no_inicio,
    coalesce(
      lead(m.cliques_totais_no_inicio) over (partition by m.link_id order by m.vigente_desde),
      ct.total_cliques
    ) as cliques_totais_no_fim,
    coalesce(
      lead(m.cliques_totais_no_inicio) over (partition by m.link_id order by m.vigente_desde),
      ct.total_cliques
    ) - m.cliques_totais_no_inicio as cliques_periodo,
    ct.atualizado_em as cliques_atualizado_em
  from public.linkly_vendedor_mapeamento m
  join public.linkly_links l on l.id = m.link_id
  join public.linkly_cliques_totais ct on ct.link_id = m.link_id
) sub
where
  public.auth_is_admin()
  or (public.auth_ativo() and public.auth_perfil() = 'gerente' and sub.filial = public.auth_filial())
  or (public.auth_ativo() and sub.usuario_id = auth.uid());

comment on view public.linkly_cliques_por_periodo is
  'Cliques por período de cada vendedor num link — cliques_periodo é o delta entre o snapshot de início deste período e o snapshot de início do PRÓXIMO período (ou o total atual, se este ainda for o período vigente). Window function calculada ANTES do filtro de visibilidade (subquery) — ver nota no topo da migration.';

create view public.linkly_cliques_vitrine as
select l.id as link_id, l.short_url, ct.total_cliques, ct.atualizado_em
from public.linkly_links l
join public.linkly_cliques_totais ct on ct.link_id = l.id
where l.tipo = 'vitrine' and public.auth_is_admin();

comment on view public.linkly_cliques_vitrine is
  'Cliques do(s) link(s) tipo vitrine (comum às lojas, sem vendedor associado) — visível só para Adm/Adm Master.';

grant select, insert, update on public.linkly_links to authenticated;
grant select, insert, update, delete on public.linkly_links to service_role;

grant select on public.linkly_vendedor_mapeamento to authenticated;
grant select, insert, update, delete on public.linkly_vendedor_mapeamento to service_role;

grant select, insert, update, delete on public.linkly_cliques_totais to service_role;

grant select on public.linkly_cliques_por_periodo to authenticated, service_role;
grant select on public.linkly_cliques_vitrine to authenticated, service_role;
