-- ============================================================================
-- Teste de regressão para a extensão de materiais_apoio (migration
-- 20260930000001_materiais_apoio_extensao.sql).
--
-- Cobre:
--   1. Categorias: qualquer perfil ativo vê; só adm_master cria, renomeia e
--      exclui (adm comum NÃO); nome deduplicado sem diferenciar maiúsculas.
--   2. Categoria em uso não pode ser excluída (FK on delete restrict).
--   3. materiais_apoio_tipo_coerente: link exige url e nenhum arquivo;
--      demais tipos exigem arquivo e nenhuma url. url só http(s).
--   4. adm (não só adm_master) edita e exclui material; atualizado_por/_em
--      preenchidos pelo trigger, enviado_por/_em imutáveis.
--   5. Storage: admin exclui objeto do bucket materiais-apoio, vendedor não;
--      bucket aceita os novos mime types.
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

-- adm comum (não master) — já criado em 09_assertions_caso_teste.sql; o
-- on conflict mantém este arquivo independente da ordem.
insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-000000000006', 'adm@teste.com', '{"nome_completo":"Adm","perfil":"adm"}')
on conflict (id) do nothing;

select public._test_assert(
  'bucket materiais-apoio aceita imagem, docx e xlsx além de PDF',
  (
    select allowed_mime_types @> array[
      'application/pdf', 'image/jpeg', 'image/png',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    ]
    from storage.buckets where id = 'materiais-apoio'
  )
);

-- ----------------------------------------------------------------------------
-- 1. Categorias
-- ----------------------------------------------------------------------------

set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000004';
set role authenticated;

insert into public.materiais_apoio_categorias (id, nome) values
  ('31000000-0000-0000-0000-000000000001', 'Manuais'),
  ('31000000-0000-0000-0000-000000000002', 'Políticas');

select public._test_assert(
  'adm_master: cria categorias',
  (select count(*) = 2 from public.materiais_apoio_categorias)
);

\set ON_ERROR_STOP 0
insert into public.materiais_apoio_categorias (nome) values ('MANUAIS');
\set ON_ERROR_STOP 1

select public._test_assert(
  'categoria: nome duplicado sem diferenciar maiúsculas é recusado',
  :'ERROR' = 'true'
);

update public.materiais_apoio_categorias set nome = 'Manuais internos' where id = '31000000-0000-0000-0000-000000000001';

select public._test_assert(
  'adm_master: renomeia categoria',
  (select nome = 'Manuais internos' from public.materiais_apoio_categorias where id = '31000000-0000-0000-0000-000000000001')
);

\set ON_ERROR_STOP 0
update public.materiais_apoio_categorias set nome = 'políticas' where id = '31000000-0000-0000-0000-000000000001';
\set ON_ERROR_STOP 1

select public._test_assert(
  'categoria: renomear para nome já existente (outra caixa) é recusado',
  :'ERROR' = 'true'
);

reset role;
reset request.jwt.claim.sub;

-- adm comum: vê, mas não cria/renomeia/exclui.
set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000006';
set role authenticated;

select public._test_assert(
  'adm: VÊ as categorias',
  (select count(*) = 2 from public.materiais_apoio_categorias)
);

\set ON_ERROR_STOP 0
insert into public.materiais_apoio_categorias (nome) values ('Tentativa adm');
\set ON_ERROR_STOP 1

select public._test_assert(
  'adm: NAO cria categoria (exclusivo adm_master)',
  :'ERROR' = 'true'
);

update public.materiais_apoio_categorias set nome = 'editado pelo adm' where id = '31000000-0000-0000-0000-000000000002';
delete from public.materiais_apoio_categorias where id = '31000000-0000-0000-0000-000000000002';

reset role;
reset request.jwt.claim.sub;

select public._test_assert(
  'adm: NAO renomeia nem exclui categoria (exclusivo adm_master)',
  (select nome = 'Políticas' from public.materiais_apoio_categorias where id = '31000000-0000-0000-0000-000000000002')
);

-- vendedor: vê (usa no filtro).
set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000001';
set role authenticated;

select public._test_assert(
  'vendedor: VÊ as categorias (filtro da lista)',
  (select count(*) = 2 from public.materiais_apoio_categorias)
);

reset role;
reset request.jwt.claim.sub;

-- ----------------------------------------------------------------------------
-- 3. Coerência tipo × url × arquivo (adm comum insere — insert é auth_is_admin())
-- ----------------------------------------------------------------------------

set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000006';
set role authenticated;

insert into public.materiais_apoio (id, titulo, tipo, url, categoria_id) values (
  '32000000-0000-0000-0000-000000000001', 'Portal do fornecedor', 'link', 'https://exemplo.com/portal',
  '31000000-0000-0000-0000-000000000001'
);

insert into public.materiais_apoio (id, titulo, tipo, storage_path, nome_arquivo, categoria_id) values (
  '32000000-0000-0000-0000-000000000002', 'Tabela de comissões', 'xlsx', 'tabela.xlsx', 'tabela.xlsx',
  '31000000-0000-0000-0000-000000000002'
);

select public._test_assert(
  'adm: insere link e arquivo xlsx com categoria',
  (select count(*) = 2 from public.materiais_apoio where id in (
    '32000000-0000-0000-0000-000000000001', '32000000-0000-0000-0000-000000000002'
  ))
);

\set ON_ERROR_STOP 0
insert into public.materiais_apoio (titulo, tipo) values ('link sem url', 'link');
\set ON_ERROR_STOP 1
select public._test_assert('tipo_coerente: link sem url é recusado', :'ERROR' = 'true');

\set ON_ERROR_STOP 0
insert into public.materiais_apoio (titulo, tipo, url, storage_path, nome_arquivo)
values ('link com arquivo', 'link', 'https://exemplo.com', 'x.pdf', 'x.pdf');
\set ON_ERROR_STOP 1
select public._test_assert('tipo_coerente: link com arquivo é recusado', :'ERROR' = 'true');

\set ON_ERROR_STOP 0
insert into public.materiais_apoio (titulo, tipo) values ('pdf sem arquivo', 'pdf');
\set ON_ERROR_STOP 1
select public._test_assert('tipo_coerente: pdf sem arquivo é recusado', :'ERROR' = 'true');

\set ON_ERROR_STOP 0
insert into public.materiais_apoio (titulo, tipo, url, storage_path, nome_arquivo)
values ('imagem com url', 'imagem', 'https://exemplo.com', 'x.png', 'x.png');
\set ON_ERROR_STOP 1
select public._test_assert('tipo_coerente: imagem com url é recusado', :'ERROR' = 'true');

\set ON_ERROR_STOP 0
insert into public.materiais_apoio (titulo, tipo, url) values ('link javascript', 'link', 'javascript:alert(1)');
\set ON_ERROR_STOP 1
select public._test_assert('url: só http(s) — javascript: é recusado', :'ERROR' = 'true');

-- ----------------------------------------------------------------------------
-- 4. Edição/exclusão por adm comum + trigger de auditoria
-- ----------------------------------------------------------------------------

update public.materiais_apoio
set titulo = 'Portal do fornecedor (novo)', url = 'https://exemplo.com/novo',
    enviado_por = '00000000-0000-0000-0000-000000000001', atualizado_por = '00000000-0000-0000-0000-000000000001'
where id = '32000000-0000-0000-0000-000000000001';

reset role;
reset request.jwt.claim.sub;

select public._test_assert(
  'adm: edita título e url de um link',
  (select titulo = 'Portal do fornecedor (novo)' and url = 'https://exemplo.com/novo'
   from public.materiais_apoio where id = '32000000-0000-0000-0000-000000000001')
);

select public._test_assert(
  'edição: atualizado_por/_em vêm do trigger, enviado_por não muda mesmo se o client tentar',
  (select atualizado_por = '00000000-0000-0000-0000-000000000006'
      and atualizado_em is not null
      and enviado_por = '00000000-0000-0000-0000-000000000006'
   from public.materiais_apoio where id = '32000000-0000-0000-0000-000000000001')
);

-- 2. Categoria em uso não pode ser excluída.
set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000004';
set role authenticated;

\set ON_ERROR_STOP 0
delete from public.materiais_apoio_categorias where id = '31000000-0000-0000-0000-000000000001';
\set ON_ERROR_STOP 1
select public._test_assert('categoria em uso por material NAO pode ser excluída (on delete restrict)', :'ERROR' = 'true');

reset role;
reset request.jwt.claim.sub;

set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000006';
set role authenticated;

delete from public.materiais_apoio where id = '32000000-0000-0000-0000-000000000001';

reset role;
reset request.jwt.claim.sub;

select public._test_assert(
  'adm: exclui material',
  (select count(*) = 0 from public.materiais_apoio where id = '32000000-0000-0000-0000-000000000001')
);

set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000004';
set role authenticated;

delete from public.materiais_apoio_categorias where id = '31000000-0000-0000-0000-000000000001';

reset role;
reset request.jwt.claim.sub;

select public._test_assert(
  'adm_master: exclui categoria que ficou sem uso',
  (select count(*) = 0 from public.materiais_apoio_categorias where id = '31000000-0000-0000-0000-000000000001')
);

-- ----------------------------------------------------------------------------
-- 5. Storage DELETE
-- ----------------------------------------------------------------------------

set role postgres;
insert into storage.objects (bucket_id, name) values
  ('materiais-apoio', 'apagar-pelo-vendedor.pdf'),
  ('materiais-apoio', 'apagar-pelo-adm.pdf');
reset role;

set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000001';
set role authenticated;
delete from storage.objects where bucket_id = 'materiais-apoio' and name = 'apagar-pelo-vendedor.pdf';
reset role;
reset request.jwt.claim.sub;

select public._test_assert(
  'vendedor: NAO exclui arquivo do bucket materiais-apoio',
  (select count(*) = 1 from storage.objects where bucket_id = 'materiais-apoio' and name = 'apagar-pelo-vendedor.pdf')
);

set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000006';
set role authenticated;
delete from storage.objects where bucket_id = 'materiais-apoio' and name = 'apagar-pelo-adm.pdf';
reset role;
reset request.jwt.claim.sub;

select public._test_assert(
  'adm: exclui arquivo do bucket materiais-apoio (substituir/excluir material)',
  (select count(*) = 0 from storage.objects where bucket_id = 'materiais-apoio' and name = 'apagar-pelo-adm.pdf')
);

select 'todos os asserts da extensão de materiais_apoio passaram' as status;

set role postgres;
drop function public._test_assert(text, boolean);
reset role;
