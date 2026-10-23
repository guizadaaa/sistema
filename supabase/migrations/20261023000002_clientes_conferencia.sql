-- ============================================================================
-- Aura Conferência (extensão do Systur) — Etapa 1: dados de clientes
--
-- A extensão de Edge "Aura Conferência" coleta no Systur (com o usuário
-- logado) as excursões confirmadas, os dados de conferência por reserva e os
-- recibos do dia, e envia para as rotas /api/conferencia/*. Esta migration
-- cria onde isso é guardado:
--
--   clientes               contratante (chave: pessoa_id_systur)
--   cliente_excursoes      uma linha por reserva (upsert por reserva)
--   cliente_voo_eventos    histórico de mudanças do retrato dos voos
--   recibos                recibos do dia (upsert por recibo) + PDF
--   mensagem_modelos       textos de mensagem (recompra, venda adicional...)
--   conferencia_config     linha única (versão da extensão, logins que gravam)
--   conferencia_reportes   problemas relatados pelos vendedores
--   storage "recibos"      PDFs: {loja}/{aaaa}/{mm}/{recibo}.pdf
--
-- Quem vê o quê (mesma regra em todas as tabelas de dados):
--   vendedor  linhas com vendedor_usuario_id = ele;
--   gerente   linhas da loja dele (usuarios.filial — o vínculo de loja que já
--             existe; um usuário tem uma loja só);
--   admin     tudo (auth_is_admin(): adm e adm_master).
-- Escrita nas tabelas de dados: só service_role (rotas da API), via as
-- funções conferencia_* abaixo — nunca direto do cliente.
--
-- Idempotente (if not exists / create or replace / drop policy if exists).
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Visibilidade
-- ----------------------------------------------------------------------------

create or replace function public.usuario_pode_ver_conferencia(p_usuario uuid, p_loja filial_cvc, p_vendedor uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.usuarios u
    where u.id = p_usuario
      and u.ativo
      and (
        u.perfil in ('adm', 'adm_master')
        or (u.perfil = 'gerente' and u.filial = p_loja)
        or (p_vendedor is not null and p_vendedor = u.id)
      )
  );
$$;

create or replace function public.auth_pode_ver_conferencia(p_loja filial_cvc, p_vendedor uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.usuario_pode_ver_conferencia(auth.uid(), p_loja, p_vendedor);
$$;

revoke all on function public.usuario_pode_ver_conferencia(uuid, filial_cvc, uuid) from public, anon, authenticated;
grant execute on function public.usuario_pode_ver_conferencia(uuid, filial_cvc, uuid) to service_role;
revoke all on function public.auth_pode_ver_conferencia(filial_cvc, uuid) from public, anon;
grant execute on function public.auth_pode_ver_conferencia(filial_cvc, uuid) to authenticated, service_role;

-- ----------------------------------------------------------------------------
-- Tabelas
-- ----------------------------------------------------------------------------

create table if not exists public.clientes (
  id uuid primary key default gen_random_uuid(),
  pessoa_id_systur text unique,
  nome text not null,
  nome_normalizado text generated always as (public.normalizar_nome(nome)) stored,
  cpf text,
  telefones jsonb not null default '[]'::jsonb,
  loja_principal filial_cvc,
  vendedor_usuario_id uuid references public.usuarios (id),
  primeira_compra date,
  ultima_compra date,
  total_comprado numeric(14, 2) not null default 0,
  revisar boolean not null default false,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

comment on table public.clientes is
  'Contratantes vindos do Systur (Aura Conferência). Casamento: pessoa_id_systur; sem ele, nome normalizado + telefone; ambíguo = cliente novo com revisar = true. loja_principal/vendedor_usuario_id = compra mais recente.';
comment on column public.clientes.telefones is '[{numero, tipo, contato}]';
comment on column public.clientes.cpf is 'Ainda não vem do Systur — reservado para casar com outras fontes no futuro.';

create index if not exists clientes_nome_normalizado_idx on public.clientes (nome_normalizado);
create index if not exists clientes_vendedor_idx on public.clientes (vendedor_usuario_id);

create table if not exists public.cliente_excursoes (
  reserva text primary key,
  roteiro text,
  excursao text,
  categoria_codigo smallint,
  loja filial_cvc not null,
  recibos text[] not null default '{}',
  vendedor_nome_systur text,
  vendedor_usuario_id uuid references public.usuarios (id),
  cliente_id uuid references public.clientes (id),
  contratantes jsonb not null default '[]'::jsonb,
  destino text,
  descricao text,
  data_viagem date,
  data_retorno date,
  data_confirmacao date,
  voucher_status text,
  reserva_site boolean,
  status_voos text,
  alteracoes jsonb,
  avisos jsonb,
  pendencias jsonb,
  servicos jsonb,
  apolices jsonb,
  retrato_voos jsonb,
  avisar_cliente boolean not null default false,
  aviso jsonb,
  cliente_avisado_em timestamptz,
  cliente_avisado_por uuid references public.usuarios (id),
  conferido_em timestamptz,
  atualizado_por uuid references public.usuarios (id),
  login_systur text,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

comment on table public.cliente_excursoes is
  'Uma linha por reserva do Systur. Campos de conferência ausentes no envio não apagam o que já existe (consulta só por data de confirmação = histórico).';
comment on column public.cliente_excursoes.categoria_codigo is
  '1º dígito da excursão: 5 aéreo nac., 2 terrestre nac., 4 pacote exclusivo, 9 internacional, 8 cruzeiro, 7 rodoviário, 3 rodoaéreo.';
comment on column public.cliente_excursoes.cliente_id is 'Contratante principal (primeiro de contratantes).';
comment on column public.cliente_excursoes.login_systur is
  'Login do Systur informado no último sync desta reserva (só registro — não autoriza nada).';

create index if not exists cliente_excursoes_cliente_idx on public.cliente_excursoes (cliente_id);
create index if not exists cliente_excursoes_vendedor_idx on public.cliente_excursoes (vendedor_usuario_id);
create index if not exists cliente_excursoes_loja_vendedor_nome_idx on public.cliente_excursoes (loja, vendedor_nome_systur);
create index if not exists cliente_excursoes_recibos_idx on public.cliente_excursoes using gin (recibos);

create table if not exists public.cliente_voo_eventos (
  id uuid primary key default gen_random_uuid(),
  reserva text not null references public.cliente_excursoes (reserva) on delete cascade,
  quando timestamptz not null default now(),
  alteracoes jsonb not null default '[]'::jsonb,
  significativa boolean not null default false,
  retrato_antes jsonb,
  retrato_depois jsonb,
  registrado_por uuid references public.usuarios (id)
);

comment on table public.cliente_voo_eventos is
  'Gravado quando o retrato_voos recebido difere do salvo. significativa = a extensão marcou avisar_cliente (mudança > 15 min).';

create index if not exists cliente_voo_eventos_reserva_idx on public.cliente_voo_eventos (reserva, quando desc);

create table if not exists public.recibos (
  recibo text primary key check (recibo ~ '^[0-9]+$'),
  numero text,
  loja filial_cvc not null,
  data_venda date,
  valor numeric(14, 2),
  cliente_nome text,
  cliente_id uuid references public.clientes (id),
  vendedor_usuario_id uuid references public.usuarios (id),
  pdf_path text,
  pdf_enviado_em timestamptz,
  pdf_enviado_por uuid references public.usuarios (id),
  atualizado_por uuid references public.usuarios (id),
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

comment on table public.recibos is
  'Recibos do dia (Emissão de Recibo no Systur). recibo = só dígitos (17100000161708); numero = como o Systur exibe (1710-0000161708). vendedor_usuario_id vem da reserva cujo cliente_excursoes.recibos contém o número.';

create index if not exists recibos_cliente_idx on public.recibos (cliente_id);
create index if not exists recibos_vendedor_idx on public.recibos (vendedor_usuario_id);

create table if not exists public.mensagem_modelos (
  id uuid primary key default gen_random_uuid(),
  chave text not null unique,
  titulo text not null,
  texto text not null default '',
  ativo boolean not null default true,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

comment on table public.mensagem_modelos is 'Modelos de mensagem para clientes (aba Clientes). Escrita só admin.';

insert into public.mensagem_modelos (chave, titulo) values
  ('recompra', 'Recompra'),
  ('venda_adicional', 'Venda adicional')
on conflict (chave) do nothing;

create table if not exists public.conferencia_config (
  id boolean primary key default true check (id),
  versao_atual text,
  logins_gravacao text[] not null default '{SPBG0007,CWBG0109}',
  atualizado_em timestamptz not null default now()
);

comment on table public.conferencia_config is
  'Linha única. versao_atual = versão publicada da extensão; logins_gravacao = logins do Systur autorizados a gravar (sync).';

insert into public.conferencia_config (id, versao_atual) values (true, '0.11.0') on conflict (id) do nothing;

create table if not exists public.conferencia_reportes (
  id uuid primary key default gen_random_uuid(),
  usuario_id uuid not null references public.usuarios (id),
  criado_em timestamptz not null default now(),
  texto text not null,
  diagnostico jsonb
);

comment on table public.conferencia_reportes is 'Problemas relatados pelos vendedores na extensão (POST /api/conferencia/reporte).';

-- atualizado_em automático (set_atualizado_em já existe — 20260716000001).
drop trigger if exists clientes_set_atualizado_em on public.clientes;
create trigger clientes_set_atualizado_em before update on public.clientes
  for each row execute function public.set_atualizado_em();
drop trigger if exists cliente_excursoes_set_atualizado_em on public.cliente_excursoes;
create trigger cliente_excursoes_set_atualizado_em before update on public.cliente_excursoes
  for each row execute function public.set_atualizado_em();
drop trigger if exists recibos_set_atualizado_em on public.recibos;
create trigger recibos_set_atualizado_em before update on public.recibos
  for each row execute function public.set_atualizado_em();
drop trigger if exists mensagem_modelos_set_atualizado_em on public.mensagem_modelos;
create trigger mensagem_modelos_set_atualizado_em before update on public.mensagem_modelos
  for each row execute function public.set_atualizado_em();
drop trigger if exists conferencia_config_set_atualizado_em on public.conferencia_config;
create trigger conferencia_config_set_atualizado_em before update on public.conferencia_config
  for each row execute function public.set_atualizado_em();

-- ----------------------------------------------------------------------------
-- RLS
-- ----------------------------------------------------------------------------

alter table public.clientes enable row level security;
alter table public.cliente_excursoes enable row level security;
alter table public.cliente_voo_eventos enable row level security;
alter table public.recibos enable row level security;
alter table public.mensagem_modelos enable row level security;
alter table public.conferencia_config enable row level security;
alter table public.conferencia_reportes enable row level security;

drop policy if exists cliente_excursoes_select on public.cliente_excursoes;
create policy cliente_excursoes_select
  on public.cliente_excursoes for select to authenticated
  using (public.auth_pode_ver_conferencia(loja, vendedor_usuario_id));

-- Cliente: visível pela compra mais recente (loja_principal/vendedor) ou por
-- qualquer reserva dele que o usuário enxergue — o vendedor de uma compra
-- antiga continua vendo o cliente quando outro vendedor fez a mais recente.
drop policy if exists clientes_select on public.clientes;
create policy clientes_select
  on public.clientes for select to authenticated
  using (
    public.auth_pode_ver_conferencia(loja_principal, vendedor_usuario_id)
    or exists (
      select 1 from public.cliente_excursoes e
      where e.cliente_id = clientes.id
        and public.auth_pode_ver_conferencia(e.loja, e.vendedor_usuario_id)
    )
  );

drop policy if exists cliente_voo_eventos_select on public.cliente_voo_eventos;
create policy cliente_voo_eventos_select
  on public.cliente_voo_eventos for select to authenticated
  using (
    exists (
      select 1 from public.cliente_excursoes e
      where e.reserva = cliente_voo_eventos.reserva
        and public.auth_pode_ver_conferencia(e.loja, e.vendedor_usuario_id)
    )
  );

drop policy if exists recibos_select on public.recibos;
create policy recibos_select
  on public.recibos for select to authenticated
  using (public.auth_pode_ver_conferencia(loja, vendedor_usuario_id));

drop policy if exists mensagem_modelos_select on public.mensagem_modelos;
create policy mensagem_modelos_select
  on public.mensagem_modelos for select to authenticated
  using (public.auth_ativo());

drop policy if exists mensagem_modelos_insert on public.mensagem_modelos;
create policy mensagem_modelos_insert
  on public.mensagem_modelos for insert to authenticated
  with check (public.auth_is_admin());

drop policy if exists mensagem_modelos_update on public.mensagem_modelos;
create policy mensagem_modelos_update
  on public.mensagem_modelos for update to authenticated
  using (public.auth_is_admin())
  with check (public.auth_is_admin());

drop policy if exists mensagem_modelos_delete on public.mensagem_modelos;
create policy mensagem_modelos_delete
  on public.mensagem_modelos for delete to authenticated
  using (public.auth_is_admin());

drop policy if exists conferencia_config_select on public.conferencia_config;
create policy conferencia_config_select
  on public.conferencia_config for select to authenticated
  using (public.auth_ativo());

drop policy if exists conferencia_config_update on public.conferencia_config;
create policy conferencia_config_update
  on public.conferencia_config for update to authenticated
  using (public.auth_is_admin())
  with check (public.auth_is_admin());

drop policy if exists conferencia_reportes_select on public.conferencia_reportes;
create policy conferencia_reportes_select
  on public.conferencia_reportes for select to authenticated
  using (public.auth_is_admin() or usuario_id = auth.uid());

-- Dados: authenticated só lê (RLS acima); escrita só service_role.
grant select on public.clientes, public.cliente_excursoes, public.cliente_voo_eventos, public.recibos,
  public.conferencia_reportes
  to authenticated;
grant select, insert, update, delete on public.mensagem_modelos to authenticated;
grant select on public.conferencia_config to authenticated;
grant update (versao_atual, logins_gravacao) on public.conferencia_config to authenticated;
grant select, insert, update, delete on public.clientes, public.cliente_excursoes, public.cliente_voo_eventos,
  public.recibos, public.mensagem_modelos, public.conferencia_config, public.conferencia_reportes
  to service_role;

-- ----------------------------------------------------------------------------
-- Storage: bucket privado "recibos" ({loja}/{aaaa}/{mm}/{recibo}.pdf).
-- Upload só pela API (service_role); leitura segue a visibilidade do recibo.
-- ----------------------------------------------------------------------------

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('recibos', 'recibos', false, 5242880, array['application/pdf'])
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists storage_recibos_select on storage.objects;
create policy storage_recibos_select
  on storage.objects for select to authenticated
  using (
    bucket_id = 'recibos'
    and exists (
      select 1 from public.recibos r
      where r.pdf_path = storage.objects.name
        and public.auth_pode_ver_conferencia(r.loja, r.vendedor_usuario_id)
    )
  );

-- ----------------------------------------------------------------------------
-- Auxiliares de gravação (service_role)
-- ----------------------------------------------------------------------------

-- Chave de comparação de telefone: últimos 8 dígitos ("41 9651-7241" e
-- "(41) 99651-7241" casam). null se tiver menos de 8 dígitos.
create or replace function public._telefone_chave(p_numero text)
returns text
language sql
immutable
set search_path = public
as $$
  select case
    when length(regexp_replace(coalesce(p_numero, ''), '\D', '', 'g')) >= 8
      then right(regexp_replace(p_numero, '\D', '', 'g'), 8)
  end;
$$;

-- Une duas listas [{numero, tipo, contato}] sem repetir número.
create or replace function public._telefones_mesclar(p_atuais jsonb, p_novos jsonb)
returns jsonb
language sql
immutable
set search_path = public
as $$
  with todos as (
    select t.valor, t.ordem
    from jsonb_array_elements(
      coalesce(case when jsonb_typeof(p_atuais) = 'array' then p_atuais end, '[]'::jsonb)
      || coalesce(case when jsonb_typeof(p_novos) = 'array' then p_novos end, '[]'::jsonb)
    ) with ordinality as t (valor, ordem)
    where jsonb_typeof(t.valor) = 'object' and nullif(trim(t.valor ->> 'numero'), '') is not null
  ),
  unicos as (
    select distinct on (coalesce(public._telefone_chave(valor ->> 'numero'), valor ->> 'numero')) valor, ordem
    from todos
    order by coalesce(public._telefone_chave(valor ->> 'numero'), valor ->> 'numero'), ordem
  )
  select coalesce(jsonb_agg(valor order by ordem), '[]'::jsonb) from unicos;
$$;

-- Datas: 'aaaa-mm-dd' (ou ISO com hora) e 'dd/mm/aaaa'.
create or replace function public._data_conferencia(p_valor text)
returns date
language sql
immutable
set search_path = public
as $$
  select case
    when nullif(trim(p_valor), '') is null then null
    when trim(p_valor) ~ '^\d{2}/\d{2}/\d{4}$' then to_date(trim(p_valor), 'DD/MM/YYYY')
    else left(trim(p_valor), 10)::date
  end;
$$;

-- Valor: número JSON ou texto "1.234,56" / "1234.56".
create or replace function public._valor_conferencia(p_valor jsonb)
returns numeric
language sql
immutable
set search_path = public
as $$
  select case
    when p_valor is null or jsonb_typeof(p_valor) = 'null' then null
    when jsonb_typeof(p_valor) = 'number' then (p_valor #>> '{}')::numeric
    when (p_valor #>> '{}') ~ ',' then
      nullif(replace(replace(regexp_replace(p_valor #>> '{}', '[^0-9,.-]', '', 'g'), '.', ''), ',', '.'), '')::numeric
    else nullif(regexp_replace(p_valor #>> '{}', '[^0-9.-]', '', 'g'), '')::numeric
  end;
$$;

-- jsonb do campo, tratando JSON null como SQL null.
create or replace function public._jcampo(p_obj jsonb, p_chave text)
returns jsonb
language sql
immutable
set search_path = public
as $$
  select nullif(p_obj -> p_chave, 'null'::jsonb);
$$;

-- Casa (ou cria) o cliente do contratante principal. p_cliente_atual = o
-- cliente já ligado à reserva (reenvio sem pessoa_id não cria duplicata).
create or replace function public._conferencia_upsert_cliente(p_contratante jsonb, p_telefones jsonb, p_cliente_atual uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_pessoa text := nullif(trim(p_contratante ->> 'pessoa_id'), '');
  v_nome text := nullif(trim(p_contratante ->> 'nome'), '');
  v_id uuid;
  v_mesmo_nome uuid[];
  v_mesmo_telefone uuid[];
begin
  if v_pessoa is not null then
    insert into public.clientes as c (pessoa_id_systur, nome, telefones)
    values (v_pessoa, coalesce(v_nome, '(sem nome)'), public._telefones_mesclar('[]'::jsonb, p_telefones))
    on conflict (pessoa_id_systur) do update set
      nome = coalesce(v_nome, c.nome),
      telefones = public._telefones_mesclar(c.telefones, p_telefones)
    returning c.id into v_id;
    return v_id;
  end if;

  if p_cliente_atual is not null then
    update public.clientes c
    set telefones = public._telefones_mesclar(c.telefones, p_telefones)
    where c.id = p_cliente_atual and c.telefones is distinct from public._telefones_mesclar(c.telefones, p_telefones);
    return p_cliente_atual;
  end if;

  if v_nome is null then
    return null;
  end if;

  select array_agg(c.id) into v_mesmo_nome
  from public.clientes c
  where c.nome_normalizado = public.normalizar_nome(v_nome);

  select array_agg(c.id) into v_mesmo_telefone
  from public.clientes c
  where c.id = any (coalesce(v_mesmo_nome, '{}'))
    and exists (
      select 1
      from jsonb_array_elements(c.telefones) a
      join jsonb_array_elements(coalesce(case when jsonb_typeof(p_telefones) = 'array' then p_telefones end, '[]'::jsonb)) b
        on public._telefone_chave(a ->> 'numero') = public._telefone_chave(b ->> 'numero')
    );

  if coalesce(array_length(v_mesmo_telefone, 1), 0) = 1 then
    update public.clientes c
    set telefones = public._telefones_mesclar(c.telefones, p_telefones)
    where c.id = v_mesmo_telefone[1];
    return v_mesmo_telefone[1];
  end if;

  -- Sem homônimo: cliente novo. Com homônimo(s) que não dá para separar pelo
  -- telefone: cliente novo marcado para revisão.
  insert into public.clientes (nome, telefones, revisar)
  values (v_nome, public._telefones_mesclar('[]'::jsonb, p_telefones), coalesce(array_length(v_mesmo_nome, 1), 0) > 0)
  returning id into v_id;
  return v_id;
end;
$$;

-- Recalcula datas, loja/vendedor da compra mais recente e total do cliente.
create or replace function public._conferencia_recalcular_cliente(p_cliente uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_cliente is null then
    return;
  end if;

  with compras as (
    select e.data_confirmacao as data, e.loja, e.vendedor_usuario_id, e.atualizado_em, 1 as prioridade
    from public.cliente_excursoes e where e.cliente_id = p_cliente
    union all
    select r.data_venda, r.loja, r.vendedor_usuario_id, r.atualizado_em, 2
    from public.recibos r where r.cliente_id = p_cliente
  ),
  recente as (
    select loja, vendedor_usuario_id from compras
    order by data desc nulls last, prioridade, atualizado_em desc
    limit 1
  )
  update public.clientes c set
    primeira_compra = (select min(data) from compras),
    ultima_compra = (select max(data) from compras),
    loja_principal = coalesce((select loja from recente), c.loja_principal),
    vendedor_usuario_id = (select vendedor_usuario_id from recente),
    total_comprado = coalesce((select sum(r.valor) from public.recibos r where r.cliente_id = p_cliente), 0)
  where c.id = p_cliente;
end;
$$;

-- Propaga cliente/vendedor da reserva para os recibos dela.
-- p_sobrescrever_vendedor: true quando o vínculo do mapeamento mudou (pode
-- inclusive limpar); false no sync (não apaga vendedor já conhecido).
create or replace function public._conferencia_vincular_recibos(p_reserva text, p_sobrescrever_vendedor boolean default false)
returns setof uuid
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
  with alvo as (
    select e.cliente_id, e.vendedor_usuario_id, regexp_replace(x, '\D', '', 'g') as recibo
    from public.cliente_excursoes e, unnest(e.recibos) x
    where e.reserva = p_reserva
  ),
  antes as (
    select r.recibo, r.cliente_id as cliente_antigo from public.recibos r join alvo a on a.recibo = r.recibo
  ),
  atualizados as (
    update public.recibos r set
      cliente_id = coalesce(a.cliente_id, r.cliente_id),
      vendedor_usuario_id = case when p_sobrescrever_vendedor then a.vendedor_usuario_id
                                 else coalesce(a.vendedor_usuario_id, r.vendedor_usuario_id) end
    from alvo a
    where r.recibo = a.recibo
      and (r.cliente_id is distinct from coalesce(a.cliente_id, r.cliente_id)
        or r.vendedor_usuario_id is distinct from case when p_sobrescrever_vendedor then a.vendedor_usuario_id
                                                       else coalesce(a.vendedor_usuario_id, r.vendedor_usuario_id) end)
    returning r.recibo, r.cliente_id
  )
  select u.cliente_id from atualizados u where u.cliente_id is not null
  union
  select b.cliente_antigo from antes b join atualizados u on u.recibo = b.recibo where b.cliente_antigo is not null;
end;
$$;

revoke all on function public._conferencia_upsert_cliente(jsonb, jsonb, uuid) from public, anon, authenticated;
revoke all on function public._conferencia_recalcular_cliente(uuid) from public, anon, authenticated;
revoke all on function public._conferencia_vincular_recibos(text, boolean) from public, anon, authenticated;

-- ----------------------------------------------------------------------------
-- conferencia_sync: POST /api/conferencia/sync (uma transação).
-- ----------------------------------------------------------------------------

create or replace function public.conferencia_sync(p_usuario uuid, p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_loja filial_cvc;
  e jsonb;
  v_reserva text;
  v_existe public.cliente_excursoes%rowtype;
  v_tem boolean;
  v_vendedor_nome text;
  v_vendedor uuid;
  v_cliente uuid;
  v_principal jsonb;
  v_retrato jsonb;
  v_retrato_mudou boolean;
  v_avisar boolean;
  v_recibos text[];
  v_clientes uuid[] := '{}';
  v_recebidas int := 0;
  v_novas int := 0;
  v_atualizadas int := 0;
  v_eventos int := 0;
  v_sem_vinculo text[] := '{}';
  v_id uuid;
begin
  begin
    v_loja := (p_payload ->> 'loja')::filial_cvc;
  exception when invalid_text_representation then
    raise exception 'Loja inválida: %', p_payload ->> 'loja' using errcode = '22023';
  end;
  if v_loja is null then
    raise exception 'Loja obrigatória.' using errcode = '22023';
  end if;
  if jsonb_typeof(p_payload -> 'excursoes') is distinct from 'array' then
    raise exception 'excursoes deve ser uma lista.' using errcode = '22023';
  end if;

  for e in select value from jsonb_array_elements(p_payload -> 'excursoes') loop
    v_reserva := nullif(trim(e ->> 'reserva'), '');
    if v_reserva is null then
      raise exception 'Excursão sem número de reserva.' using errcode = '22023';
    end if;
    v_recebidas := v_recebidas + 1;

    select * into v_existe from public.cliente_excursoes where reserva = v_reserva for update;
    v_tem := found;

    -- Vendedor: nome novo entra no mapeamento sem vínculo.
    v_vendedor := case when v_tem then v_existe.vendedor_usuario_id end;
    v_vendedor_nome := case when v_tem then v_existe.vendedor_nome_systur end;
    if e ? 'vendedor_systur' then
      v_vendedor_nome := nullif(trim(e ->> 'vendedor_systur'), '');
      v_vendedor := null;
      if v_vendedor_nome is not null then
        insert into public.systur_vendedor_mapeamento (nome_systur, loja)
        values (v_vendedor_nome, v_loja)
        on conflict (loja, nome_systur) do nothing;

        select m.usuario_id into v_vendedor
        from public.systur_vendedor_mapeamento m
        where m.loja = v_loja and m.nome_systur = v_vendedor_nome and m.ativo;

        if v_vendedor is null and not (v_vendedor_nome = any (v_sem_vinculo)) then
          v_sem_vinculo := v_sem_vinculo || v_vendedor_nome;
        end if;
      end if;
    end if;

    -- Cliente: contratante principal.
    v_cliente := case when v_tem then v_existe.cliente_id end;
    if e ? 'contratantes' then
      v_principal := case when jsonb_typeof(e -> 'contratantes') = 'array' then e -> 'contratantes' -> 0 end;
      if v_principal is not null then
        v_cliente := public._conferencia_upsert_cliente(
          v_principal,
          public._jcampo(e, 'telefones'),
          -- só reaproveita o cliente atual se ele ainda for o mesmo contratante
          case when v_tem and (v_existe.contratantes -> 0 ->> 'nome') is not distinct from (v_principal ->> 'nome')
               then v_existe.cliente_id end
        );
      end if;
    elsif e ? 'telefones' and v_cliente is not null then
      update public.clientes c set telefones = public._telefones_mesclar(c.telefones, public._jcampo(e, 'telefones'))
      where c.id = v_cliente;
    end if;

    -- Retrato dos voos: evento quando muda em relação ao salvo.
    v_retrato := case when e ? 'retrato_voos' then public._jcampo(e, 'retrato_voos')
                      when v_tem then v_existe.retrato_voos end;
    v_retrato_mudou := v_tem and e ? 'retrato_voos'
      and v_existe.retrato_voos is not null
      and v_existe.retrato_voos is distinct from v_retrato;

    if v_retrato_mudou then
      insert into public.cliente_voo_eventos (reserva, alteracoes, significativa, retrato_antes, retrato_depois, registrado_por)
      values (
        v_reserva,
        coalesce(public._jcampo(e, 'alteracoes'), '[]'::jsonb),
        coalesce((e ->> 'avisar_cliente')::boolean, false),
        v_existe.retrato_voos,
        v_retrato,
        p_usuario
      );
      v_eventos := v_eventos + 1;
    end if;

    -- avisar_cliente: depois de "cliente avisado", só volta a true com uma
    -- mudança nova no retrato.
    v_avisar := case
      when not (e ? 'avisar_cliente') then coalesce(v_existe.avisar_cliente, false)
      when not v_tem or v_retrato_mudou or v_existe.cliente_avisado_em is null
        then coalesce((e ->> 'avisar_cliente')::boolean, false)
      else v_existe.avisar_cliente
    end;

    v_recibos := case
      when jsonb_typeof(e -> 'recibos') = 'array'
        then array(select trim(x) from jsonb_array_elements_text(e -> 'recibos') x where trim(x) <> '')
    end;

    insert into public.cliente_excursoes as t (
      reserva, roteiro, excursao, categoria_codigo, loja, recibos, vendedor_nome_systur, vendedor_usuario_id,
      cliente_id, contratantes, destino, descricao, data_viagem, data_retorno, data_confirmacao, voucher_status,
      reserva_site, status_voos, alteracoes, avisos, pendencias, servicos, apolices, retrato_voos, avisar_cliente,
      aviso, conferido_em, atualizado_por, login_systur
    ) values (
      v_reserva,
      e ->> 'roteiro',
      e ->> 'excursao',
      nullif(left(regexp_replace(coalesce(e ->> 'excursao', ''), '\D', '', 'g'), 1), '')::smallint,
      v_loja,
      coalesce(v_recibos, '{}'),
      v_vendedor_nome,
      v_vendedor,
      v_cliente,
      coalesce(case when jsonb_typeof(e -> 'contratantes') = 'array' then e -> 'contratantes' end, '[]'::jsonb),
      e ->> 'destino',
      e ->> 'descricao',
      public._data_conferencia(e ->> 'data_viagem'),
      public._data_conferencia(e ->> 'data_retorno'),
      public._data_conferencia(e ->> 'data_confirmacao'),
      e ->> 'voucher_status',
      (e ->> 'reserva_site')::boolean,
      e ->> 'status_voos',
      public._jcampo(e, 'alteracoes'),
      public._jcampo(e, 'avisos'),
      public._jcampo(e, 'pendencias'),
      public._jcampo(e, 'servicos'),
      public._jcampo(e, 'apolices'),
      v_retrato,
      v_avisar,
      public._jcampo(e, 'aviso'),
      (e ->> 'conferido_em')::timestamptz,
      p_usuario,
      nullif(trim(p_payload ->> 'login_systur'), '')
    )
    on conflict (reserva) do update set
      roteiro = case when e ? 'roteiro' then excluded.roteiro else t.roteiro end,
      excursao = case when e ? 'excursao' then excluded.excursao else t.excursao end,
      categoria_codigo = case when e ? 'excursao' then excluded.categoria_codigo else t.categoria_codigo end,
      loja = excluded.loja,
      recibos = case when e ? 'recibos' then excluded.recibos else t.recibos end,
      vendedor_nome_systur = excluded.vendedor_nome_systur,
      vendedor_usuario_id = excluded.vendedor_usuario_id,
      cliente_id = excluded.cliente_id,
      contratantes = case when e ? 'contratantes' then excluded.contratantes else t.contratantes end,
      destino = case when e ? 'destino' then excluded.destino else t.destino end,
      descricao = case when e ? 'descricao' then excluded.descricao else t.descricao end,
      data_viagem = case when e ? 'data_viagem' then excluded.data_viagem else t.data_viagem end,
      data_retorno = case when e ? 'data_retorno' then excluded.data_retorno else t.data_retorno end,
      data_confirmacao = case when e ? 'data_confirmacao' then excluded.data_confirmacao else t.data_confirmacao end,
      voucher_status = case when e ? 'voucher_status' then excluded.voucher_status else t.voucher_status end,
      reserva_site = case when e ? 'reserva_site' then excluded.reserva_site else t.reserva_site end,
      status_voos = case when e ? 'status_voos' then excluded.status_voos else t.status_voos end,
      alteracoes = case when e ? 'alteracoes' then excluded.alteracoes else t.alteracoes end,
      avisos = case when e ? 'avisos' then excluded.avisos else t.avisos end,
      pendencias = case when e ? 'pendencias' then excluded.pendencias else t.pendencias end,
      servicos = case when e ? 'servicos' then excluded.servicos else t.servicos end,
      apolices = case when e ? 'apolices' then excluded.apolices else t.apolices end,
      retrato_voos = excluded.retrato_voos,
      avisar_cliente = excluded.avisar_cliente,
      aviso = case when e ? 'aviso' then excluded.aviso else t.aviso end,
      conferido_em = case when e ? 'conferido_em' then excluded.conferido_em else t.conferido_em end,
      atualizado_por = excluded.atualizado_por,
      login_systur = coalesce(excluded.login_systur, t.login_systur);

    if v_tem then
      v_atualizadas := v_atualizadas + 1;
      if v_existe.cliente_id is not null then
        v_clientes := v_clientes || v_existe.cliente_id;
      end if;
    else
      v_novas := v_novas + 1;
    end if;
    if v_cliente is not null then
      v_clientes := v_clientes || v_cliente;
    end if;

    for v_id in select * from public._conferencia_vincular_recibos(v_reserva, false) loop
      v_clientes := v_clientes || v_id;
    end loop;
  end loop;

  for v_id in select distinct x from unnest(v_clientes) x loop
    perform public._conferencia_recalcular_cliente(v_id);
  end loop;

  return jsonb_build_object(
    'recebidas', v_recebidas,
    'novas', v_novas,
    'atualizadas', v_atualizadas,
    'eventos_voo', v_eventos,
    'vendedores_sem_vinculo', to_jsonb(v_sem_vinculo)
  );
end;
$$;

-- ----------------------------------------------------------------------------
-- conferencia_recibos: POST /api/conferencia/recibos.
-- ----------------------------------------------------------------------------

create or replace function public.conferencia_recibos(p_usuario uuid, p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_loja filial_cvc;
  v_data_padrao date;
  r jsonb;
  v_recibo text;
  v_cliente uuid;
  v_vendedor uuid;
  v_clientes uuid[] := '{}';
  v_antigo uuid;
  v_inserido boolean;
  v_recebidos int := 0;
  v_novos int := 0;
  v_id uuid;
begin
  begin
    v_loja := (p_payload ->> 'loja')::filial_cvc;
  exception when invalid_text_representation then
    raise exception 'Loja inválida: %', p_payload ->> 'loja' using errcode = '22023';
  end;
  if v_loja is null then
    raise exception 'Loja obrigatória.' using errcode = '22023';
  end if;
  if jsonb_typeof(p_payload -> 'recibos') is distinct from 'array' then
    raise exception 'recibos deve ser uma lista.' using errcode = '22023';
  end if;
  v_data_padrao := public._data_conferencia(p_payload ->> 'data_venda');

  for r in select value from jsonb_array_elements(p_payload -> 'recibos') loop
    v_recibo := regexp_replace(coalesce(r ->> 'recibo', r ->> 'numero', ''), '\D', '', 'g');
    if v_recibo = '' then
      raise exception 'Recibo sem número.' using errcode = '22023';
    end if;
    v_recebidos := v_recebidos + 1;

    -- Reserva que lista este recibo (vendedor + cliente).
    select e.cliente_id, e.vendedor_usuario_id into v_cliente, v_vendedor
    from public.cliente_excursoes e
    where exists (select 1 from unnest(e.recibos) x where regexp_replace(x, '\D', '', 'g') = v_recibo)
    order by e.atualizado_em desc
    limit 1;

    -- Sem reserva: casa pelo nome só se houver exatamente um cliente.
    if v_cliente is null and nullif(trim(r ->> 'cliente'), '') is not null then
      select (array_agg(c.id))[1] into v_cliente
      from public.clientes c
      where c.nome_normalizado = public.normalizar_nome(r ->> 'cliente')
      having count(*) = 1;
    end if;

    select cliente_id into v_antigo from public.recibos where recibo = v_recibo;

    insert into public.recibos as t (recibo, numero, loja, data_venda, valor, cliente_nome, cliente_id, vendedor_usuario_id, atualizado_por)
    values (
      v_recibo,
      coalesce(nullif(trim(r ->> 'numero'), ''), left(v_recibo, 4) || '-' || substr(v_recibo, 5)),
      v_loja,
      coalesce(public._data_conferencia(r ->> 'data'), v_data_padrao),
      public._valor_conferencia(r -> 'valor'),
      nullif(trim(r ->> 'cliente'), ''),
      v_cliente,
      v_vendedor,
      p_usuario
    )
    on conflict (recibo) do update set
      numero = excluded.numero,
      loja = excluded.loja,
      data_venda = coalesce(excluded.data_venda, t.data_venda),
      valor = coalesce(excluded.valor, t.valor),
      cliente_nome = coalesce(excluded.cliente_nome, t.cliente_nome),
      cliente_id = coalesce(excluded.cliente_id, t.cliente_id),
      vendedor_usuario_id = coalesce(excluded.vendedor_usuario_id, t.vendedor_usuario_id),
      atualizado_por = excluded.atualizado_por
    returning (xmax = 0), t.cliente_id into v_inserido, v_id;

    if v_inserido then
      v_novos := v_novos + 1;
    end if;
    v_clientes := v_clientes || v_id || v_antigo;
  end loop;

  for v_id in select distinct x from unnest(v_clientes) x where x is not null loop
    perform public._conferencia_recalcular_cliente(v_id);
  end loop;

  return jsonb_build_object('recebidos', v_recebidos, 'novos', v_novos, 'atualizados', v_recebidos - v_novos);
end;
$$;

-- ----------------------------------------------------------------------------
-- conferencia_marcar_cliente_avisado: POST /api/conferencia/cliente-avisado.
-- false = reserva inexistente ou fora da visibilidade do usuário.
-- ----------------------------------------------------------------------------

create or replace function public.conferencia_marcar_cliente_avisado(p_usuario uuid, p_reserva text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.cliente_excursoes e set
    avisar_cliente = false,
    cliente_avisado_em = now(),
    cliente_avisado_por = p_usuario
  where e.reserva = p_reserva
    and public.usuario_pode_ver_conferencia(p_usuario, e.loja, e.vendedor_usuario_id);
  return found;
end;
$$;

revoke all on function public.conferencia_sync(uuid, jsonb) from public, anon, authenticated;
revoke all on function public.conferencia_recibos(uuid, jsonb) from public, anon, authenticated;
revoke all on function public.conferencia_marcar_cliente_avisado(uuid, text) from public, anon, authenticated;
grant execute on function public.conferencia_sync(uuid, jsonb) to service_role;
grant execute on function public.conferencia_recibos(uuid, jsonb) to service_role;
grant execute on function public.conferencia_marcar_cliente_avisado(uuid, text) to service_role;

-- ----------------------------------------------------------------------------
-- Vínculo do mapeamento Systur alterado pelo admin: reservas, recibos e
-- clientes já recebidos com aquele nome passam a apontar para o usuário.
-- ----------------------------------------------------------------------------

create or replace function public.systur_mapeamento_propagar_vinculo()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_reserva text;
  v_clientes uuid[] := '{}';
  v_id uuid;
begin
  if new.usuario_id is not distinct from old.usuario_id and new.ativo is not distinct from old.ativo then
    return new;
  end if;

  for v_reserva, v_id in
    update public.cliente_excursoes e
    set vendedor_usuario_id = case when new.ativo then new.usuario_id end
    where e.loja = new.loja and e.vendedor_nome_systur = new.nome_systur
    returning e.reserva, e.cliente_id
  loop
    if v_id is not null then
      v_clientes := v_clientes || v_id;
    end if;
    for v_id in select * from public._conferencia_vincular_recibos(v_reserva, true) loop
      v_clientes := v_clientes || v_id;
    end loop;
  end loop;

  for v_id in select distinct x from unnest(v_clientes) x loop
    perform public._conferencia_recalcular_cliente(v_id);
  end loop;
  return new;
end;
$$;

drop trigger if exists systur_vendedor_mapeamento_propagar on public.systur_vendedor_mapeamento;
create trigger systur_vendedor_mapeamento_propagar
  after update of usuario_id, ativo on public.systur_vendedor_mapeamento
  for each row execute function public.systur_mapeamento_propagar_vinculo();
