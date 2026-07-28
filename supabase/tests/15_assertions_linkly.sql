-- ============================================================================
-- Teste de regressão para linkly_links/linkly_vendedor_mapeamento/
-- linkly_cliques_totais (migration 20260728000001_linkly_cliques.sql).
--
-- Cobre:
--   1. linkly_links: INSERT exige adm_master (vendedor/gerente não conseguem);
--      check constraint filial obrigatória p/ tipo=vendedor, proibida p/ vitrine.
--   2. linkly_vendedor_mapeamento: SELECT exige adm_master; INSERT direto do
--      client é bloqueado (sem policy nenhuma) mesmo pra adm_master — único
--      caminho de escrita é atribuir_vendedor_link().
--   3. atribuir_vendedor_link(): exige adm_master; primeira atribuição
--      (snapshot 0, sem sync ainda); reatribuição fecha a linha antiga
--      (vigente_ate) e abre a nova com snapshot do total atual; reatribuir pro
--      mesmo vendedor vigente ou com data <= início do vigente é bloqueado.
--   4. linkly_cliques_por_periodo: delta calculado corretamente pro período
--      fechado (snapshot novo - snapshot antigo) e pro período vigente
--      (total atual - snapshot); visibilidade por perfil (vendedor só a
--      própria linha, mesmo as antigas; gerente só da própria filial; adm_master
--      tudo).
--   5. linkly_cliques_vitrine: só adm/adm_master.
--   6. Overlap: trigger de defesa em profundidade bloqueia INSERT direto
--      (via postgres, bypassando RLS) com período sobreposto.
-- ============================================================================

set role postgres;

create or replace function public._test_assert(p_rotulo text, p_condicao boolean)
returns void
language plpgsql
as $$
begin
  if not p_condicao then
    raise exception 'FALHOU: %', p_rotulo;
  end if;
  raise notice 'ok: %', p_rotulo;
end;
$$;

-- ----------------------------------------------------------------------------
-- 1. linkly_links: INSERT exige adm_master.
-- ----------------------------------------------------------------------------

set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000003'; -- gerente 1710
set role authenticated;

\set ON_ERROR_STOP 0
insert into public.linkly_links (id, workspace_secret, linkly_link_id, short_url, tipo, filial)
values ('60000000-0000-0000-0000-000000000001', 'linkly_api_key_1710', 'abc123', 'https://linkly.link/abc123', 'vendedor', '1710');
\set ON_ERROR_STOP 1

select public._test_assert('gerente: NAO consegue cadastrar linkly_links', :'ERROR' = 'true');

reset role;
reset request.jwt.claim.sub;

set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000004'; -- adm_master
set role authenticated;

\set ON_ERROR_STOP 0
insert into public.linkly_links (workspace_secret, linkly_link_id, short_url, tipo, filial)
values ('linkly_api_key_1710', 'zzz999', 'https://linkly.link/zzz999', 'vitrine', '1710');
\set ON_ERROR_STOP 1

select public._test_assert('check constraint: vitrine com filial preenchida é bloqueado', :'ERROR' = 'true');

\set ON_ERROR_STOP 0
insert into public.linkly_links (workspace_secret, linkly_link_id, short_url, tipo, filial)
values ('linkly_api_key_1710', 'yyy888', 'https://linkly.link/yyy888', 'vendedor', null);
\set ON_ERROR_STOP 1

select public._test_assert('check constraint: vendedor sem filial é bloqueado', :'ERROR' = 'true');

insert into public.linkly_links (id, workspace_secret, linkly_link_id, short_url, tipo, filial) values
  ('60000000-0000-0000-0000-000000000001', 'linkly_api_key_1710', 'abc123', 'https://linkly.link/abc123', 'vendedor', '1710'),
  ('60000000-0000-0000-0000-000000000002', 'linkly_api_key_vitrine', 'vtr999', 'https://linkly.link/vtr999', 'vitrine', null);

reset role;
reset request.jwt.claim.sub;

-- ----------------------------------------------------------------------------
-- 2. linkly_vendedor_mapeamento: SELECT exige adm_master; INSERT direto é
-- sempre bloqueado (sem policy), mesmo pra adm_master.
-- ----------------------------------------------------------------------------

set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000003'; -- gerente 1710
set role authenticated;

select public._test_assert(
  'gerente: NAO enxerga linkly_vendedor_mapeamento (0 linhas)',
  (select count(*) = 0 from public.linkly_vendedor_mapeamento) = true
);

reset role;
reset request.jwt.claim.sub;

set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000004'; -- adm_master
set role authenticated;

\set ON_ERROR_STOP 0
insert into public.linkly_vendedor_mapeamento (link_id, usuario_id, vigente_desde)
values ('60000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', current_date);
\set ON_ERROR_STOP 1

select public._test_assert(
  'adm_master: INSERT direto em linkly_vendedor_mapeamento é bloqueado (sem policy) — só via atribuir_vendedor_link()',
  :'ERROR' = 'true'
);

-- ----------------------------------------------------------------------------
-- 3. atribuir_vendedor_link(): exige adm_master; primeira atribuição.
-- ----------------------------------------------------------------------------

reset role;
reset request.jwt.claim.sub;

set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000003'; -- gerente 1710
set role authenticated;

\set ON_ERROR_STOP 0
select public.atribuir_vendedor_link('60000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', '2026-01-01');
\set ON_ERROR_STOP 1

select public._test_assert('gerente: NAO consegue chamar atribuir_vendedor_link', :'ERROR' = 'true');

reset role;
reset request.jwt.claim.sub;

set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000004'; -- adm_master
set role authenticated;

select public.atribuir_vendedor_link('60000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', '2026-01-01') as mapeamento_1 \gset

select public._test_assert(
  'primeira atribuição: cliques_totais_no_inicio = 0 (sem sync ainda)',
  (select cliques_totais_no_inicio = 0 from public.linkly_vendedor_mapeamento where id = :'mapeamento_1')
);

select public._test_assert(
  'criado_por nunca vem do client — sempre auth.uid() de quem chamou',
  (select criado_por = '00000000-0000-0000-0000-000000000004' from public.linkly_vendedor_mapeamento where id = :'mapeamento_1')
);

\set ON_ERROR_STOP 0
select public.atribuir_vendedor_link('60000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', '2026-02-01');
\set ON_ERROR_STOP 1

select public._test_assert(
  'reatribuir pro MESMO vendedor já vigente é bloqueado',
  :'ERROR' = 'true'
);

\set ON_ERROR_STOP 0
select public.atribuir_vendedor_link('60000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000002', '2026-01-01');
\set ON_ERROR_STOP 1

select public._test_assert(
  'reatribuir com data <= início do vínculo vigente é bloqueado',
  :'ERROR' = 'true'
);

reset role;
reset request.jwt.claim.sub;

-- Simula uma sincronização: total de cliques sobe pra 100 (link ainda só com
-- Vendedor A vigente).
set role service_role;
insert into public.linkly_cliques_totais (link_id, total_cliques) values ('60000000-0000-0000-0000-000000000001', 100)
  on conflict (link_id) do update set total_cliques = excluded.total_cliques, atualizado_em = now();
reset role;

set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000004'; -- adm_master
set role authenticated;

-- Reatribui pro Vendedor B a partir de 2026-02-01 — fecha a linha do
-- Vendedor A (vigente_ate = 2026-01-31) e snapshot do Vendedor B = 100.
select public.atribuir_vendedor_link('60000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000002', '2026-02-01') as mapeamento_2 \gset

select public._test_assert(
  'reatribuição: linha antiga (Vendedor A) fechada em vigente_ate = 2026-01-31',
  (select vigente_ate = '2026-01-31' from public.linkly_vendedor_mapeamento where id = :'mapeamento_1')
);

select public._test_assert(
  'reatribuição: snapshot do Vendedor B = total no momento da troca (100)',
  (select cliques_totais_no_inicio = 100 from public.linkly_vendedor_mapeamento where id = :'mapeamento_2')
);

reset role;
reset request.jwt.claim.sub;

-- Nova sincronização: total sobe pra 150 (Vendedor B ainda vigente).
set role service_role;
update public.linkly_cliques_totais set total_cliques = 150, atualizado_em = now()
  where link_id = '60000000-0000-0000-0000-000000000001';
reset role;

-- ----------------------------------------------------------------------------
-- 4. linkly_cliques_por_periodo: delta correto + visibilidade por perfil.
-- ----------------------------------------------------------------------------

set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000004'; -- adm_master
set role authenticated;

select public._test_assert(
  'período fechado do Vendedor A: 100 (snapshot novo) - 0 (snapshot antigo) = 100 cliques',
  (select cliques_periodo = 100 from public.linkly_cliques_por_periodo where mapeamento_id = :'mapeamento_1'::uuid)
);

select public._test_assert(
  'período vigente do Vendedor B: 150 (total atual) - 100 (snapshot) = 50 cliques',
  (select cliques_periodo = 50 from public.linkly_cliques_por_periodo where mapeamento_id = :'mapeamento_2'::uuid)
);

select public._test_assert(
  'adm_master: enxerga os 2 períodos (histórico + vigente) do mesmo link',
  (select count(*) = 2 from public.linkly_cliques_por_periodo where link_id = '60000000-0000-0000-0000-000000000001')
);

reset role;
reset request.jwt.claim.sub;

set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000001'; -- Vendedor A (dono do período histórico/fechado)
set role authenticated;

select public._test_assert(
  'Vendedor A: enxerga a própria linha histórica (fechada)',
  (select count(*) = 1 from public.linkly_cliques_por_periodo where mapeamento_id = :'mapeamento_1'::uuid)
);

select public._test_assert(
  'Vendedor A: NAO enxerga a linha vigente do Vendedor B',
  (select count(*) = 0 from public.linkly_cliques_por_periodo where mapeamento_id = :'mapeamento_2'::uuid)
);

reset role;
reset request.jwt.claim.sub;

set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000002'; -- Vendedor B (vigente)
set role authenticated;

select public._test_assert(
  'Vendedor B: enxerga a própria linha vigente',
  (select count(*) = 1 from public.linkly_cliques_por_periodo where mapeamento_id = :'mapeamento_2'::uuid)
);

reset role;
reset request.jwt.claim.sub;

set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000003'; -- gerente 1710
set role authenticated;

select public._test_assert(
  'gerente 1710: enxerga os 2 períodos do link (mesma filial)',
  (select count(*) = 2 from public.linkly_cliques_por_periodo where link_id = '60000000-0000-0000-0000-000000000001')
);

reset role;
reset request.jwt.claim.sub;

set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000005'; -- gerente 1714 (outra filial)
set role authenticated;

select public._test_assert(
  'gerente 1714: NAO enxerga nenhum período do link da 1710',
  (select count(*) = 0 from public.linkly_cliques_por_periodo where link_id = '60000000-0000-0000-0000-000000000001')
);

reset role;
reset request.jwt.claim.sub;

-- ----------------------------------------------------------------------------
-- 5. linkly_cliques_vitrine: só adm/adm_master.
-- ----------------------------------------------------------------------------

set role service_role;
insert into public.linkly_cliques_totais (link_id, total_cliques) values ('60000000-0000-0000-0000-000000000002', 42);
reset role;

set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000003'; -- gerente 1710
set role authenticated;

select public._test_assert(
  'gerente: NAO enxerga linkly_cliques_vitrine',
  (select count(*) = 0 from public.linkly_cliques_vitrine) = true
);

reset role;
reset request.jwt.claim.sub;

set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000004'; -- adm_master
set role authenticated;

select public._test_assert(
  'adm_master: enxerga linkly_cliques_vitrine (total 42)',
  (select total_cliques = 42 from public.linkly_cliques_vitrine where link_id = '60000000-0000-0000-0000-000000000002')
);

reset role;
reset request.jwt.claim.sub;

-- ----------------------------------------------------------------------------
-- 6. Overlap: trigger de defesa em profundidade (INSERT direto via
-- postgres/service_role, bypassando RLS — RLS não bloquearia, mas o trigger
-- de overlap dispara igual, já que triggers não são gateados por RLS).
-- ----------------------------------------------------------------------------

set role postgres;

\set ON_ERROR_STOP 0
insert into public.linkly_vendedor_mapeamento (link_id, usuario_id, vigente_desde, criado_por)
values ('60000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', '2026-01-15', '00000000-0000-0000-0000-000000000004');
\set ON_ERROR_STOP 1

select public._test_assert(
  'overlap: INSERT direto com período sobreposto (dentro do período já fechado do Vendedor A) é bloqueado pelo trigger',
  :'ERROR' = 'true'
);

select 'todos os asserts de linkly passaram' as status;

drop function public._test_assert(text, boolean);
reset role;
