-- ============================================================================
-- Aura Conferência — Etapa 1b: dono pela loja da venda + transferência de
-- vendedor entre lojas.
--
-- Vendedores mudam de loja (ex.: vendeu na 1710 e na 1714, hoje está na
-- 1730), mas no Systur a venda continua na loja onde foi feita. Regra de
-- leitura de cliente_excursoes, recibos, cliente_voo_eventos e clientes:
--
--   1. O dado pertence à loja da venda (loja da reserva/recibo). Nunca
--      aparece para outra loja, exceto para adm/adm_master.
--   2. O vendedor vê a venda só se é o vendedor_usuario_id, está ativo e a
--      usuarios.filial ATUAL dele = loja da venda.
--   3. Vendedor transferido, inativado ou sem vínculo no mapeamento: só a
--      gerência da loja da venda vê (gerente ativo com filial = loja; o
--      gerente vê a loja inteira de qualquer forma).
--   4. adm e adm_master veem tudo.
--   5. clientes: visível para quem enxerga ao menos uma reserva/recibo dele.
--
-- Nada é copiado nem regravado: pode_ver_venda() é avaliada na consulta,
-- então transferir, inativar ou reativar alguém muda a visibilidade na hora.
--
-- Transferência: transferir_usuario_loja() muda usuarios.filial, registra em
-- usuario_transferencias e fecha (sem apagar) o vínculo do Linkly nos links
-- da loja de origem — o link é um posto físico daquela loja.
--
-- Idempotente (create or replace / if not exists / drop policy if exists).
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Regra de visibilidade
-- ----------------------------------------------------------------------------

-- Vendedor responsável pela venda HOJE: ativo e lotado na loja da venda.
create or replace function public.vendedor_responsavel_ativo(p_loja filial_cvc, p_vendedor uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select p_vendedor is not null and exists (
    select 1 from public.usuarios u
    where u.id = p_vendedor and u.ativo and u.filial = p_loja
  );
$$;

create or replace function public.usuario_pode_ver_venda(p_usuario uuid, p_loja filial_cvc, p_vendedor uuid)
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
        or (p_vendedor is not null and u.id = p_vendedor and u.filial = p_loja)
      )
  );
$$;

create or replace function public.pode_ver_venda(p_loja filial_cvc, p_vendedor uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.usuario_pode_ver_venda(auth.uid(), p_loja, p_vendedor);
$$;

comment on function public.pode_ver_venda(filial_cvc, uuid) is
  'Visibilidade de reserva/recibo da Aura Conferência para o usuário autenticado: adm/adm_master tudo; gerente ativo a loja dele; vendedor só a própria venda e só enquanto ativo e lotado na loja da venda.';

-- As funções de 20261023000002 passam a seguir a mesma regra (rotas da API
-- — PDF do recibo e "cliente avisado" — usam usuario_pode_ver_conferencia).
create or replace function public.usuario_pode_ver_conferencia(p_usuario uuid, p_loja filial_cvc, p_vendedor uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.usuario_pode_ver_venda(p_usuario, p_loja, p_vendedor);
$$;

create or replace function public.auth_pode_ver_conferencia(p_loja filial_cvc, p_vendedor uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.pode_ver_venda(p_loja, p_vendedor);
$$;

revoke all on function public.vendedor_responsavel_ativo(filial_cvc, uuid) from public, anon;
grant execute on function public.vendedor_responsavel_ativo(filial_cvc, uuid) to authenticated, service_role;
revoke all on function public.usuario_pode_ver_venda(uuid, filial_cvc, uuid) from public, anon, authenticated;
grant execute on function public.usuario_pode_ver_venda(uuid, filial_cvc, uuid) to service_role;
revoke all on function public.pode_ver_venda(filial_cvc, uuid) from public, anon;
grant execute on function public.pode_ver_venda(filial_cvc, uuid) to authenticated, service_role;

-- ----------------------------------------------------------------------------
-- RLS
-- ----------------------------------------------------------------------------

drop policy if exists cliente_excursoes_select on public.cliente_excursoes;
create policy cliente_excursoes_select
  on public.cliente_excursoes for select to authenticated
  using (public.pode_ver_venda(loja, vendedor_usuario_id));

drop policy if exists recibos_select on public.recibos;
create policy recibos_select
  on public.recibos for select to authenticated
  using (public.pode_ver_venda(loja, vendedor_usuario_id));

drop policy if exists cliente_voo_eventos_select on public.cliente_voo_eventos;
create policy cliente_voo_eventos_select
  on public.cliente_voo_eventos for select to authenticated
  using (
    exists (
      select 1 from public.cliente_excursoes e
      where e.reserva = cliente_voo_eventos.reserva
        and public.pode_ver_venda(e.loja, e.vendedor_usuario_id)
    )
  );

-- Regra 5: substitui a regra "vendedor da compra mais recente".
drop policy if exists clientes_select on public.clientes;
create policy clientes_select
  on public.clientes for select to authenticated
  using (
    exists (
      select 1 from public.cliente_excursoes e
      where e.cliente_id = clientes.id and public.pode_ver_venda(e.loja, e.vendedor_usuario_id)
    )
    or exists (
      select 1 from public.recibos r
      where r.cliente_id = clientes.id and public.pode_ver_venda(r.loja, r.vendedor_usuario_id)
    )
  );

drop policy if exists storage_recibos_select on storage.objects;
create policy storage_recibos_select
  on storage.objects for select to authenticated
  using (
    bucket_id = 'recibos'
    and exists (
      select 1 from public.recibos r
      where r.pdf_path = storage.objects.name
        and public.pode_ver_venda(r.loja, r.vendedor_usuario_id)
    )
  );

-- ----------------------------------------------------------------------------
-- Campo calculado "responsável" (aba Clientes — Etapa 2). Funções sobre o
-- tipo da linha = campos calculados no PostgREST:
--   .select('*, responsavel, da_gerencia')  /  .eq('da_gerencia', true)
-- responsavel: nome do vendedor quando a regra 2 vale; senão
-- "Gerência da loja XXXX". da_gerencia: true quando é da gerência.
-- ----------------------------------------------------------------------------

create or replace function public._responsavel_venda(p_loja filial_cvc, p_vendedor uuid)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select case
    when public.vendedor_responsavel_ativo(p_loja, p_vendedor)
      then (select u.nome_completo from public.usuarios u where u.id = p_vendedor)
    else 'Gerência da loja ' || p_loja::text
  end;
$$;

create or replace function public.responsavel(public.cliente_excursoes)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select public._responsavel_venda($1.loja, $1.vendedor_usuario_id);
$$;

create or replace function public.da_gerencia(public.cliente_excursoes)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select not public.vendedor_responsavel_ativo($1.loja, $1.vendedor_usuario_id);
$$;

create or replace function public.responsavel(public.recibos)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select public._responsavel_venda($1.loja, $1.vendedor_usuario_id);
$$;

create or replace function public.da_gerencia(public.recibos)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select not public.vendedor_responsavel_ativo($1.loja, $1.vendedor_usuario_id);
$$;

-- Cliente: vendas visíveis ao usuário (mesma regra da RLS). Responsável =
-- vendedor(es) ativo(s) na loja dessas vendas; nenhum = "Gerência da loja"
-- (cliente da gerência: o vendedor saiu da loja, foi inativado ou não tem
-- vínculo no mapeamento).
create or replace function public._vendas_visiveis_cliente(p_cliente uuid)
returns table (loja filial_cvc, vendedor_usuario_id uuid)
language sql
stable
security definer
set search_path = public
as $$
  select e.loja, e.vendedor_usuario_id from public.cliente_excursoes e
  where e.cliente_id = p_cliente and public.pode_ver_venda(e.loja, e.vendedor_usuario_id)
  union
  select r.loja, r.vendedor_usuario_id from public.recibos r
  where r.cliente_id = p_cliente and public.pode_ver_venda(r.loja, r.vendedor_usuario_id);
$$;

create or replace function public.responsavel(public.clientes)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select string_agg(distinct u.nome_completo, ', ')
     from public._vendas_visiveis_cliente($1.id) v
     join public.usuarios u on u.id = v.vendedor_usuario_id
     where public.vendedor_responsavel_ativo(v.loja, v.vendedor_usuario_id)),
    (select 'Gerência da loja ' || string_agg(distinct v.loja::text, ', ')
     from public._vendas_visiveis_cliente($1.id) v)
  );
$$;

create or replace function public.da_gerencia(public.clientes)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select not exists (
    select 1 from public._vendas_visiveis_cliente($1.id) v
    where public.vendedor_responsavel_ativo(v.loja, v.vendedor_usuario_id)
  );
$$;

revoke all on function public._responsavel_venda(filial_cvc, uuid) from public, anon, authenticated;
revoke all on function public._vendas_visiveis_cliente(uuid) from public, anon, authenticated;
grant execute on function public._responsavel_venda(filial_cvc, uuid) to service_role;
grant execute on function public._vendas_visiveis_cliente(uuid) to service_role;
revoke all on function public.responsavel(public.cliente_excursoes) from public, anon;
revoke all on function public.da_gerencia(public.cliente_excursoes) from public, anon;
revoke all on function public.responsavel(public.recibos) from public, anon;
revoke all on function public.da_gerencia(public.recibos) from public, anon;
revoke all on function public.responsavel(public.clientes) from public, anon;
revoke all on function public.da_gerencia(public.clientes) from public, anon;
grant execute on function public.responsavel(public.cliente_excursoes) to authenticated, service_role;
grant execute on function public.da_gerencia(public.cliente_excursoes) to authenticated, service_role;
grant execute on function public.responsavel(public.recibos) to authenticated, service_role;
grant execute on function public.da_gerencia(public.recibos) to authenticated, service_role;
grant execute on function public.responsavel(public.clientes) to authenticated, service_role;
grant execute on function public.da_gerencia(public.clientes) to authenticated, service_role;

-- ----------------------------------------------------------------------------
-- Histórico de transferências
-- ----------------------------------------------------------------------------

create table if not exists public.usuario_transferencias (
  id uuid primary key default gen_random_uuid(),
  usuario_id uuid not null references public.usuarios (id),
  loja_de filial_cvc not null,
  loja_para filial_cvc not null,
  feito_por uuid not null references public.usuarios (id),
  feito_em timestamptz not null default now(),
  observacao text,

  constraint usuario_transferencias_lojas_diferentes check (loja_de <> loja_para)
);

create index if not exists usuario_transferencias_usuario_idx on public.usuario_transferencias (usuario_id, feito_em desc);

comment on table public.usuario_transferencias is
  'Histórico de mudança de loja (usuarios.filial). Escrita só por transferir_usuario_loja(); visível para adm/adm_master e gerentes das duas lojas.';

alter table public.usuario_transferencias enable row level security;

drop policy if exists usuario_transferencias_select on public.usuario_transferencias;
create policy usuario_transferencias_select
  on public.usuario_transferencias for select to authenticated
  using (
    public.auth_is_admin()
    or (public.auth_perfil() = 'gerente' and public.auth_filial() in (loja_de, loja_para))
  );

grant select on public.usuario_transferencias to authenticated;
grant select, insert, update, delete on public.usuario_transferencias to service_role;

-- Histórico com nomes (o gerente não lê usuarios de outras lojas, ex.: o adm
-- que fez a transferência). Mesmo filtro da policy acima.
create or replace function public.usuario_transferencias_historico(p_usuario uuid)
returns table (
  id uuid,
  loja_de filial_cvc,
  loja_para filial_cvc,
  feito_em timestamptz,
  feito_por_nome text,
  observacao text
)
language sql
stable
security definer
set search_path = public
as $$
  select t.id, t.loja_de, t.loja_para, t.feito_em, u.nome_completo, t.observacao
  from public.usuario_transferencias t
  join public.usuarios u on u.id = t.feito_por
  where t.usuario_id = p_usuario
    and (
      public.auth_is_admin()
      or (public.auth_perfil() = 'gerente' and public.auth_filial() in (t.loja_de, t.loja_para))
    )
  order by t.feito_em desc;
$$;

revoke all on function public.usuario_transferencias_historico(uuid) from public, anon;
grant execute on function public.usuario_transferencias_historico(uuid) to authenticated, service_role;

-- ----------------------------------------------------------------------------
-- transferir_usuario_loja
--   gerente: só vendedor da própria loja, para outra loja;
--   adm/adm_master: qualquer vendedor/gerente, qualquer loja.
-- (adm/adm_master não têm loja — usuarios_filial_por_perfil.)
-- ----------------------------------------------------------------------------

create or replace function public.transferir_usuario_loja(
  p_usuario_id uuid,
  p_loja_para filial_cvc,
  p_observacao text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_quem public.usuarios%rowtype;
  v_alvo public.usuarios%rowtype;
  v_id uuid;
  v_hoje date := (now() at time zone 'America/Sao_Paulo')::date;
begin
  select * into v_quem from public.usuarios where id = auth.uid() and ativo;
  if not found or v_quem.perfil not in ('gerente', 'adm', 'adm_master') then
    raise exception 'Sem permissão para transferir usuários de loja.' using errcode = '42501';
  end if;

  if p_loja_para is null then
    raise exception 'Informe a loja de destino.' using errcode = '22023';
  end if;

  select * into v_alvo from public.usuarios where id = p_usuario_id for update;
  if not found then
    raise exception 'Usuário não encontrado.' using errcode = '22023';
  end if;
  if v_alvo.perfil not in ('vendedor', 'gerente') or v_alvo.filial is null then
    raise exception 'Só vendedor e gerente têm loja para transferir.' using errcode = '22023';
  end if;
  if v_alvo.filial = p_loja_para then
    raise exception 'O usuário já está na loja %.', p_loja_para using errcode = '22023';
  end if;

  if v_quem.perfil = 'gerente' and (v_alvo.perfil <> 'vendedor' or v_alvo.filial <> v_quem.filial) then
    raise exception 'Gerente só transfere vendedores da própria loja.' using errcode = '42501';
  end if;

  insert into public.usuario_transferencias (usuario_id, loja_de, loja_para, feito_por, observacao)
  values (v_alvo.id, v_alvo.filial, p_loja_para, v_quem.id, nullif(trim(p_observacao), ''))
  returning id into v_id;

  update public.usuarios set filial = p_loja_para where id = v_alvo.id;

  -- Linkly: o link é um posto da loja de origem. Fecha o vínculo vigente
  -- (vale até ontem; nada é apagado) — o posto fica "sem vendedor" até o
  -- adm_master atribuir o próximo, e os cliques depois disso não contam
  -- para quem saiu (ver linkly_cliques_mes abaixo).
  update public.linkly_vendedor_mapeamento m
  set vigente_ate = greatest(m.vigente_desde, v_hoje - 1)
  from public.linkly_links l
  where l.id = m.link_id
    and l.filial = v_alvo.filial
    and m.usuario_id = v_alvo.id
    and m.vigente_ate is null;

  return v_id;
end;
$$;

comment on function public.transferir_usuario_loja(uuid, filial_cvc, text) is
  'Muda usuarios.filial (gerente: vendedor da própria loja; adm/adm_master: qualquer vendedor/gerente), registra em usuario_transferencias e fecha o vínculo do Linkly nos links da loja de origem.';

revoke all on function public.transferir_usuario_loja(uuid, filial_cvc, text) from public, anon;
grant execute on function public.transferir_usuario_loja(uuid, filial_cvc, text) to authenticated;

-- ----------------------------------------------------------------------------
-- linkly_cliques_mes: vínculo encerrado sem sucessor (transferência) passa a
-- contar até o snapshot do dia em que encerrou, e não até o fim do mês.
-- Única mudança em relação a 20261006000010: o coalesce de fim_periodo.
-- ----------------------------------------------------------------------------

create or replace function public.linkly_cliques_mes(p_mes date)
returns table (
  mapeamento_id uuid,
  link_id uuid,
  filial filial_cvc,
  short_url text,
  usuario_id uuid,
  inicio date,
  fim date,
  cliques bigint,
  base_parcial boolean,
  contagem_desde date
)
language sql stable security definer set search_path = public
as $$
  with params as (
    select date_trunc('month', p_mes)::date as d0,
           (date_trunc('month', p_mes) + interval '1 month - 1 day')::date as d1
  ),
  periodos as (
    select m.*,
      lead(m.cliques_totais_no_inicio) over (partition by m.link_id order by m.vigente_desde) as total_inicio_proximo
    from public.linkly_vendedor_mapeamento m
  ),
  calculo as (
    select
      pe.id as mapeamento_id,
      pe.link_id,
      l.filial,
      l.short_url,
      pe.usuario_id,
      greatest(pe.vigente_desde, p.d0) as inicio,
      least(coalesce(pe.vigente_ate, p.d1), p.d1) as fim,
      case when pe.vigente_desde > p.d0 then greatest(lm.base, pe.cliques_totais_no_inicio) else lm.base end as base_periodo,
      case
        when pe.vigente_ate is not null and pe.vigente_ate < p.d1 then coalesce(
          pe.total_inicio_proximo,
          (select s.total from public.linkly_cliques_snapshots s
           where s.link_id = pe.link_id and s.data <= pe.vigente_ate
           order by s.data desc limit 1),
          lm.total_fim
        )
        else lm.total_fim
      end as fim_periodo,
      lm.base_parcial and pe.vigente_desde <= lm.contagem_desde as base_parcial,
      case when lm.base_parcial and pe.vigente_desde <= lm.contagem_desde then lm.contagem_desde end as contagem_desde
    from periodos pe
    cross join params p
    join public.linkly_links l on l.id = pe.link_id
    join public._linkly_links_no_mes(p_mes) lm on lm.link_id = pe.link_id
    where pe.vigente_desde <= p.d1
      and (pe.vigente_ate is null or pe.vigente_ate >= p.d0)
  )
  select
    mapeamento_id, link_id, filial, short_url, usuario_id, inicio, fim,
    greatest(0, fim_periodo - base_periodo)::bigint as cliques,
    base_parcial, contagem_desde
  from calculo c
  where
    public.auth_is_admin()
    or (public.auth_ativo() and public.auth_perfil() = 'gerente' and c.filial = public.auth_filial())
    or (public.auth_ativo() and c.usuario_id = auth.uid());
$$;

revoke all on function public.linkly_cliques_mes(date) from public, anon;
grant execute on function public.linkly_cliques_mes(date) to authenticated, service_role;
