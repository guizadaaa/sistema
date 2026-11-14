-- ============================================================================
-- Base de clientes (aba Clientes → "Base de clientes") + coleta pelo bot.
--
--   cliente_excursoes   + produto/roteiro, origem/destino, voo, fornecedores,
--                       tipos_servico (calculado na API — src/lib/clientes/
--                       tipos-servico.ts), valor_total e coletado_em.
--   cliente_compras     uma linha por reserva × contratante (cada contratante
--                       tem recibo, valor e passageiros próprios). Derivada
--                       de cliente_excursoes.contratantes por gatilho, então
--                       o sync da conferência e a coleta do bot gravam pelo
--                       mesmo caminho; valor/taxas/passageiros só mudam
--                       quando vierem (nunca são apagados).
--   clientes            totais recalculados a partir de cliente_compras +
--                       proxima_viagem e qtd_viagens.
--   base_coleta_janelas até onde a base já foi coletada (por loja).
--   cliente_filtros_salvos  filtros da tela, por usuário.
--
-- Visibilidade da base (substitui, aqui, a regra por vendedor de
-- 20261027000001): todo usuário ativo da loja vê todos os clientes e compras
-- da loja da venda; adm/adm_master veem as 3 lojas — pode_ver_loja().
-- Escrita: só service_role (rotas /api/conferencia/*).
--
-- Idempotente (if not exists / create or replace / drop ... if exists).
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Visibilidade por loja
-- ----------------------------------------------------------------------------

create or replace function public.usuario_pode_ver_loja(p_usuario uuid, p_loja filial_cvc)
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
      and (u.perfil in ('adm', 'adm_master') or u.filial = p_loja)
  );
$$;

create or replace function public.pode_ver_loja(p_loja filial_cvc)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.usuario_pode_ver_loja(auth.uid(), p_loja);
$$;

comment on function public.pode_ver_loja(filial_cvc) is
  'Base de clientes: usuário ativo vê a loja dele (filial atual); adm/adm_master as 3 lojas.';

-- Lojas que o usuário autenticado enxerga (para filtrar com = any()).
create or replace function public._lojas_visiveis()
returns filial_cvc[]
language sql
stable
security definer
set search_path = public
as $$
  select case
    when u.perfil in ('adm', 'adm_master') then enum_range(null::filial_cvc)
    when u.filial is not null then array[u.filial]
    else '{}'::filial_cvc[]
  end
  from public.usuarios u
  where u.id = auth.uid() and u.ativo;
$$;

revoke all on function public.usuario_pode_ver_loja(uuid, filial_cvc) from public, anon, authenticated;
grant execute on function public.usuario_pode_ver_loja(uuid, filial_cvc) to service_role;
revoke all on function public.pode_ver_loja(filial_cvc) from public, anon;
grant execute on function public.pode_ver_loja(filial_cvc) to authenticated, service_role;
revoke all on function public._lojas_visiveis() from public, anon;
grant execute on function public._lojas_visiveis() to authenticated, service_role;

-- Destino "bate" (mesma viagem): normalizados, um contém o outro.
-- "ORLANDO" x "ORLANDO", "DISNEY - ORLANDO" x "Orlando".
create or replace function public._destinos_batem(p_a text, p_b text)
returns boolean
language sql
immutable
set search_path = public
as $$
  select public.normalizar_nome(p_a) is not null
     and public.normalizar_nome(p_b) is not null
     and (
       strpos(public.normalizar_nome(p_a), public.normalizar_nome(p_b)) > 0
       or strpos(public.normalizar_nome(p_b), public.normalizar_nome(p_a)) > 0
     );
$$;

-- ----------------------------------------------------------------------------
-- cliente_excursoes: dados da coleta
-- ----------------------------------------------------------------------------

alter table public.cliente_excursoes
  add column if not exists tipo_produto text,
  add column if not exists descricao_roteiro text,
  add column if not exists destino_pais text,
  add column if not exists destino_estado text,
  add column if not exists destino_cidade text,
  add column if not exists origem_cidade text,
  add column if not exists tem_voo boolean,
  add column if not exists fornecedores jsonb,
  add column if not exists tipos_servico text[],
  add column if not exists valor_total numeric(14, 2),
  add column if not exists coletado_em timestamptz;

create index if not exists cliente_excursoes_loja_confirmacao_idx on public.cliente_excursoes (loja, data_confirmacao);

-- ----------------------------------------------------------------------------
-- cliente_compras
-- ----------------------------------------------------------------------------

create table if not exists public.cliente_compras (
  id uuid primary key default gen_random_uuid(),
  reserva text not null references public.cliente_excursoes (reserva) on delete cascade,
  cliente_id uuid not null references public.clientes (id),
  pessoa_id_systur text not null,
  nome text,
  recibo text,
  valor numeric(14, 2),
  taxa_embarque numeric(14, 2),
  taxa_du numeric(14, 2),
  taxa_remessa numeric(14, 2),
  taxa_iof numeric(14, 2),
  passageiros text[] not null default '{}',
  -- Repetidos da reserva (filtro rápido; mantidos pelo gatilho).
  loja filial_cvc not null,
  data_confirmacao date,
  data_viagem date,
  data_retorno date,
  destino_cidade text,
  tipos_servico text[] not null default '{}',
  atualizado_em timestamptz not null default now(),

  constraint cliente_compras_reserva_pessoa_key unique (reserva, pessoa_id_systur)
);

create index if not exists cliente_compras_loja_idx on public.cliente_compras (loja);
create index if not exists cliente_compras_cliente_idx on public.cliente_compras (cliente_id);
create index if not exists cliente_compras_data_viagem_idx on public.cliente_compras (data_viagem);
create index if not exists cliente_compras_destino_idx on public.cliente_compras (destino_cidade);
create index if not exists cliente_compras_tipos_idx on public.cliente_compras using gin (tipos_servico);

comment on table public.cliente_compras is
  'Uma linha por reserva × contratante (valor, taxas, passageiros do contratante). Derivada de cliente_excursoes.contratantes pelo gatilho cliente_excursoes_compras. Leitura: pode_ver_loja(loja).';

drop trigger if exists cliente_compras_set_atualizado_em on public.cliente_compras;
create trigger cliente_compras_set_atualizado_em
  before update on public.cliente_compras
  for each row execute function public.set_atualizado_em();

alter table public.cliente_compras enable row level security;

drop policy if exists cliente_compras_select on public.cliente_compras;
create policy cliente_compras_select
  on public.cliente_compras for select to authenticated
  using (public.pode_ver_loja(loja));

revoke all on public.cliente_compras from anon, authenticated;
grant select on public.cliente_compras to authenticated;
grant select, insert, update, delete on public.cliente_compras to service_role;

-- ----------------------------------------------------------------------------
-- clientes: próxima viagem e nº de viagens
-- ----------------------------------------------------------------------------

alter table public.clientes
  add column if not exists proxima_viagem date,
  add column if not exists qtd_viagens integer not null default 0;

-- ----------------------------------------------------------------------------
-- base_coleta_janelas
-- ----------------------------------------------------------------------------

create table if not exists public.base_coleta_janelas (
  id uuid primary key default gen_random_uuid(),
  loja filial_cvc not null,
  de date not null,
  ate date not null,
  reservas integer not null default 0,
  coletado_por uuid references public.usuarios (id),
  coletado_em timestamptz not null default now(),

  constraint base_coleta_janelas_periodo check (de <= ate),
  constraint base_coleta_janelas_unica unique (loja, de, ate)
);

comment on table public.base_coleta_janelas is
  'Janelas (data de confirmação de/até) já coletadas pelo bot, por loja. reservas = reservas da loja com data de confirmação na janela já coletadas.';

alter table public.base_coleta_janelas enable row level security;

drop policy if exists base_coleta_janelas_select on public.base_coleta_janelas;
create policy base_coleta_janelas_select
  on public.base_coleta_janelas for select to authenticated
  using (public.auth_is_adm_master());

revoke all on public.base_coleta_janelas from anon, authenticated;
grant select on public.base_coleta_janelas to authenticated;
grant select, insert, update, delete on public.base_coleta_janelas to service_role;

-- ----------------------------------------------------------------------------
-- cliente_filtros_salvos (por usuário)
-- ----------------------------------------------------------------------------

create table if not exists public.cliente_filtros_salvos (
  id uuid primary key default gen_random_uuid(),
  usuario_id uuid not null default auth.uid() references public.usuarios (id) on delete cascade,
  nome text not null check (length(trim(nome)) between 1 and 80),
  filtros jsonb not null default '{}'::jsonb,
  criado_em timestamptz not null default now(),

  constraint cliente_filtros_salvos_nome_unico unique (usuario_id, nome)
);

alter table public.cliente_filtros_salvos enable row level security;

drop policy if exists cliente_filtros_salvos_select on public.cliente_filtros_salvos;
create policy cliente_filtros_salvos_select
  on public.cliente_filtros_salvos for select to authenticated
  using (usuario_id = auth.uid() and public.auth_ativo());

drop policy if exists cliente_filtros_salvos_insert on public.cliente_filtros_salvos;
create policy cliente_filtros_salvos_insert
  on public.cliente_filtros_salvos for insert to authenticated
  with check (usuario_id = auth.uid() and public.auth_ativo());

drop policy if exists cliente_filtros_salvos_delete on public.cliente_filtros_salvos;
create policy cliente_filtros_salvos_delete
  on public.cliente_filtros_salvos for delete to authenticated
  using (usuario_id = auth.uid());

revoke all on public.cliente_filtros_salvos from anon, authenticated;
grant select, insert, delete on public.cliente_filtros_salvos to authenticated;

-- ----------------------------------------------------------------------------
-- RLS de leitura da base: loja da venda
-- ----------------------------------------------------------------------------

drop policy if exists cliente_excursoes_select on public.cliente_excursoes;
create policy cliente_excursoes_select
  on public.cliente_excursoes for select to authenticated
  using (public.pode_ver_loja(loja));

drop policy if exists recibos_select on public.recibos;
create policy recibos_select
  on public.recibos for select to authenticated
  using (public.pode_ver_loja(loja));

drop policy if exists cliente_voo_eventos_select on public.cliente_voo_eventos;
create policy cliente_voo_eventos_select
  on public.cliente_voo_eventos for select to authenticated
  using (
    exists (
      select 1 from public.cliente_excursoes e
      where e.reserva = cliente_voo_eventos.reserva and public.pode_ver_loja(e.loja)
    )
  );

drop policy if exists clientes_select on public.clientes;
create policy clientes_select
  on public.clientes for select to authenticated
  using (
    exists (select 1 from public.cliente_compras c where c.cliente_id = clientes.id and public.pode_ver_loja(c.loja))
    or exists (select 1 from public.cliente_excursoes e where e.cliente_id = clientes.id and public.pode_ver_loja(e.loja))
    or exists (select 1 from public.recibos r where r.cliente_id = clientes.id and public.pode_ver_loja(r.loja))
  );

drop policy if exists storage_recibos_select on storage.objects;
create policy storage_recibos_select
  on storage.objects for select to authenticated
  using (
    bucket_id = 'recibos'
    and exists (
      select 1 from public.recibos r
      where r.pdf_path = storage.objects.name and public.pode_ver_loja(r.loja)
    )
  );

-- ----------------------------------------------------------------------------
-- Totais do cliente: a partir de cliente_compras (+ recibos que nenhuma
-- compra com valor cobre — dados anteriores à coleta da base).
-- ----------------------------------------------------------------------------

create or replace function public._conferencia_recalcular_cliente(p_cliente uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_hoje date := (now() at time zone 'America/Sao_Paulo')::date;
begin
  if p_cliente is null then
    return;
  end if;

  with compras as (
    select c.data_confirmacao as data, c.loja, e.vendedor_usuario_id, c.atualizado_em, 0 as prioridade
    from public.cliente_compras c join public.cliente_excursoes e on e.reserva = c.reserva
    where c.cliente_id = p_cliente
    union all
    select e.data_confirmacao, e.loja, e.vendedor_usuario_id, e.atualizado_em, 1
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
    total_comprado =
      coalesce((select sum(cc.valor) from public.cliente_compras cc where cc.cliente_id = p_cliente), 0)
      + coalesce((
          select sum(r.valor) from public.recibos r
          where r.cliente_id = p_cliente
            and not exists (
              select 1 from public.cliente_compras cc
              join public.cliente_excursoes e on e.reserva = cc.reserva
              where cc.valor is not null
                and (
                  regexp_replace(coalesce(cc.recibo, ''), '\D', '', 'g') = r.recibo
                  or (cc.cliente_id = p_cliente
                      and exists (select 1 from unnest(e.recibos) x where regexp_replace(x, '\D', '', 'g') = r.recibo))
                )
            )
        ), 0),
    proxima_viagem = (
      select min(cc.data_viagem) from public.cliente_compras cc
      where cc.cliente_id = p_cliente and cc.data_viagem >= v_hoje
    ),
    qtd_viagens = (select count(distinct cc.reserva) from public.cliente_compras cc where cc.cliente_id = p_cliente)
  where c.id = p_cliente;
end;
$$;

revoke all on function public._conferencia_recalcular_cliente(uuid) from public, anon, authenticated;

-- ----------------------------------------------------------------------------
-- Gatilho: cliente_excursoes.contratantes -> cliente_compras
-- ----------------------------------------------------------------------------

create or replace function public._cliente_compras_sincronizar(p_reserva text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  new public.cliente_excursoes%rowtype;
  c jsonb;
  v_pessoa text;
  v_cliente uuid;
  v_destino text;
  v_clientes uuid[] := '{}';
  v_id uuid;
begin
  select * into new from public.cliente_excursoes where reserva = p_reserva;
  if not found then
    return;
  end if;
  v_destino := coalesce(nullif(trim(new.destino_cidade), ''), nullif(trim(new.destino), ''));

  for c in
    select value from jsonb_array_elements(
      case when jsonb_typeof(new.contratantes) = 'array' then new.contratantes else '[]'::jsonb end
    )
  loop
    v_pessoa := nullif(trim(c ->> 'pessoa_id'), '');
    continue when v_pessoa is null or jsonb_typeof(c) <> 'object';

    v_cliente := public._conferencia_upsert_cliente(c, public._jcampo(c, 'telefones'), null);

    insert into public.cliente_compras as t (
      reserva, cliente_id, pessoa_id_systur, nome, recibo, valor,
      taxa_embarque, taxa_du, taxa_remessa, taxa_iof, passageiros,
      loja, data_confirmacao, data_viagem, data_retorno, destino_cidade, tipos_servico
    ) values (
      new.reserva, v_cliente, v_pessoa, nullif(trim(c ->> 'nome'), ''), nullif(trim(c ->> 'recibo'), ''),
      public._valor_conferencia(c -> 'valor'),
      public._valor_conferencia(c -> 'taxa_embarque'),
      public._valor_conferencia(c -> 'taxa_du'),
      public._valor_conferencia(c -> 'taxa_remessa'),
      public._valor_conferencia(c -> 'taxa_iof'),
      case when jsonb_typeof(c -> 'passageiros') = 'array'
        then array(select trim(p) from jsonb_array_elements_text(c -> 'passageiros') p where trim(p) <> '')
        else '{}'::text[] end,
      new.loja, new.data_confirmacao, new.data_viagem, new.data_retorno, v_destino,
      coalesce(new.tipos_servico, '{}')
    )
    on conflict (reserva, pessoa_id_systur) do update set
      cliente_id = excluded.cliente_id,
      nome = coalesce(excluded.nome, t.nome),
      recibo = coalesce(excluded.recibo, t.recibo),
      -- Só quando vier: o sync não manda valor e não apaga o do bot.
      valor = coalesce(excluded.valor, t.valor),
      taxa_embarque = coalesce(excluded.taxa_embarque, t.taxa_embarque),
      taxa_du = coalesce(excluded.taxa_du, t.taxa_du),
      taxa_remessa = coalesce(excluded.taxa_remessa, t.taxa_remessa),
      taxa_iof = coalesce(excluded.taxa_iof, t.taxa_iof),
      passageiros = case when cardinality(excluded.passageiros) > 0 then excluded.passageiros else t.passageiros end,
      loja = excluded.loja,
      data_confirmacao = excluded.data_confirmacao,
      data_viagem = excluded.data_viagem,
      data_retorno = excluded.data_retorno,
      destino_cidade = excluded.destino_cidade,
      tipos_servico = excluded.tipos_servico;
  end loop;

  -- Campos da reserva também nas compras de contratantes que não vieram agora.
  update public.cliente_compras t set
    loja = new.loja,
    data_confirmacao = new.data_confirmacao,
    data_viagem = new.data_viagem,
    data_retorno = new.data_retorno,
    destino_cidade = v_destino,
    tipos_servico = coalesce(new.tipos_servico, '{}')
  where t.reserva = new.reserva
    and (t.loja, t.data_confirmacao, t.data_viagem, t.data_retorno, t.destino_cidade, t.tipos_servico)
        is distinct from (new.loja, new.data_confirmacao, new.data_viagem, new.data_retorno, v_destino, coalesce(new.tipos_servico, '{}'));

  select coalesce(array_agg(distinct t.cliente_id), '{}') into v_clientes
  from public.cliente_compras t where t.reserva = new.reserva;
  foreach v_id in array v_clientes loop
    perform public._conferencia_recalcular_cliente(v_id);
  end loop;
end;
$$;

create or replace function public._cliente_compras_da_excursao()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'UPDATE' and (
    old.contratantes, old.loja, old.data_confirmacao, old.data_viagem, old.data_retorno,
    old.destino, old.destino_cidade, old.tipos_servico
  ) is not distinct from (
    new.contratantes, new.loja, new.data_confirmacao, new.data_viagem, new.data_retorno,
    new.destino, new.destino_cidade, new.tipos_servico
  ) then
    return new;
  end if;
  perform public._cliente_compras_sincronizar(new.reserva);
  return new;
end;
$$;

revoke all on function public._cliente_compras_sincronizar(text) from public, anon, authenticated;
revoke all on function public._cliente_compras_da_excursao() from public, anon, authenticated;

drop trigger if exists cliente_excursoes_compras on public.cliente_excursoes;
create trigger cliente_excursoes_compras
  after insert or update on public.cliente_excursoes
  for each row execute function public._cliente_compras_da_excursao();

-- ----------------------------------------------------------------------------
-- conferencia_base: POST /api/conferencia/base (bot de coleta, adm_master).
-- Upsert por reserva sem tocar nos campos da conferência (voos, avisos,
-- pendências, apólices...). tipos_servico vem calculado pela API.
-- ----------------------------------------------------------------------------

create or replace function public.conferencia_base(p_usuario uuid, p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_loja filial_cvc;
  v_de date;
  v_ate date;
  e jsonb;
  v_reserva text;
  v_tem boolean;
  v_vendedor_nome text;
  v_vendedor uuid;
  v_contratantes jsonb;
  v_principal jsonb;
  v_cliente uuid;
  v_pessoas text[];
  v_recibos text[];
  v_valor_total numeric;
  v_tipos text[];
  v_clientes uuid[] := '{}';
  v_recebidas int := 0;
  v_novas int := 0;
  v_atualizadas int := 0;
  v_clientes_novos int := 0;
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
  if jsonb_typeof(p_payload -> 'reservas') is distinct from 'array' then
    raise exception 'reservas deve ser uma lista.' using errcode = '22023';
  end if;
  if jsonb_array_length(p_payload -> 'reservas') > 200 then
    raise exception 'No máximo 200 reservas por chamada.' using errcode = '22023';
  end if;
  v_de := public._data_conferencia(p_payload #>> '{janela,de}');
  v_ate := public._data_conferencia(p_payload #>> '{janela,ate}');
  if coalesce((p_payload ->> 'fim_da_janela')::boolean, false) and (v_de is null or v_ate is null or v_de > v_ate) then
    raise exception 'fim_da_janela exige janela.de e janela.ate válidos.' using errcode = '22023';
  end if;

  -- Clientes novos = pessoas do lote que ainda não existem.
  select count(distinct p) into v_clientes_novos
  from jsonb_array_elements(p_payload -> 'reservas') r,
       jsonb_array_elements(case when jsonb_typeof(r -> 'contratantes') = 'array' then r -> 'contratantes' else '[]' end) c,
       nullif(trim(c ->> 'pessoa_id'), '') p
  where p is not null and not exists (select 1 from public.clientes x where x.pessoa_id_systur = p);

  for e in select value from jsonb_array_elements(p_payload -> 'reservas') loop
    v_reserva := nullif(trim(e ->> 'reserva'), '');
    if v_reserva is null then
      raise exception 'Reserva sem número.' using errcode = '22023';
    end if;
    v_recebidas := v_recebidas + 1;

    perform 1 from public.cliente_excursoes where reserva = v_reserva for update;
    v_tem := found;

    -- Vendedor: nome novo entra no mapeamento sem vínculo (como no sync).
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

    v_contratantes := case when jsonb_typeof(e -> 'contratantes') = 'array' then e -> 'contratantes' else '[]'::jsonb end;
    v_principal := v_contratantes -> 0;
    v_cliente := case
      when v_principal is not null and nullif(trim(v_principal ->> 'pessoa_id'), '') is not null
        then public._conferencia_upsert_cliente(v_principal, public._jcampo(v_principal, 'telefones'), null)
    end;

    v_pessoas := array(
      select trim(c ->> 'pessoa_id') from jsonb_array_elements(v_contratantes) c
      where nullif(trim(c ->> 'pessoa_id'), '') is not null
    );
    v_recibos := array(
      select distinct trim(c ->> 'recibo') from jsonb_array_elements(v_contratantes) c
      where nullif(trim(c ->> 'recibo'), '') is not null
    );
    select sum(public._valor_conferencia(c -> 'valor')) into v_valor_total from jsonb_array_elements(v_contratantes) c;
    v_tipos := case when jsonb_typeof(e -> 'tipos_servico') = 'array'
      then array(select x from jsonb_array_elements_text(e -> 'tipos_servico') x) end;

    insert into public.cliente_excursoes as t (
      reserva, roteiro, excursao, categoria_codigo, loja, recibos, vendedor_nome_systur, vendedor_usuario_id,
      cliente_id, contratantes, destino, descricao, data_viagem, data_retorno, data_confirmacao, voucher_status,
      reserva_site, tipo_produto, descricao_roteiro, destino_pais, destino_estado, destino_cidade, origem_cidade,
      tem_voo, fornecedores, tipos_servico, valor_total, coletado_em, atualizado_por
    ) values (
      v_reserva,
      e ->> 'roteiro',
      e ->> 'excursao',
      nullif(left(regexp_replace(coalesce(e ->> 'excursao', ''), '\D', '', 'g'), 1), '')::smallint,
      v_loja,
      v_recibos,
      v_vendedor_nome,
      v_vendedor,
      v_cliente,
      v_contratantes,
      nullif(trim(e #>> '{destino,cidade}'), ''),
      nullif(trim(e ->> 'descricao_roteiro'), ''),
      public._data_conferencia(e ->> 'data_viagem'),
      public._data_conferencia(e ->> 'data_retorno'),
      public._data_conferencia(e ->> 'data_confirmacao'),
      e ->> 'voucher_status',
      (e ->> 'reserva_site')::boolean,
      nullif(trim(e ->> 'tipo_produto'), ''),
      nullif(trim(e ->> 'descricao_roteiro'), ''),
      nullif(trim(e #>> '{destino,pais}'), ''),
      nullif(trim(e #>> '{destino,estado}'), ''),
      nullif(trim(e #>> '{destino,cidade}'), ''),
      nullif(trim(e #>> '{origem,cidade}'), ''),
      (e ->> 'tem_voo')::boolean,
      case when jsonb_typeof(e -> 'fornecedores') = 'array' then e -> 'fornecedores' end,
      v_tipos,
      v_valor_total,
      now(),
      p_usuario
    )
    on conflict (reserva) do update set
      roteiro = coalesce(excluded.roteiro, t.roteiro),
      excursao = coalesce(excluded.excursao, t.excursao),
      categoria_codigo = coalesce(excluded.categoria_codigo, t.categoria_codigo),
      loja = excluded.loja,
      recibos = case when cardinality(excluded.recibos) > 0 then excluded.recibos else t.recibos end,
      vendedor_nome_systur = coalesce(excluded.vendedor_nome_systur, t.vendedor_nome_systur),
      vendedor_usuario_id = case when excluded.vendedor_nome_systur is not null then excluded.vendedor_usuario_id
                                 else t.vendedor_usuario_id end,
      cliente_id = coalesce(excluded.cliente_id, t.cliente_id),
      contratantes = case when jsonb_array_length(excluded.contratantes) > 0 then excluded.contratantes else t.contratantes end,
      destino = coalesce(t.destino, excluded.destino),
      descricao = coalesce(t.descricao, excluded.descricao),
      data_viagem = coalesce(excluded.data_viagem, t.data_viagem),
      data_retorno = coalesce(excluded.data_retorno, t.data_retorno),
      data_confirmacao = coalesce(excluded.data_confirmacao, t.data_confirmacao),
      voucher_status = coalesce(excluded.voucher_status, t.voucher_status),
      reserva_site = coalesce(excluded.reserva_site, t.reserva_site),
      tipo_produto = coalesce(excluded.tipo_produto, t.tipo_produto),
      descricao_roteiro = coalesce(excluded.descricao_roteiro, t.descricao_roteiro),
      destino_pais = coalesce(excluded.destino_pais, t.destino_pais),
      destino_estado = coalesce(excluded.destino_estado, t.destino_estado),
      destino_cidade = coalesce(excluded.destino_cidade, t.destino_cidade),
      origem_cidade = coalesce(excluded.origem_cidade, t.origem_cidade),
      tem_voo = coalesce(excluded.tem_voo, t.tem_voo),
      fornecedores = coalesce(excluded.fornecedores, t.fornecedores),
      tipos_servico = coalesce(excluded.tipos_servico, t.tipos_servico),
      valor_total = coalesce(excluded.valor_total, t.valor_total),
      coletado_em = excluded.coletado_em,
      atualizado_por = excluded.atualizado_por;

    if v_tem then
      v_atualizadas := v_atualizadas + 1;
    else
      v_novas := v_novas + 1;
    end if;

    -- O bot manda todos os contratantes da reserva: quem saiu deixa de ser compra.
    if cardinality(v_pessoas) > 0 then
      for v_id in
        delete from public.cliente_compras t
        where t.reserva = v_reserva and t.pessoa_id_systur <> all (v_pessoas)
        returning t.cliente_id
      loop
        v_clientes := v_clientes || v_id;
      end loop;
    end if;

    for v_id in select * from public._conferencia_vincular_recibos(v_reserva, false) loop
      v_clientes := v_clientes || v_id;
    end loop;
  end loop;

  for v_id in select distinct x from unnest(v_clientes) x where x is not null loop
    perform public._conferencia_recalcular_cliente(v_id);
  end loop;

  if coalesce((p_payload ->> 'fim_da_janela')::boolean, false) then
    insert into public.base_coleta_janelas as j (loja, de, ate, reservas, coletado_por, coletado_em)
    values (
      v_loja, v_de, v_ate,
      (select count(*) from public.cliente_excursoes x
       where x.loja = v_loja and x.coletado_em is not null and x.data_confirmacao between v_de and v_ate),
      p_usuario, now()
    )
    on conflict (loja, de, ate) do update set
      reservas = excluded.reservas, coletado_por = excluded.coletado_por, coletado_em = excluded.coletado_em;
  end if;

  return jsonb_build_object(
    'recebidas', v_recebidas,
    'novas', v_novas,
    'atualizadas', v_atualizadas,
    'clientes_novos', v_clientes_novos,
    'vendedores_sem_vinculo', to_jsonb(v_sem_vinculo)
  );
end;
$$;

revoke all on function public.conferencia_base(uuid, jsonb) from public, anon, authenticated;
grant execute on function public.conferencia_base(uuid, jsonb) to service_role;

-- Grava tipos_servico calculados na API ([{reserva, tipos}]). p_so_vazios:
-- não sobrescreve o que já tem (sync, que tem menos dados que o bot).
create or replace function public.clientes_gravar_tipos_servico(p_itens jsonb, p_so_vazios boolean default false)
returns integer
language sql
security definer
set search_path = public
as $$
  with itens as (
    select i ->> 'reserva' as reserva,
           array(select x from jsonb_array_elements_text(i -> 'tipos') x) as tipos
    from jsonb_array_elements(case when jsonb_typeof(p_itens) = 'array' then p_itens else '[]'::jsonb end) i
  ),
  feitos as (
    update public.cliente_excursoes e set tipos_servico = i.tipos
    from itens i
    where e.reserva = i.reserva
      and e.tipos_servico is distinct from i.tipos
      and (not p_so_vazios or e.tipos_servico is null)
    returning 1
  )
  select count(*)::int from feitos;
$$;

revoke all on function public.clientes_gravar_tipos_servico(jsonb, boolean) from public, anon, authenticated;
grant execute on function public.clientes_gravar_tipos_servico(jsonb, boolean) to service_role;

-- ----------------------------------------------------------------------------
-- Consultas da tela (rodam no banco; o navegador só recebe a página).
--
-- Filtros (jsonb, mesmas chaves da URL):
--   loja, vendedor (nome do Systur), destino, tipo, valor_de/valor_ate (da
--   compra), total_de/total_ate (do cliente, compras visíveis),
--   embarque_de/embarque_ate, compra_de/compra_ate, futura ('1').
-- Campanha (camp):
--   'adicional': comprou ca_tipo para ca_destino com embarque entre ca_de e
--     ca_ate e NÃO comprou ca_sem_tipo para o mesmo destino na mesma viagem
--     (embarque entre o embarque − 3 dias e o retorno + 3 dias da compra A).
--   'recompra': comprou (cr_tipo/cr_destino) com compra entre cr_a_de e
--     cr_a_ate e não comprou nada (cr_escopo 'nada') ou nada daquele
--     tipo/destino (cr_escopo 'mesmo') entre cr_b_de e cr_b_ate.
-- A parte "não comprou" olha todas as compras do cliente (inclusive de
-- outra loja), para não oferecer o que ele já comprou.
-- ----------------------------------------------------------------------------

create or replace function public._filtro_data(p_filtros jsonb, p_chave text)
returns date
language sql
immutable
set search_path = public
as $$
  select case when coalesce(p_filtros ->> p_chave, '') ~ '^\d{4}-\d{2}-\d{2}$' then (p_filtros ->> p_chave)::date end;
$$;

create or replace function public._filtro_num(p_filtros jsonb, p_chave text)
returns numeric
language sql
immutable
set search_path = public
as $$
  select case when coalesce(p_filtros ->> p_chave, '') ~ '^-?\d+(\.\d+)?$' then (p_filtros ->> p_chave)::numeric end;
$$;

create or replace function public._filtro_txt(p_filtros jsonb, p_chave text)
returns text
language sql
immutable
set search_path = public
as $$
  select nullif(trim(coalesce(p_filtros ->> p_chave, '')), '');
$$;

drop function if exists public.base_clientes_buscar(jsonb, integer, integer);

create function public.base_clientes_buscar(p_filtros jsonb, p_limite integer default 50, p_offset integer default 0)
returns table (
  cliente_id uuid,
  nome text,
  telefones jsonb,
  lojas text[],
  qtd_viagens integer,
  total_comprado numeric,
  ultima_compra date,
  proxima_viagem date,
  tipos text[],
  compra_reserva text,
  compra_destino text,
  compra_embarque date,
  compra_retorno date,
  compra_valor numeric,
  compra_vendedor text,
  compra_loja filial_cvc,
  compra_tipos text[],
  total_clientes bigint,
  soma_valores numeric
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  f jsonb := coalesce(p_filtros, '{}'::jsonb);
  v_lojas filial_cvc[] := public._lojas_visiveis();
  v_hoje date := (now() at time zone 'America/Sao_Paulo')::date;
  v_loja text := public._filtro_txt(f, 'loja');
  v_vendedor text := public._filtro_txt(f, 'vendedor');
  v_destino text := public.normalizar_nome(public._filtro_txt(f, 'destino'));
  v_tipo text := public._filtro_txt(f, 'tipo');
  v_valor_de numeric := public._filtro_num(f, 'valor_de');
  v_valor_ate numeric := public._filtro_num(f, 'valor_ate');
  v_total_de numeric := public._filtro_num(f, 'total_de');
  v_total_ate numeric := public._filtro_num(f, 'total_ate');
  v_emb_de date := public._filtro_data(f, 'embarque_de');
  v_emb_ate date := public._filtro_data(f, 'embarque_ate');
  v_cmp_de date := public._filtro_data(f, 'compra_de');
  v_cmp_ate date := public._filtro_data(f, 'compra_ate');
  v_futura boolean := coalesce(public._filtro_txt(f, 'futura'), '') in ('1', 'true');
  v_camp text := public._filtro_txt(f, 'camp');
  v_ca_tipo text := public._filtro_txt(f, 'ca_tipo');
  v_ca_destino text := public.normalizar_nome(public._filtro_txt(f, 'ca_destino'));
  v_ca_de date := public._filtro_data(f, 'ca_de');
  v_ca_ate date := public._filtro_data(f, 'ca_ate');
  v_ca_sem text := public._filtro_txt(f, 'ca_sem_tipo');
  v_cr_tipo text := public._filtro_txt(f, 'cr_tipo');
  v_cr_destino text := public.normalizar_nome(public._filtro_txt(f, 'cr_destino'));
  v_cr_a_de date := public._filtro_data(f, 'cr_a_de');
  v_cr_a_ate date := public._filtro_data(f, 'cr_a_ate');
  v_cr_b_de date := public._filtro_data(f, 'cr_b_de');
  v_cr_b_ate date := public._filtro_data(f, 'cr_b_ate');
  v_cr_escopo text := coalesce(public._filtro_txt(f, 'cr_escopo'), 'nada');
begin
  if v_lojas is null or cardinality(v_lojas) = 0 then
    return;
  end if;

  return query
  with vis as (
    select c.*, e.vendedor_nome_systur, coalesce(u.nome_completo, e.vendedor_nome_systur) as vendedor_exibir
    from public.cliente_compras c
    join public.cliente_excursoes e on e.reserva = c.reserva
    left join public.usuarios u on u.id = e.vendedor_usuario_id
    where c.loja = any (v_lojas)
  ),
  casadas as (
    select a.* from vis a
    where (v_loja is null or a.loja::text = v_loja)
      and (v_vendedor is null or a.vendedor_nome_systur = v_vendedor)
      and (v_destino is null or strpos(coalesce(public.normalizar_nome(a.destino_cidade), ''), v_destino) > 0)
      and (v_tipo is null or v_tipo = any (a.tipos_servico))
      and (v_valor_de is null or a.valor >= v_valor_de)
      and (v_valor_ate is null or a.valor <= v_valor_ate)
      and (v_emb_de is null or a.data_viagem >= v_emb_de)
      and (v_emb_ate is null or a.data_viagem <= v_emb_ate)
      and (v_cmp_de is null or a.data_confirmacao >= v_cmp_de)
      and (v_cmp_ate is null or a.data_confirmacao <= v_cmp_ate)
      and (v_camp is distinct from 'adicional' or (
        (v_ca_tipo is null or v_ca_tipo = any (a.tipos_servico))
        and (v_ca_destino is null or strpos(coalesce(public.normalizar_nome(a.destino_cidade), ''), v_ca_destino) > 0)
        and (v_ca_de is null or a.data_viagem >= v_ca_de)
        and (v_ca_ate is null or a.data_viagem <= v_ca_ate)
        and (v_ca_sem is null or not exists (
          select 1 from public.cliente_compras b
          where b.cliente_id = a.cliente_id
            and v_ca_sem = any (b.tipos_servico)
            and public._destinos_batem(a.destino_cidade, b.destino_cidade)
            and b.data_viagem between a.data_viagem - 3 and coalesce(a.data_retorno, a.data_viagem) + 3
        ))
      ))
      and (v_camp is distinct from 'recompra' or (
        (v_cr_tipo is null or v_cr_tipo = any (a.tipos_servico))
        and (v_cr_destino is null or strpos(coalesce(public.normalizar_nome(a.destino_cidade), ''), v_cr_destino) > 0)
        and (v_cr_a_de is null or a.data_confirmacao >= v_cr_a_de)
        and (v_cr_a_ate is null or a.data_confirmacao <= v_cr_a_ate)
        and not exists (
          select 1 from public.cliente_compras b
          where b.cliente_id = a.cliente_id
            and (v_cr_b_de is null or b.data_confirmacao >= v_cr_b_de)
            and (v_cr_b_ate is null or b.data_confirmacao <= v_cr_b_ate)
            and (v_cr_escopo = 'nada' or (
              (v_cr_tipo is null or v_cr_tipo = any (b.tipos_servico))
              and (v_cr_destino is null or strpos(coalesce(public.normalizar_nome(b.destino_cidade), ''), v_cr_destino) > 0)
            ))
        )
      ))
  ),
  por_cliente as (
    select v.cliente_id,
      array_agg(distinct v.loja::text order by v.loja::text) as lojas,
      count(distinct v.reserva)::int as qtd_viagens,
      coalesce(sum(v.valor), 0)::numeric as total,
      max(v.data_confirmacao) as ultima,
      min(v.data_viagem) filter (where v.data_viagem >= v_hoje) as proxima
    from vis v
    where v.cliente_id in (select distinct cs.cliente_id from casadas cs)
    group by v.cliente_id
  ),
  rep as (
    select distinct on (cs.cliente_id) cs.*
    from casadas cs
    order by cs.cliente_id, cs.data_viagem desc nulls last, cs.data_confirmacao desc nulls last, cs.reserva
  ),
  soma_casadas as (
    select cs.cliente_id, sum(cs.valor) as soma from casadas cs group by cs.cliente_id
  ),
  final as (
    select p.*, r.reserva as r_reserva, r.destino_cidade as r_destino, r.data_viagem as r_embarque,
      r.data_retorno as r_retorno, r.valor as r_valor, r.vendedor_exibir as r_vendedor, r.loja as r_loja,
      r.tipos_servico as r_tipos, s.soma
    from por_cliente p
    join rep r on r.cliente_id = p.cliente_id
    join soma_casadas s on s.cliente_id = p.cliente_id
    where (v_total_de is null or p.total >= v_total_de)
      and (v_total_ate is null or p.total <= v_total_ate)
      and (not v_futura or p.proxima is not null)
  ),
  paginada as (
    select fi.*, count(*) over () as n, sum(fi.soma) over () as soma_total
    from final fi
    order by fi.ultima desc nulls last, fi.cliente_id
    limit greatest(coalesce(p_limite, 50), 1) offset greatest(coalesce(p_offset, 0), 0)
  )
  select pg.cliente_id, cl.nome, cl.telefones, pg.lojas, pg.qtd_viagens, pg.total, pg.ultima, pg.proxima,
    (select coalesce(array_agg(distinct t order by t), '{}') from vis v2, unnest(v2.tipos_servico) t
     where v2.cliente_id = pg.cliente_id),
    pg.r_reserva, pg.r_destino, pg.r_embarque, pg.r_retorno, pg.r_valor, pg.r_vendedor, pg.r_loja, pg.r_tipos,
    pg.n, coalesce(pg.soma_total, 0)
  from paginada pg
  join public.clientes cl on cl.id = pg.cliente_id
  order by pg.ultima desc nulls last, pg.cliente_id;
end;
$$;

revoke all on function public.base_clientes_buscar(jsonb, integer, integer) from public, anon;
grant execute on function public.base_clientes_buscar(jsonb, integer, integer) to authenticated, service_role;

-- Compras visíveis de um cliente (expandir), da mais nova para a mais antiga.
drop function if exists public.base_clientes_compras(uuid);

create function public.base_clientes_compras(p_cliente uuid)
returns table (
  reserva text,
  tipo_produto text,
  descricao text,
  destino_cidade text,
  destino_estado text,
  destino_pais text,
  data_confirmacao date,
  data_viagem date,
  data_retorno date,
  tipos_servico text[],
  valor numeric,
  recibo text,
  vendedor text,
  loja filial_cvc,
  passageiros text[]
)
language sql
stable
security definer
set search_path = public
as $$
  select c.reserva, e.tipo_produto, coalesce(e.descricao_roteiro, e.descricao), c.destino_cidade, e.destino_estado,
    e.destino_pais, c.data_confirmacao, c.data_viagem, c.data_retorno, c.tipos_servico, c.valor, c.recibo,
    coalesce(u.nome_completo, e.vendedor_nome_systur), c.loja, c.passageiros
  from public.cliente_compras c
  join public.cliente_excursoes e on e.reserva = c.reserva
  left join public.usuarios u on u.id = e.vendedor_usuario_id
  where c.cliente_id = p_cliente and c.loja = any (public._lojas_visiveis())
  order by c.data_confirmacao desc nulls last, c.data_viagem desc nulls last, c.reserva;
$$;

revoke all on function public.base_clientes_compras(uuid) from public, anon;
grant execute on function public.base_clientes_compras(uuid) to authenticated, service_role;

-- Vendedores (nome do Systur) com compra visível — opções do filtro.
create or replace function public.base_clientes_vendedores()
returns table (vendedor text, loja filial_cvc)
language sql
stable
security definer
set search_path = public
as $$
  select distinct e.vendedor_nome_systur, e.loja
  from public.cliente_excursoes e
  where e.vendedor_nome_systur is not null
    and e.loja = any (public._lojas_visiveis())
    and exists (select 1 from public.cliente_compras c where c.reserva = e.reserva)
  order by 1;
$$;

revoke all on function public.base_clientes_vendedores() from public, anon;
grant execute on function public.base_clientes_vendedores() to authenticated, service_role;

-- Sugestões de destino (sem acento, sem diferenciar maiúsculas).
create or replace function public.base_clientes_destinos(p_termo text, p_limite integer default 10)
returns table (destino text, compras bigint)
language sql
stable
security definer
set search_path = public
as $$
  select c.destino_cidade, count(*)
  from public.cliente_compras c
  where c.loja = any (public._lojas_visiveis())
    and c.destino_cidade is not null
    and (public.normalizar_nome(p_termo) is null
         or strpos(public.normalizar_nome(c.destino_cidade), public.normalizar_nome(p_termo)) > 0)
  group by c.destino_cidade
  order by count(*) desc, c.destino_cidade
  limit greatest(coalesce(p_limite, 10), 1);
$$;

revoke all on function public.base_clientes_destinos(text, integer) from public, anon;
grant execute on function public.base_clientes_destinos(text, integer) to authenticated, service_role;

-- Reservas que já existem (vindas do sync): gera as compras e recalcula os
-- clientes. Reaplicar é inofensivo (upsert).
do $$
declare
  v_reserva text;
begin
  for v_reserva in select reserva from public.cliente_excursoes loop
    perform public._cliente_compras_sincronizar(v_reserva);
  end loop;
end;
$$;
