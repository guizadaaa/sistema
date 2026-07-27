-- ============================================================================
-- Sistema de Gestão de Casos Operacionais — CVC
-- Migration: importação de vendas por vendedor via upload de planilha
--
-- Duas tabelas:
--
-- 1. vendas_importadas: uma linha por venda, chave (filial, venda_numero) —
--    "Venda Nº" só é garantidamente única dentro da mesma loja/planilha, daí
--    o par. Um novo upload (cumulativo: sempre do dia 1 do mês até a data do
--    envio) faz upsert nesse par — vendas já existentes têm os campos
--    atualizados (cobre correção de dado a montante entre dois uploads),
--    vendas novas são inseridas. vendedor_nome_planilha é sempre o texto cru
--    da planilha, nunca resolvido/normalizado aqui — a resolução pra um
--    usuario_id acontece dinamicamente na view vendas_com_vendedor.
--
-- 2. vendedores_mapeamento: vínculo HISTÓRICO nome da planilha -> usuario_id
--    (nullable — null = "nome identificado, sem conta no sistema", caso de
--    ex-funcionário). Nunca é editado nem apagado (mesmo racional de
--    casos_complementos: histórico imutável) — um vendedor que muda de loja
--    ganha uma linha NOVA (nome_planilha, filial diferente), a antiga
--    continua valendo pro período/loja dela. vigente_desde/vigente_ate
--    delimitam o período em que o vínculo vale; ambos nulos = vale sempre.
--    Overlap entre linhas do MESMO (nome_planilha, filial) é bloqueado por
--    trigger (mesmo padrão de validate_delegacao,
--    20260721000005_delegacoes_agendamento_fix_sobreposicao.sql) — linhas de
--    filiais diferentes nunca conflitam entre si, é assim que a mudança de
--    loja funciona sem precisar fechar a linha antiga.
--
-- A resolução venda -> usuario_id é feita em tempo de leitura (view
-- vendas_com_vendedor), não gravada na venda: assim, criar um mapeamento
-- novo resolve automaticamente qualquer venda já importada (passada ou
-- futura) que combine nome+filial+data — sem precisar reprocessar nada,
-- exatamente o comportamento quando o nome de um ex-funcionário reaparece
-- numa venda atrasada.
-- ============================================================================

create table public.vendas_importadas (
  id uuid primary key default gen_random_uuid(),
  filial filial_cvc not null,
  venda_numero bigint not null,
  vendedor_nome_planilha text not null,
  data_venda date not null,
  pagante text not null,
  produto text not null,
  valor_total numeric(12, 2) not null,
  importado_por uuid not null references public.usuarios (id),
  importado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),

  unique (filial, venda_numero)
);

create index vendas_importadas_filial_vendedor_idx
  on public.vendas_importadas (filial, vendedor_nome_planilha);

comment on table public.vendas_importadas is
  'Vendas importadas via upload de planilha (Adm/Adm Master). Chave de upsert: (filial, venda_numero).';

create table public.vendedores_mapeamento (
  id uuid primary key default gen_random_uuid(),
  nome_planilha text not null,
  filial filial_cvc not null,
  usuario_id uuid references public.usuarios (id),
  vigente_desde date,
  vigente_ate date,
  criado_por uuid not null references public.usuarios (id),
  criado_em timestamptz not null default now(),

  constraint vendedores_mapeamento_periodo_valido
    check (vigente_desde is null or vigente_ate is null or vigente_desde <= vigente_ate)
);

create index vendedores_mapeamento_nome_filial_idx
  on public.vendedores_mapeamento (nome_planilha, filial);

comment on table public.vendedores_mapeamento is
  'Vínculo histórico nome-da-planilha -> usuario_id. Append-only (sem UPDATE/DELETE) — mudança de loja ou correção vira uma linha nova, nunca sobrescreve a anterior. usuario_id nulo = nome identificado mas sem conta no sistema (ex-funcionário).';
comment on column public.vendedores_mapeamento.usuario_id is
  'Nulo = "sem conta" (ex-funcionário identificado, sem login) — ver comment da tabela. Não confundir com "pendente de vínculo" (nenhuma linha de mapeamento encontrada), que é a ausência de qualquer linha, não usuario_id nulo numa linha existente.';

-- ----------------------------------------------------------------------------
-- Triggers: nunca confiar no client pra importado_por/criado_por.
-- ----------------------------------------------------------------------------

create function public.set_venda_importada_importado_por()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  new.importado_por := auth.uid();
  return new;
end;
$$;

create trigger vendas_importadas_set_importado_por
  before insert on public.vendas_importadas
  for each row execute function public.set_venda_importada_importado_por();

-- Upsert (on conflict (filial, venda_numero) do update) só pode alterar os
-- campos de conteúdo — importado_por/importado_em documentam a IMPORTAÇÃO
-- ORIGINAL, nunca mudam depois; atualizado_em marca a última atualização.
create function public.set_venda_importada_atualizado_em()
returns trigger
language plpgsql
as $$
begin
  new.importado_por := old.importado_por;
  new.importado_em := old.importado_em;
  new.atualizado_em := now();
  return new;
end;
$$;

create trigger vendas_importadas_set_atualizado_em
  before update on public.vendas_importadas
  for each row execute function public.set_venda_importada_atualizado_em();

create function public.set_vendedor_mapeamento_criado_por()
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

create trigger vendedores_mapeamento_set_criado_por
  before insert on public.vendedores_mapeamento
  for each row execute function public.set_vendedor_mapeamento_criado_por();

-- Bloqueia dois vínculos do mesmo (nome_planilha, filial) com período
-- sobreposto — mesma lógica de intervalo de validate_delegacao, adaptada
-- pra date (inclusive nas duas pontas) em vez de timestamptz.
create function public.validate_vendedor_mapeamento()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if exists (
    select 1 from public.vendedores_mapeamento m
    where m.nome_planilha = new.nome_planilha
      and m.filial = new.filial
      and coalesce(m.vigente_desde, '-infinity'::date) <= coalesce(new.vigente_ate, 'infinity'::date)
      and coalesce(new.vigente_desde, '-infinity'::date) <= coalesce(m.vigente_ate, 'infinity'::date)
  ) then
    raise exception 'Já existe um vínculo para "%" nesta loja com período sobreposto.', new.nome_planilha;
  end if;
  return new;
end;
$$;

create trigger vendedores_mapeamento_validate
  before insert on public.vendedores_mapeamento
  for each row execute function public.validate_vendedor_mapeamento();

-- ----------------------------------------------------------------------------
-- RLS
-- ----------------------------------------------------------------------------

alter table public.vendas_importadas enable row level security;

-- Sem policy de SELECT na tabela crua — leitura exclusiva pela view
-- vendas_com_vendedor (mesmo padrão de desfechos/desfechos_visivel).
create policy vendas_importadas_insert
  on public.vendas_importadas for insert to authenticated
  with check (public.auth_is_admin());

create policy vendas_importadas_update
  on public.vendas_importadas for update to authenticated
  using (public.auth_is_admin())
  with check (public.auth_is_admin());

alter table public.vendedores_mapeamento enable row level security;

-- Exclusivo adm_master (não "adm") — mesma tela, sem policy de update/delete
-- (histórico imutável).
create policy vendedores_mapeamento_select
  on public.vendedores_mapeamento for select to authenticated
  using (public.auth_is_adm_master());

create policy vendedores_mapeamento_insert
  on public.vendedores_mapeamento for insert to authenticated
  with check (public.auth_is_adm_master());

-- ----------------------------------------------------------------------------
-- View: única via de leitura de vendas — resolve o vendedor dinamicamente
-- (nome + filial + data dentro do período do vínculo) e já aplica a
-- visibilidade por perfil no próprio WHERE (mesmo padrão de
-- desfechos_visivel/status_historico_com_duracao).
-- ----------------------------------------------------------------------------

create view public.vendas_com_vendedor as
select
  v.id,
  v.filial,
  v.venda_numero,
  v.vendedor_nome_planilha,
  v.data_venda,
  v.pagante,
  v.produto,
  v.valor_total,
  v.importado_por,
  v.importado_em,
  v.atualizado_em,
  m.id as mapeamento_id,
  m.usuario_id
from public.vendas_importadas v
left join public.vendedores_mapeamento m
  on m.filial = v.filial
  and m.nome_planilha = v.vendedor_nome_planilha
  and v.data_venda >= coalesce(m.vigente_desde, '-infinity'::date)
  and v.data_venda <= coalesce(m.vigente_ate, 'infinity'::date)
where
  public.auth_is_admin()
  or (public.auth_ativo() and public.auth_perfil() = 'gerente' and v.filial = public.auth_filial())
  or (public.auth_ativo() and m.usuario_id = auth.uid());

comment on view public.vendas_com_vendedor is
  'Única via de leitura de vendas para o client. mapeamento_id nulo = pendente de vínculo (nenhum vendedores_mapeamento bate); usuario_id nulo com mapeamento_id preenchido = vínculo "sem conta" (ex-funcionário identificado).';

grant insert, update on public.vendas_importadas to authenticated;
grant select, insert, update, delete on public.vendas_importadas to service_role;

grant select, insert on public.vendedores_mapeamento to authenticated;
grant select, insert, update, delete on public.vendedores_mapeamento to service_role;

grant select on public.vendas_com_vendedor to authenticated, service_role;
