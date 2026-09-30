-- ============================================================================
-- Teste de regressão para materiais_apoio (migration
-- 20260727000004_materiais_apoio.sql) — seção "Documentos/Materiais de
-- apoio": adm/adm_master sobem PDFs, todos os perfis ativos podem ver.
--
-- Cobre:
--   1. adm_master consegue inserir um material.
--   2. enviado_por nunca vem do client — sempre auth.uid() de quem
--      inseriu, mesmo que o client tente mandar outro valor.
--   3. Vendedor (perfil comum) NÃO consegue inserir — só admin.
--   4. Vendedor (qualquer filial) CONSEGUE ver e listar os materiais —
--      sem nenhum recorte de filial/dono, ao contrário de casos.
--   5. Gerente também consegue ver (mesma regra "qualquer perfil ativo").
--   6. Vendedor NÃO consegue editar nem excluir (UPDATE/DELETE de admin,
--      categorias e tipos novos: ver 16_assertions_materiais_apoio_extensao.sql).
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

-- adm_master (00000000-...-004, seed) insere um material, tentando forjar
-- enviado_por com outro id — deve ser ignorado.
set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000004';
set role authenticated;

insert into public.materiais_apoio (id, titulo, tipo, storage_path, nome_arquivo, enviado_por) values (
  '30000000-0000-0000-0000-000000000001', 'Manual de atendimento', 'pdf', 'manual-atendimento.pdf', 'manual-atendimento.pdf',
  '00000000-0000-0000-0000-000000000002'
);

select public._test_assert(
  'adm_master: consegue enviar material de apoio',
  (select count(*) = 1 from public.materiais_apoio where id = '30000000-0000-0000-0000-000000000001')
);

select public._test_assert(
  'enviado_por nunca vem do client — trigger sobrescreve com quem inseriu de verdade',
  (
    select enviado_por = '00000000-0000-0000-0000-000000000004'
    from public.materiais_apoio
    where id = '30000000-0000-0000-0000-000000000001'
  )
);

insert into storage.objects (bucket_id, name, owner)
values ('materiais-apoio', 'manual-atendimento.pdf', '00000000-0000-0000-0000-000000000004');

reset role;
reset request.jwt.claim.sub;

-- ----------------------------------------------------------------------------
-- Vendedor A (00000000-...-001) NÃO consegue inserir — só admin.
-- ----------------------------------------------------------------------------

set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000001';
set role authenticated;

\set ON_ERROR_STOP 0
insert into public.materiais_apoio (titulo, tipo, storage_path, nome_arquivo) values (
  'tentativa vendedor', 'pdf', 'tentativa.pdf', 'tentativa.pdf'
);
\set ON_ERROR_STOP 1

select public._test_assert(
  'vendedor: NAO consegue enviar material de apoio',
  :'ERROR' = 'true'
);

select public._test_assert(
  'vendedor (qualquer filial): consegue VER o material enviado pelo admin',
  (select count(*) = 1 from public.materiais_apoio where id = '30000000-0000-0000-0000-000000000001')
);

select public._test_assert(
  'vendedor: consegue VER o arquivo no storage.objects do bucket materiais-apoio',
  (select count(*) = 1 from storage.objects where bucket_id = 'materiais-apoio' and name = 'manual-atendimento.pdf')
);

\set ON_ERROR_STOP 0
insert into storage.objects (bucket_id, name) values ('materiais-apoio', 'tentativa-vendedor.pdf');
\set ON_ERROR_STOP 1

select public._test_assert(
  'vendedor: NAO consegue subir arquivo no bucket materiais-apoio',
  :'ERROR' = 'true'
);

reset role;
reset request.jwt.claim.sub;

-- ----------------------------------------------------------------------------
-- Gerente da filial 1714 (00000000-...-005) — perfil sem nenhuma relação
-- com quem enviou — também consegue ver (sem recorte de filial).
-- ----------------------------------------------------------------------------

set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000005';
set role authenticated;

select public._test_assert(
  'gerente de outra filial: consegue VER o material (sem recorte de filial)',
  (select count(*) = 1 from public.materiais_apoio where id = '30000000-0000-0000-0000-000000000001')
);

reset role;
reset request.jwt.claim.sub;

-- ----------------------------------------------------------------------------
-- Vendedor NÃO edita nem exclui — UPDATE/DELETE só pra admin. Sem policy
-- que case, o Postgres filtra as linhas em silêncio (0 afetadas) em vez de
-- lançar erro, então a checagem é pelo estado da linha depois.
-- ----------------------------------------------------------------------------

set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000001';
set role authenticated;

update public.materiais_apoio set titulo = 'editado' where id = '30000000-0000-0000-0000-000000000001';
delete from public.materiais_apoio where id = '30000000-0000-0000-0000-000000000001';

reset role;
reset request.jwt.claim.sub;

select public._test_assert(
  'vendedor: NAO consegue editar nem excluir material de apoio',
  (select titulo = 'Manual de atendimento' from public.materiais_apoio where id = '30000000-0000-0000-0000-000000000001')
);

select 'todos os asserts de materiais_apoio passaram' as status;

set role postgres;
drop function public._test_assert(text, boolean);
reset role;
