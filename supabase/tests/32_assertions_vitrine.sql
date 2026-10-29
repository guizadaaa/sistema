-- ============================================================================
-- Vitrine por filial (migration 20261029000001_vitrine.sql).
--
-- Cobre:
--   1. Categorias: gerente cria só na própria filial; adm em qualquer uma.
--   2. Envio (vitrine_salvar_envio): 1 oferta por página com a capa fora;
--      "publicar também em" só adm, com cópias independentes (categoria
--      criada pelo nome na filial de destino, mesmo PDF no storage).
--   3. RLS: vendedor 1714 não vê a vitrine da 1710; vencida/inativa/de
--      categoria inativa somem para o vendedor e aparecem para o gerente;
--      gerente 1710 edita só a 1710; adm edita todas; vendedor não edita.
--   4. Storage: envio só na pasta de filial que o usuário edita; leitura
--      segue as vitrines visíveis (inclusive cópias).
--   5. Exclusão: imagem/PDF só saem do storage quando nada mais usa.
--   6. Reordenar; link só https; idempotência.
-- ============================================================================

set role postgres;

create or replace function public._test_assert(p_rotulo text, p_condicao boolean)
returns void
language plpgsql
as $$
begin
  if not coalesce(p_condicao, false) then
    raise exception 'FALHOU: %', p_rotulo;
  end if;
  raise notice 'ok: %', p_rotulo;
end;
$$;

insert into auth.users (id, email, raw_user_meta_data) values
  ('32000000-0000-0000-0000-000000000001', 'vend1714.vitrine@teste.com', '{"nome_completo":"Vendedor 1714 Vitrine","perfil":"vendedor","filial":"1714"}'),
  ('00000000-0000-0000-0000-000000000006', 'adm@teste.com', '{"nome_completo":"Adm","perfil":"adm"}')
on conflict (id) do nothing;

-- Seed: gerente 1710 (…03), gerente 1714 (…05), vendedor A 1710 (…01) e
-- adm_master (…04) — os testes anteriores não mudam a loja deles.
select public._test_assert('cenário: lojas do seed',
  (select filial = '1710' from public.usuarios where id = '00000000-0000-0000-0000-000000000003')
  and (select filial = '1714' from public.usuarios where id = '00000000-0000-0000-0000-000000000005')
  and (select filial = '1710' and ativo from public.usuarios where id = '00000000-0000-0000-0000-000000000001'));

-- ----------------------------------------------------------------------------
-- 1. Categorias
-- ----------------------------------------------------------------------------

set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000003';
set role authenticated;
insert into public.vitrine_categorias (id, filial, nome) values
  ('32000000-0000-0000-0000-0000000000c1', '1710', 'Cruzeiros'),
  ('32000000-0000-0000-0000-0000000000c2', '1710', 'Nacional');
reset role;

do $$
begin
  perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000003', true);
  set local role authenticated;
  insert into public.vitrine_categorias (filial, nome) values ('1714', 'Cruzeiros');
  raise exception 'FALHOU: gerente 1710 criou categoria na 1714';
exception when insufficient_privilege then
  raise notice 'ok: gerente 1710 não cria categoria na 1714';
end;
$$;

select public._test_assert('categorias da 1710 com ordem automática',
  (select array_agg(ordem order by nome) = '{1,2}' from public.vitrine_categorias where filial = '1710'));

-- ----------------------------------------------------------------------------
-- 2. Envio
-- ----------------------------------------------------------------------------

-- Gerente 1710: PDF de 5 páginas, capa = 1, ofertas = 2..5.
set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000003';
set role authenticated;
select public.vitrine_salvar_envio(
  '32000000-0000-0000-0000-0000000000a1', '1710', '32000000-0000-0000-0000-0000000000c1', 'MSC Cruzeiros', 5, 1,
  $j$[
    {"pagina": 2, "titulo": "MSC VIRTUOSA BÚZIOS, SALVADOR E MACEIÓ", "link": "https://cruzeiros.atlas.cvc.com.br/quote/1"},
    {"pagina": 3, "titulo": "MSC SEAVIEW ILHABELA", "link": "https://www.cvc.com.br/carrinho-dinamico/2", "validade": "2026-01-01"},
    {"pagina": 4, "titulo": "MSC PREZIOSA ARGENTINA"},
    {"pagina": 5, "titulo": "MSC ARMONIA BÚZIOS"}
  ]$j$::jsonb
) is not null as salvou;
reset role;

select public._test_assert('envio: 4 ofertas (capa fora), PNG por página',
  (select count(*) = 4 from public.vitrine_ofertas where arquivo_id = '32000000-0000-0000-0000-0000000000a1')
  and (select array_agg(imagem_path order by pagina) = array[
         '1710/32000000-0000-0000-0000-0000000000a1/p2.png', '1710/32000000-0000-0000-0000-0000000000a1/p3.png',
         '1710/32000000-0000-0000-0000-0000000000a1/p4.png', '1710/32000000-0000-0000-0000-0000000000a1/p5.png']
       from public.vitrine_ofertas where arquivo_id = '32000000-0000-0000-0000-0000000000a1')
  and (select pdf_path = '1710/32000000-0000-0000-0000-0000000000a1.pdf' and capa_pagina = 1
         and enviado_por = '00000000-0000-0000-0000-000000000003'
       from public.vitrine_arquivos where id = '32000000-0000-0000-0000-0000000000a1'));

do $$
begin
  perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000003', true);
  set local role authenticated;
  perform public.vitrine_salvar_envio(gen_random_uuid(), '1710', '32000000-0000-0000-0000-0000000000c1', 'x', 1, null,
    '[{"pagina": 1, "titulo": "x"}]'::jsonb, '{1714}');
  raise exception 'FALHOU: gerente publicou em outra filial';
exception when insufficient_privilege then
  raise notice 'ok: só adm publica em outras filiais';
end;
$$;

-- adm: PDF inteiro como uma oferta só (1710), publicado também na 1714 e 1730.
set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000006';
set role authenticated;
select public.vitrine_salvar_envio(
  '32000000-0000-0000-0000-0000000000a2', '1710', '32000000-0000-0000-0000-0000000000c2', 'Nordeste', 3, null,
  '[{"pagina": null, "titulo": "Nordeste completo", "link": "https://www.cvc.com.br/nordeste"}]'::jsonb, '{1714,1730,1710}'
) is not null as salvou_adm;
reset role;

select public._test_assert('publicar também em: cópia por filial, mesmo PDF, categoria criada pelo nome',
  (select count(*) = 3 from public.vitrine_arquivos where pdf_path = '1710/32000000-0000-0000-0000-0000000000a2.pdf')
  and (select array_agg(filial order by filial) = '{1710,1714,1730}' from public.vitrine_ofertas
       where imagem_path = '1710/32000000-0000-0000-0000-0000000000a2/p1.png' and pagina is null)
  and exists (select 1 from public.vitrine_categorias where filial = '1714' and nome = 'Nacional'));

-- Cópias independentes: link diferente na 1714.
set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000005';
set role authenticated;
update public.vitrine_ofertas set link = 'https://www.cvc.com.br/batel' where filial = '1714';
reset role;
select public._test_assert('cópia da 1714 editada sem mexer na 1710',
  (select link = 'https://www.cvc.com.br/batel' from public.vitrine_ofertas where filial = '1714')
  and (select link = 'https://www.cvc.com.br/nordeste' from public.vitrine_ofertas
       where filial = '1710' and arquivo_id = '32000000-0000-0000-0000-0000000000a2'));

-- ----------------------------------------------------------------------------
-- 3. RLS
-- ----------------------------------------------------------------------------

-- Oferta inativa (p4) e categoria inativa na 1710 para os testes do vendedor.
update public.vitrine_ofertas set ativo = false where imagem_path like '%a1/p4.png';

set request.jwt.claim.sub = '32000000-0000-0000-0000-000000000001';
set role authenticated;
select public._test_assert('vendedor 1714 não vê vitrine da 1710',
  not exists (select 1 from public.vitrine_ofertas where filial = '1710')
  and not exists (select 1 from public.vitrine_arquivos where filial = '1710')
  and not exists (select 1 from public.vitrine_categorias where filial = '1710'));
select public._test_assert('vendedor 1714 vê a cópia da 1714', (select count(*) = 1 from public.vitrine_ofertas));
update public.vitrine_ofertas set titulo = 'hack';
insert into public.vitrine_categorias (filial, nome) select '1714', 'hack' where false;
reset role;
select public._test_assert('vendedor não edita', not exists (select 1 from public.vitrine_ofertas where titulo = 'hack'));

do $$
begin
  perform set_config('request.jwt.claim.sub', '32000000-0000-0000-0000-000000000001', true);
  set local role authenticated;
  insert into public.vitrine_categorias (filial, nome) values ('1714', 'Vendedor');
  raise exception 'FALHOU: vendedor criou categoria';
exception when insufficient_privilege then
  raise notice 'ok: vendedor não cria categoria';
end;
$$;

set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000001';
set role authenticated;
select public._test_assert('vendedor 1710: não vê vencida (p3) nem inativa (p4)',
  (select array_agg(pagina order by pagina) = '{2,5}' from public.vitrine_ofertas where arquivo_id = '32000000-0000-0000-0000-0000000000a1'));
reset role;

set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000003';
set role authenticated;
select public._test_assert('gerente 1710 vê vencida e inativa',
  (select count(*) = 4 from public.vitrine_ofertas where arquivo_id = '32000000-0000-0000-0000-0000000000a1'));
update public.vitrine_categorias set ativo = false where id = '32000000-0000-0000-0000-0000000000c2';
update public.vitrine_ofertas set titulo = 'Gerente 1710 editou' where filial = '1714';
update public.vitrine_ofertas set titulo = 'MSC ARMONIA BÚZIOS (editado)' where imagem_path like '%a1/p5.png';
reset role;
select public._test_assert('gerente 1710 edita só a 1710',
  not exists (select 1 from public.vitrine_ofertas where titulo = 'Gerente 1710 editou')
  and exists (select 1 from public.vitrine_ofertas where titulo = 'MSC ARMONIA BÚZIOS (editado)'));

set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000001';
set role authenticated;
select public._test_assert('categoria inativa: vendedor não vê a categoria nem as ofertas dela',
  not exists (select 1 from public.vitrine_categorias where id = '32000000-0000-0000-0000-0000000000c2')
  and not exists (select 1 from public.vitrine_ofertas where categoria_id = '32000000-0000-0000-0000-0000000000c2'));
reset role;

set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000006';
set role authenticated;
update public.vitrine_ofertas set titulo = 'Adm editou 1730' where filial = '1730';
select public._test_assert('adm vê todas as filiais', (select count(distinct filial) = 3 from public.vitrine_ofertas));
reset role;
select public._test_assert('adm edita qualquer filial', exists (select 1 from public.vitrine_ofertas where titulo = 'Adm editou 1730'));

do $$
begin
  perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000006', true);
  set local role authenticated;
  update public.vitrine_ofertas set link = 'http://www.cvc.com.br/x' where filial = '1730';
  raise exception 'FALHOU: link http aceito';
exception when check_violation then
  raise notice 'ok: link só https';
end;
$$;

do $$
begin
  perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000006', true);
  set local role authenticated;
  delete from public.vitrine_ofertas where filial = '1730';
  raise exception 'FALHOU: delete direto aceito';
exception when insufficient_privilege then
  raise notice 'ok: exclusão só pela função';
end;
$$;

-- ----------------------------------------------------------------------------
-- 4. Storage
-- ----------------------------------------------------------------------------

insert into storage.objects (bucket_id, name) values
  ('vitrine', '1710/32000000-0000-0000-0000-0000000000a1.pdf'),
  ('vitrine', '1710/32000000-0000-0000-0000-0000000000a1/p2.png'),
  ('vitrine', '1710/32000000-0000-0000-0000-0000000000a2.pdf'),
  ('vitrine', '1710/32000000-0000-0000-0000-0000000000a2/p1.png');

set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000003';
set role authenticated;
insert into storage.objects (bucket_id, name) values ('vitrine', '1710/novo.pdf');
reset role;
do $$
begin
  perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000003', true);
  set local role authenticated;
  insert into storage.objects (bucket_id, name) values ('vitrine', '1714/novo.pdf');
  raise exception 'FALHOU: gerente 1710 enviou na pasta da 1714';
exception when insufficient_privilege then
  raise notice 'ok: storage: gerente 1710 não envia na pasta da 1714';
end;
$$;
do $$
begin
  perform set_config('request.jwt.claim.sub', '32000000-0000-0000-0000-000000000001', true);
  set local role authenticated;
  insert into storage.objects (bucket_id, name) values ('vitrine', '1714/vendedor.pdf');
  raise exception 'FALHOU: vendedor enviou arquivo';
exception when insufficient_privilege then
  raise notice 'ok: storage: vendedor não envia';
end;
$$;

set request.jwt.claim.sub = '32000000-0000-0000-0000-000000000001';
set role authenticated;
select public._test_assert('storage: vendedor 1714 lê o PDF/PNG da cópia (pasta da 1710), não os só da 1710',
  (select array_agg(name order by name) = array['1710/32000000-0000-0000-0000-0000000000a2.pdf', '1710/32000000-0000-0000-0000-0000000000a2/p1.png']
   from storage.objects where bucket_id = 'vitrine'));
reset role;

-- ----------------------------------------------------------------------------
-- 5. Exclusão
-- ----------------------------------------------------------------------------

set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000005';
set role authenticated;
select public.vitrine_excluir_oferta((select id from public.vitrine_ofertas where filial = '1714')) as r1714 \gset
reset role;
select public._test_assert('excluir a cópia da 1714: imagem e PDF continuam (1710/1730 usam)',
  :'r1714'::jsonb = '{"remover": [], "prefixo": null}'::jsonb
  and not exists (select 1 from public.vitrine_arquivos where filial = '1714'));

do $$
begin
  perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000003', true);
  set local role authenticated;
  perform public.vitrine_excluir_oferta((select id from public.vitrine_ofertas where filial = '1730'));
  raise exception 'FALHOU: gerente 1710 excluiu oferta da 1730';
exception when insufficient_privilege then
  raise notice 'ok: gerente 1710 não exclui oferta da 1730';
end;
$$;

set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000003';
set role authenticated;
select public.vitrine_excluir_oferta((select id from public.vitrine_ofertas where imagem_path like '%a1/p2.png')) as rp2 \gset
reset role;
select public._test_assert('excluir oferta da página 2: sai o PNG dela, o PDF fica',
  :'rp2'::jsonb = '{"remover": ["1710/32000000-0000-0000-0000-0000000000a1/p2.png"], "prefixo": null}'::jsonb);

set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000003';
set role authenticated;
select public.vitrine_excluir_oferta(id) from public.vitrine_ofertas where arquivo_id = '32000000-0000-0000-0000-0000000000a1' and pagina in (3, 4);
select public.vitrine_excluir_oferta((select id from public.vitrine_ofertas where arquivo_id = '32000000-0000-0000-0000-0000000000a1')) as rult \gset
reset role;
select public._test_assert('última oferta: sai o PDF e a pasta (capa incluída)',
  :'rult'::jsonb -> 'prefixo' = '"1710/32000000-0000-0000-0000-0000000000a1"'::jsonb
  and :'rult'::jsonb -> 'remover' ? '1710/32000000-0000-0000-0000-0000000000a1.pdf'
  and not exists (select 1 from public.vitrine_arquivos where id = '32000000-0000-0000-0000-0000000000a1'));

-- ----------------------------------------------------------------------------
-- 6. Reordenar e idempotência
-- ----------------------------------------------------------------------------

set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000003';
set role authenticated;
select public.vitrine_mover('categoria', '32000000-0000-0000-0000-0000000000c2', -1);
reset role;
select public._test_assert('reordenar categoria: Nacional sobe',
  (select array_agg(nome order by ordem) = '{Nacional,Cruzeiros}' from public.vitrine_categorias where filial = '1710'));

\ir ../migrations/20261029000001_vitrine.sql
select public._test_assert('reaplicar a migration não perde dados',
  (select count(*) = 2 from public.vitrine_ofertas) and (select count(*) >= 3 from public.vitrine_categorias));

drop function public._test_assert(text, boolean);

select 'todos os asserts da vitrine passaram' as status;
