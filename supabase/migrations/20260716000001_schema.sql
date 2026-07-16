-- ============================================================================
-- Sistema de Gestão de Casos Operacionais — CVC
-- Migration 1: enums, tables, triggers, views
-- ============================================================================

-- ----------------------------------------------------------------------------
-- ENUMS
-- ----------------------------------------------------------------------------

create type perfil_usuario as enum ('vendedor', 'gerente', 'adm', 'adm_master');

create type filial_cvc as enum ('1710', '1714', '1730');

create type tipo_caso as enum (
  'alteracao_data',
  'cancelamento',
  'recadastro_sem_reserva',
  'inadimplencia'
);

create type motivo_caso as enum ('pedido_cliente', 'erro_vendedor', 'fornecedor');

create type status_caso as enum (
  'inicial',
  'recepcionado',
  'em_andamento_interno',
  'reavaliacao',
  'resolvido',
  'ouvidoria'
);

create type tipo_desfecho as enum ('reembolso', 'remarcacao', 'carta_credito');

create type subtipo_reembolso as enum ('integral', 'parcial', 'sem_reembolso');

create type origem_reembolso_integral as enum ('fornecedor', 'saude');

create type subtipo_remarcacao as enum ('sem_custo', 'com_custo');

create type quem_paga_multa as enum ('cliente', 'vendedor');

create type tipo_documento_anexo as enum (
  'carta_cancelamento',
  'atestado_saude',
  'certidao_obito',
  'outro'
);

-- ----------------------------------------------------------------------------
-- USUARIOS — profile table 1:1 with auth.users
-- ----------------------------------------------------------------------------

create table public.usuarios (
  id uuid primary key references auth.users (id) on delete cascade,
  nome_completo text not null,
  email text not null unique,
  perfil perfil_usuario not null default 'vendedor',
  filial filial_cvc,
  ativo boolean not null default true,
  criado_em timestamptz not null default now(),
  constraint usuarios_filial_por_perfil check (
    (perfil in ('vendedor', 'gerente') and filial is not null)
    or (perfil in ('adm', 'adm_master') and filial is null)
  )
);

comment on table public.usuarios is 'Perfil de aplicação 1:1 com auth.users. Login/senha ficam no Supabase Auth.';
comment on column public.usuarios.filial is 'Obrigatória para vendedor/gerente; NULL para adm/adm_master (atuam nas três filiais).';

-- Auto-cria o perfil quando um usuário é criado no Supabase Auth.
-- raw_user_meta_data é fornecido pelo admin (adm_master) no momento da criação:
-- { "nome_completo": "...", "perfil": "vendedor", "filial": "1710" }
create function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.usuarios (id, nome_completo, email, perfil, filial)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'nome_completo', new.email),
    new.email,
    coalesce((new.raw_user_meta_data ->> 'perfil')::perfil_usuario, 'vendedor'),
    nullif(new.raw_user_meta_data ->> 'filial', '')::filial_cvc
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ----------------------------------------------------------------------------
-- CASOS
-- ----------------------------------------------------------------------------

create table public.casos (
  id uuid primary key default gen_random_uuid(),
  protocolo bigint generated always as identity unique,
  tipo_caso tipo_caso not null,
  motivo motivo_caso,
  descricao text,
  filial filial_cvc not null,
  vendedor_dono uuid not null references public.usuarios (id),
  vendedor_original_nome text not null,
  criado_por uuid not null references public.usuarios (id),
  prazo_vigencia date not null,
  status_atual status_caso not null default 'inicial',
  elegivel_ouvidoria boolean not null default false,
  criado_em timestamptz not null default now(),

  -- dados do cliente
  contrato_numero text not null,
  cliente_nome text not null,
  cliente_cpf text not null,

  -- exclusivos de inadimplência
  parcelas_em_aberto integer,
  data_cancelamento date,

  constraint casos_cpf_formato check (cliente_cpf ~ '^\d{11}$'),

  constraint casos_campos_por_tipo check (
    case tipo_caso
      when 'alteracao_data' then motivo is not null and descricao is not null
        and parcelas_em_aberto is null and data_cancelamento is null
      when 'cancelamento' then motivo is not null and descricao is not null
        and parcelas_em_aberto is null and data_cancelamento is null
      when 'recadastro_sem_reserva' then motivo is null and descricao is not null
        and parcelas_em_aberto is null and data_cancelamento is null
      when 'inadimplencia' then motivo is null
        and parcelas_em_aberto is not null and data_cancelamento is not null
    end
  )
);

comment on column public.casos.filial is 'Herdada de vendedor_dono; mantida por trigger, não editável diretamente.';
comment on column public.casos.vendedor_original_nome is 'Snapshot do nome do dono original; preservado mesmo após reatribuição por exclusão.';
comment on column public.casos.prazo_vigencia is 'Editável apenas pelo vendedor dono (aplicado via RLS/checagem em app).';

create index casos_vendedor_dono_idx on public.casos (vendedor_dono);
create index casos_filial_idx on public.casos (filial);
create index casos_status_atual_idx on public.casos (status_atual);
create index casos_prazo_vigencia_idx on public.casos (prazo_vigencia);

-- Preenche filial + vendedor_original_nome a partir do vendedor_dono.
create function public.set_caso_defaults()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_filial filial_cvc;
  v_nome text;
begin
  select filial, nome_completo into v_filial, v_nome
  from public.usuarios where id = new.vendedor_dono;

  new.filial := v_filial;

  -- vendedor_original_nome só é definido na criação; reatribuições preservam o nome original.
  if tg_op = 'INSERT' then
    new.vendedor_original_nome := v_nome;
  end if;

  return new;
end;
$$;

create trigger casos_set_defaults
  before insert or update of vendedor_dono on public.casos
  for each row execute function public.set_caso_defaults();

-- ----------------------------------------------------------------------------
-- STATUS_HISTORICO (linha do tempo)
-- ----------------------------------------------------------------------------

create table public.status_historico (
  id uuid primary key default gen_random_uuid(),
  caso_id uuid not null references public.casos (id) on delete cascade,
  status status_caso not null,
  entrou_em timestamptz not null default now(),
  alterado_por uuid not null references public.usuarios (id),
  via_delegacao boolean not null default false
);

create index status_historico_caso_id_idx on public.status_historico (caso_id, entrou_em);

-- Espelha o status mais recente em casos.status_atual.
-- A condição status_atual IS DISTINCT FROM new.status evita um UPDATE
-- redundante quando o valor já é o mesmo (caso do item "Inicial", que já
-- nasce com status_atual='inicial' por default) — sem isso, o UPDATE no-op
-- ainda dispara enforce_casos_update_permissions() e pode ser rejeitado por
-- não corresponder a nenhuma das alterações permitidas para não-admin.
create function public.sync_caso_status()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.casos
  set status_atual = new.status
  where id = new.caso_id and status_atual is distinct from new.status;
  return new;
end;
$$;

create trigger status_historico_sync
  after insert on public.status_historico
  for each row execute function public.sync_caso_status();

-- Insere o item "Inicial" automaticamente na criação do caso.
create function public.insert_status_inicial()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.status_historico (caso_id, status, alterado_por, via_delegacao)
  values (new.id, 'inicial', new.criado_por, false);
  return new;
end;
$$;

create trigger casos_insert_status_inicial
  after insert on public.casos
  for each row execute function public.insert_status_inicial();

-- View com duração acumulada em cada etapa (para a linha do tempo).
create view public.status_historico_com_duracao as
select
  sh.*,
  coalesce(
    lead(sh.entrou_em) over (partition by sh.caso_id order by sh.entrou_em) - sh.entrou_em,
    now() - sh.entrou_em
  ) as duracao
from public.status_historico sh;

comment on view public.status_historico_com_duracao is 'status_historico + duração em cada etapa (até o próximo item ou até agora, se for o atual).';

-- ----------------------------------------------------------------------------
-- DESFECHOS (alternativas — um caso pode ter mais de um)
-- ----------------------------------------------------------------------------

create table public.desfechos (
  id uuid primary key default gen_random_uuid(),
  caso_id uuid not null references public.casos (id) on delete cascade,
  tipo tipo_desfecho not null,

  -- reembolso
  subtipo_reembolso subtipo_reembolso,
  origem_reembolso_integral origem_reembolso_integral,
  banco_nome_completo text,
  banco_agencia text,
  banco_conta text,
  banco_cpf text,
  valor numeric(12, 2),

  -- remarcação
  subtipo_remarcacao subtipo_remarcacao,
  valor_taxas numeric(12, 2),
  valor_diferenca_tarifaria numeric(12, 2),

  criado_por uuid not null references public.usuarios (id),
  criado_em timestamptz not null default now(),

  constraint desfechos_cpf_formato check (banco_cpf is null or banco_cpf ~ '^\d{11}$'),

  constraint desfechos_campos_por_tipo check (
    case tipo
      when 'reembolso' then
        subtipo_reembolso is not null
        and subtipo_remarcacao is null and valor_taxas is null and valor_diferenca_tarifaria is null
        and (
          (subtipo_reembolso in ('integral', 'parcial')
            and banco_nome_completo is not null and banco_agencia is not null
            and banco_conta is not null and banco_cpf is not null and valor is not null)
          or (subtipo_reembolso = 'sem_reembolso')
        )
        and (
          (subtipo_reembolso = 'integral' and origem_reembolso_integral is not null)
          or (subtipo_reembolso <> 'integral' and origem_reembolso_integral is null)
        )
      when 'remarcacao' then
        subtipo_remarcacao is not null
        and subtipo_reembolso is null and origem_reembolso_integral is null
        and banco_nome_completo is null and banco_agencia is null and banco_conta is null
        and banco_cpf is null and valor is null
        and (
          (subtipo_remarcacao = 'com_custo' and valor_taxas is not null and valor_diferenca_tarifaria is not null)
          or (subtipo_remarcacao = 'sem_custo' and valor_taxas is null and valor_diferenca_tarifaria is null)
        )
      when 'carta_credito' then
        valor is not null
        and subtipo_reembolso is null and origem_reembolso_integral is null
        and subtipo_remarcacao is null and valor_taxas is null and valor_diferenca_tarifaria is null
        and banco_nome_completo is null and banco_agencia is null and banco_conta is null and banco_cpf is null
    end
  )
);

create index desfechos_caso_id_idx on public.desfechos (caso_id);

comment on constraint desfechos_campos_por_tipo on public.desfechos is
  'Assume que reembolso subtipo sem_reembolso não exige dados bancários (não há reembolso a pagar) — confirmar com o cliente se a intenção do documento era outra.';

-- ----------------------------------------------------------------------------
-- IMPLICACOES (financeiro — um registro por caso, preenchido pelo adm)
-- ----------------------------------------------------------------------------

create table public.implicacoes (
  id uuid primary key default gen_random_uuid(),
  caso_id uuid not null unique references public.casos (id) on delete cascade,
  multa_contratual_valor numeric(12, 2) not null default 0,
  multa_fornecedor_valor numeric(12, 2) not null default 0,
  quem_paga quem_paga_multa not null,
  reducao_markup boolean not null default false,
  reducao_comissao boolean not null default false,
  reducao_comissao_valor numeric(12, 2),
  utilizacao_cortesia boolean not null default false,
  utilizacao_cortesia_valor numeric(12, 2),
  criado_por uuid not null references public.usuarios (id),
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),

  constraint implicacoes_reducoes_apenas_vendedor check (
    quem_paga = 'vendedor' or (
      not reducao_markup and not reducao_comissao and not utilizacao_cortesia
    )
  ),
  constraint implicacoes_reducao_comissao_valor check (
    (reducao_comissao and reducao_comissao_valor is not null)
    or (not reducao_comissao and reducao_comissao_valor is null)
  ),
  constraint implicacoes_cortesia_valor check (
    (utilizacao_cortesia and utilizacao_cortesia_valor is not null)
    or (not utilizacao_cortesia and utilizacao_cortesia_valor is null)
  )
);

create function public.set_atualizado_em()
returns trigger
language plpgsql
as $$
begin
  new.atualizado_em := now();
  return new;
end;
$$;

create trigger implicacoes_set_atualizado_em
  before update on public.implicacoes
  for each row execute function public.set_atualizado_em();

-- ----------------------------------------------------------------------------
-- ANEXOS (documentos do caso)
-- ----------------------------------------------------------------------------

create table public.anexos (
  id uuid primary key default gen_random_uuid(),
  caso_id uuid not null references public.casos (id) on delete cascade,
  tipo_documento tipo_documento_anexo not null,
  storage_path text not null unique,
  nome_arquivo text not null,
  enviado_por uuid not null references public.usuarios (id),
  enviado_em timestamptz not null default now()
);

create index anexos_caso_id_idx on public.anexos (caso_id);

-- ----------------------------------------------------------------------------
-- DELEGACOES (modo férias do adm)
-- ----------------------------------------------------------------------------

create table public.delegacoes (
  id uuid primary key default gen_random_uuid(),
  adm_id uuid not null references public.usuarios (id),
  gerente_id uuid not null references public.usuarios (id),
  inicio timestamptz not null default now(),
  fim timestamptz,
  ativa boolean not null default true,
  criado_em timestamptz not null default now(),

  constraint delegacoes_fim_apos_inicio check (fim is null or fim > inicio)
);

-- Garante que adm_id é adm_master, gerente_id é gerente, e que não há
-- delegação ainda vigente (ativa=true e dentro da janela inicio/fim) sobrepondo
-- para o mesmo gerente. Implementado via trigger (não índice único) porque a
-- janela de vigência depende de now(), que não pode entrar num predicado de
-- índice parcial (não é IMMUTABLE).
create function public.validate_delegacao()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_perfil_adm perfil_usuario;
  v_perfil_gerente perfil_usuario;
begin
  select perfil into v_perfil_adm from public.usuarios where id = new.adm_id;
  select perfil into v_perfil_gerente from public.usuarios where id = new.gerente_id;

  if v_perfil_adm <> 'adm_master' then
    raise exception 'delegacoes.adm_id deve ser um adm_master';
  end if;

  if v_perfil_gerente <> 'gerente' then
    raise exception 'delegacoes.gerente_id deve ser um gerente';
  end if;

  if new.ativa and exists (
    select 1 from public.delegacoes d
    where d.gerente_id = new.gerente_id
      and d.id is distinct from new.id
      and d.ativa
      and (d.fim is null or d.fim > now())
  ) then
    raise exception 'Já existe uma delegação vigente para este gerente';
  end if;

  return new;
end;
$$;

create trigger delegacoes_validate
  before insert or update on public.delegacoes
  for each row execute function public.validate_delegacao();
