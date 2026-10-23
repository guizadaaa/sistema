-- ============================================================================
-- Aura Conferência (extensão do Systur) — Etapa 1: mapeamento de vendedores
--
-- A lista de excursões do Systur traz o vendedor só pelo NOME exibido no
-- Systur. systur_vendedor_mapeamento liga esse nome (por loja) a um usuário
-- da Aura — mesmo papel de linkly_vendedor_mapeamento/vendedores_mapeamento,
-- mas aqui sem histórico: o nome do Systur é de uma pessoa só, então o
-- vínculo é corrigido no lugar (UPDATE) pelo admin.
--
-- Nome novo recebido pela API (/api/conferencia/sync) entra sem vínculo
-- (usuario_id null) para o admin vincular depois na tela
-- /cliques/vendedores-systur. Ao vincular, as reservas/recibos/clientes já
-- recebidos com aquele nome passam a apontar para o usuário (trigger na
-- migration 20261023000002, que cria essas tabelas).
--
-- Idempotente (if not exists / create or replace / on conflict).
-- ============================================================================

-- Normalização de nome para casar "Tálita  MARCELA" com "talita marcela":
-- minúsculas, sem acento, espaços colapsados. translate() em vez da
-- extensão unaccent para não depender de extensão extra.
create or replace function public.normalizar_nome(p_nome text)
returns text
language sql
immutable
set search_path = public
as $$
  select nullif(
    regexp_replace(
      translate(
        lower(trim(coalesce(p_nome, ''))),
        'áàâãäåéèêëíìîïóòôõöúùûüçñý',
        'aaaaaaeeeeiiiiooooouuuucny'
      ),
      '\s+', ' ', 'g'
    ),
    ''
  );
$$;

create table if not exists public.systur_vendedor_mapeamento (
  id uuid primary key default gen_random_uuid(),
  nome_systur text not null check (length(trim(nome_systur)) > 0),
  loja filial_cvc not null,
  usuario_id uuid references public.usuarios (id),
  login_systur text,
  ativo boolean not null default true,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),

  constraint systur_vendedor_mapeamento_nome_loja_key unique (loja, nome_systur)
);

comment on table public.systur_vendedor_mapeamento is
  'Nome do vendedor como aparece no Systur (por loja) -> usuário da Aura. usuario_id null = sem vínculo (criado automaticamente pela API ao receber um nome novo). Escrita: admin (tela) ou service_role (API).';
comment on column public.systur_vendedor_mapeamento.nome_systur is
  'Texto exato da coluna vendedor da lista de excursões do Systur.';
comment on column public.systur_vendedor_mapeamento.login_systur is
  'Login do vendedor no Systur (ex.: SPBG0007), opcional.';

create index if not exists systur_vendedor_mapeamento_usuario_idx
  on public.systur_vendedor_mapeamento (usuario_id);

-- set_atualizado_em() já existe (20260716000001_schema.sql).
drop trigger if exists systur_vendedor_mapeamento_set_atualizado_em on public.systur_vendedor_mapeamento;
create trigger systur_vendedor_mapeamento_set_atualizado_em
  before update on public.systur_vendedor_mapeamento
  for each row execute function public.set_atualizado_em();

-- ----------------------------------------------------------------------------
-- RLS: leitura admin (todas) e gerente (própria loja); escrita só admin.
-- INSERT/DELETE pelo cliente não existem — nomes novos vêm da API
-- (service_role), e uma linha nunca é apagada (só desativada).
-- ----------------------------------------------------------------------------

alter table public.systur_vendedor_mapeamento enable row level security;

drop policy if exists systur_vendedor_mapeamento_select on public.systur_vendedor_mapeamento;
create policy systur_vendedor_mapeamento_select
  on public.systur_vendedor_mapeamento for select to authenticated
  using (
    public.auth_is_admin()
    or (public.auth_perfil() = 'gerente' and loja = public.auth_filial())
  );

drop policy if exists systur_vendedor_mapeamento_update on public.systur_vendedor_mapeamento;
create policy systur_vendedor_mapeamento_update
  on public.systur_vendedor_mapeamento for update to authenticated
  using (public.auth_is_admin())
  with check (public.auth_is_admin());

-- Nome e loja são a chave vinda do Systur: o admin só mexe em vínculo,
-- login e ativo.
revoke update on public.systur_vendedor_mapeamento from authenticated;
grant select on public.systur_vendedor_mapeamento to authenticated;
grant update (usuario_id, login_systur, ativo) on public.systur_vendedor_mapeamento to authenticated;
grant select, insert, update, delete on public.systur_vendedor_mapeamento to service_role;

-- ----------------------------------------------------------------------------
-- Sugestão de vínculo (o admin confirma na tela). Casa o nome normalizado
-- com usuarios.nome_completo; havendo mais de um candidato, prefere quem é
-- da mesma loja e, depois, quem já tem link do Linkly nessa loja. Empate
-- que sobra = sem sugestão (melhor não sugerir do que sugerir errado).
-- Fallback: primeiro + último nome iguais, também só com candidato único.
-- ----------------------------------------------------------------------------

create or replace function public.systur_sugestoes_vinculo()
returns table (mapeamento_id uuid, usuario_id uuid, origem text)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.auth_is_admin() then
    raise exception 'Apenas administradores podem ver sugestões de vínculo.' using errcode = '42501';
  end if;

  return query
  with candidatos as (
    select
      m.id as mapeamento_id,
      u.id as usuario_id,
      exists (
        select 1
        from public.linkly_vendedor_mapeamento lm
        join public.linkly_links l on l.id = lm.link_id
        where lm.usuario_id = u.id and l.filial = m.loja
      ) as no_linkly,
      (u.filial = m.loja) as mesma_loja,
      case
        when public.normalizar_nome(u.nome_completo) = public.normalizar_nome(m.nome_systur) then 1
        else 2
      end as forca
    from public.systur_vendedor_mapeamento m
    join public.usuarios u on u.ativo
      and (
        public.normalizar_nome(u.nome_completo) = public.normalizar_nome(m.nome_systur)
        or (
          split_part(public.normalizar_nome(u.nome_completo), ' ', 1) = split_part(public.normalizar_nome(m.nome_systur), ' ', 1)
          and regexp_replace(public.normalizar_nome(u.nome_completo), '^.* ', '')
            = regexp_replace(public.normalizar_nome(m.nome_systur), '^.* ', '')
          and position(' ' in public.normalizar_nome(m.nome_systur)) > 0
        )
      )
    where m.usuario_id is null
  ),
  ranqueados as (
    select
      c.*,
      rank() over (
        partition by c.mapeamento_id
        order by c.forca, c.mesma_loja desc, c.no_linkly desc
      ) as posicao
    from candidatos c
  )
  select r.mapeamento_id, r.usuario_id, case when r.no_linkly then 'linkly' else 'usuario' end
  from ranqueados r
  where r.posicao = 1
    and (select count(*) from ranqueados r2 where r2.mapeamento_id = r.mapeamento_id and r2.posicao = 1) = 1;
end;
$$;

revoke all on function public.systur_sugestoes_vinculo() from public, anon;
grant execute on function public.systur_sugestoes_vinculo() to authenticated, service_role;

-- ----------------------------------------------------------------------------
-- Semente: nomes já vistos na lista da 1710 (sem vínculo — o admin confirma
-- as sugestões na tela). O login SPBG0007 (Guilherme, admin) não tem nome de
-- vendedor no Systur: fica em conferencia_config.logins_gravacao.
-- ----------------------------------------------------------------------------

insert into public.systur_vendedor_mapeamento (nome_systur, loja, login_systur) values
  ('Dayane Peres Kawaguchi', '1710', 'CWBG0109'),
  ('Rosane Karina Dos Santos', '1710', null),
  ('Alejandra Beatriz Garcia', '1710', null),
  ('Adriana Magalhaes De Oliveira', '1710', null),
  ('Yasmin Nycoli De Oliveira Souza', '1710', null),
  ('Bryan Luis Santos Da Rocha', '1710', null),
  ('Jean Carlos Campos Olynik', '1710', null),
  ('Tálita Marcela Gomes Damas', '1710', null),
  ('Sophia De Souza', '1710', null)
on conflict (loja, nome_systur) do nothing;
