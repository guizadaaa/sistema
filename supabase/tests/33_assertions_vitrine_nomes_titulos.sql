-- ============================================================================
-- Vitrine: nomes legíveis e correção de títulos
-- (migration 20261030000001_vitrine_nomes_titulos.sql).
--
-- Cobre: títulos gravados "A partir de: ... Valor ..." ficam só com o nome;
-- vitrine_salvar_envio grava os nomes legíveis e recusa nome inválido;
-- leitura do storage pela pasta da vitrine (layout novo e antigo);
-- exclusão devolve a pasta certa nos dois layouts; idempotência.
-- ============================================================================

set role postgres;

-- O teste 32 reaplica a migration anterior (idempotência), que recria a
-- versão antiga das funções/policies: reaplica esta antes de testar.
\ir ../migrations/20261030000001_vitrine_nomes_titulos.sql

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

-- Vitrine "antiga" (layout e títulos de antes), gravada direto como postgres.
insert into public.vitrine_arquivos (id, filial, categoria_id, titulo, pdf_path, paginas, capa_pagina) values
  ('33000000-0000-0000-0000-0000000000a1', '1710', '32000000-0000-0000-0000-0000000000c1', 'Vitrine azul',
   '1710/33000000-0000-0000-0000-0000000000a1.pdf', 5, 1);
insert into public.vitrine_ofertas (filial, categoria_id, arquivo_id, pagina, titulo, imagem_path) values
  ('1710', '32000000-0000-0000-0000-0000000000c1', '33000000-0000-0000-0000-0000000000a1', 2,
   'A partir de: MSC VIRTUOSA BÚZIOS, SALVADOR E MACEIÓ Valor por pessoa em cabine interna 10x de R$ 459,90',
   '1710/33000000-0000-0000-0000-0000000000a1/p2.png'),
  ('1710', '32000000-0000-0000-0000-0000000000c1', '33000000-0000-0000-0000-0000000000a1', 3,
   'A partir de: MSC SEAVIEW ILHABELA E BÚZIOS Valor: R$ 3.899', '1710/33000000-0000-0000-0000-0000000000a1/p3.png'),
  ('1710', '32000000-0000-0000-0000-0000000000c1', '33000000-0000-0000-0000-0000000000a1', 4,
   'a partir de MSC PREZIOSA ARGENTINA E URUGUAI', '1710/33000000-0000-0000-0000-0000000000a1/p4.png'),
  ('1710', '32000000-0000-0000-0000-0000000000c1', '33000000-0000-0000-0000-0000000000a1', 5,
   'MSC ARMONIA — Valor especial', '1710/33000000-0000-0000-0000-0000000000a1/p5.png');

-- A correção roda na migration: reaplica.
\ir ../migrations/20261030000001_vitrine_nomes_titulos.sql

select public._test_assert('títulos "A partir de:" ficam só com o nome do cruzeiro',
  (select array_agg(titulo order by pagina) = array[
     'MSC VIRTUOSA BÚZIOS, SALVADOR E MACEIÓ', 'MSC SEAVIEW ILHABELA E BÚZIOS', 'MSC PREZIOSA ARGENTINA E URUGUAI', 'MSC ARMONIA — Valor especial']
   from public.vitrine_ofertas where arquivo_id = '33000000-0000-0000-0000-0000000000a1'));

select public._test_assert('vitrine_pasta nos dois layouts',
  public.vitrine_pasta('1710/abc.pdf') = '1710/abc'
  and public.vitrine_pasta('1710/abc/Cruzeiros - MSC.pdf') = '1710/abc');

-- Envio novo com nomes legíveis.
set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000003';
set role authenticated;
select public.vitrine_salvar_envio(
  '33000000-0000-0000-0000-0000000000a2', '1710', '32000000-0000-0000-0000-0000000000c1', 'MSC Cruzeiros', 2, 1,
  'Cruzeiros - MSC Cruzeiros.pdf',
  '[{"pagina": 2, "titulo": "MSC VIRTUOSA BÚZIOS", "imagem": "msc-virtuosa-buzios.png"}]'::jsonb
) is not null as salvou;
reset role;
select public._test_assert('envio grava pdf_path/imagem_path legíveis na pasta da vitrine',
  (select pdf_path = '1710/33000000-0000-0000-0000-0000000000a2/Cruzeiros - MSC Cruzeiros.pdf'
   from public.vitrine_arquivos where id = '33000000-0000-0000-0000-0000000000a2')
  and (select imagem_path = '1710/33000000-0000-0000-0000-0000000000a2/msc-virtuosa-buzios.png'
       from public.vitrine_ofertas where arquivo_id = '33000000-0000-0000-0000-0000000000a2'));

do $$
declare
  v_casos text[][] := array[
    ['../x.pdf', 'p2.png'],
    ['ok.pdf', 'a/b.png'],
    ['ok.pdf', ''],
    ['sem extensao', 'p2.png']
  ];
  i int;
begin
  for i in 1 .. array_length(v_casos, 1) loop
    begin
      perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000003', true);
      set local role authenticated;
      perform public.vitrine_salvar_envio(gen_random_uuid(), '1710', '32000000-0000-0000-0000-0000000000c1', 'x', 2, null,
        v_casos[i][1], jsonb_build_array(jsonb_build_object('pagina', 2, 'titulo', 'x', 'imagem', v_casos[i][2])));
      raise exception 'FALHOU: nome inválido aceito (%, %)', v_casos[i][1], v_casos[i][2];
    exception when invalid_parameter_value then
      raise notice 'ok: nome inválido recusado (%)', i;
    end;
    reset role;
  end loop;
end;
$$;

-- Storage: pasta da vitrine nos dois layouts; nada fora dela.
insert into storage.objects (bucket_id, name) values
  ('vitrine', '1710/33000000-0000-0000-0000-0000000000a1.pdf'),
  ('vitrine', '1710/33000000-0000-0000-0000-0000000000a1/p2.png'),
  ('vitrine', '1710/33000000-0000-0000-0000-0000000000a2/Cruzeiros - MSC Cruzeiros.pdf'),
  ('vitrine', '1710/33000000-0000-0000-0000-0000000000a2/msc-virtuosa-buzios.png'),
  ('vitrine', '1710/33000000-0000-0000-0000-0000000000a9/solto.png');

set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000001';
set role authenticated;
select public._test_assert('storage: vendedor 1710 lê os dois layouts e não lê pasta sem vitrine',
  (select count(*) = 4 from storage.objects where bucket_id = 'vitrine' and name like '1710/33000000%')
  and not exists (select 1 from storage.objects where name like '%a9/solto.png'));
reset role;
set request.jwt.claim.sub = '32000000-0000-0000-0000-000000000001';
set role authenticated;
select public._test_assert('storage: vendedor 1714 não lê a vitrine só da 1710',
  not exists (select 1 from storage.objects where name like '1710/33000000%'));
reset role;

-- Exclusão: pasta certa nos dois layouts.
set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000003';
set role authenticated;
select public.vitrine_excluir_oferta((select id from public.vitrine_ofertas where arquivo_id = '33000000-0000-0000-0000-0000000000a2')) as rnovo \gset
reset role;
select public._test_assert('exclusão (layout novo): PNG + PDF + pasta da vitrine',
  :'rnovo'::jsonb = jsonb_build_object(
    'remover', jsonb_build_array('1710/33000000-0000-0000-0000-0000000000a2/msc-virtuosa-buzios.png',
                                 '1710/33000000-0000-0000-0000-0000000000a2/Cruzeiros - MSC Cruzeiros.pdf'),
    'prefixo', '1710/33000000-0000-0000-0000-0000000000a2'));

drop function public._test_assert(text, boolean);

select 'todos os asserts de nomes e títulos da vitrine passaram' as status;
