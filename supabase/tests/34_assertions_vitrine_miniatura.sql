-- ============================================================================
-- Vitrine: miniatura e imagens WebP/JPEG (migration 20261104000001).
-- Cobre: envio grava imagem .webp/.jpg e miniatura "-mini" ao lado; sem
-- miniatura fica null (fallback); nomes inválidos recusados; exclusão
-- devolve a miniatura; bucket aceita webp/jpeg; idempotência.
-- ============================================================================

set role postgres;

-- Os testes 32/33 reaplicam migrations anteriores (idempotência), que
-- redefinem vitrine_salvar_envio/vitrine_excluir_oferta: reaplica esta.
\ir ../migrations/20261104000001_vitrine_miniatura.sql

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

select public._test_assert('bucket aceita webp e jpeg',
  (select allowed_mime_types @> array['image/webp', 'image/jpeg', 'image/png', 'application/pdf'] from storage.buckets where id = 'vitrine'));

set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000003';
set role authenticated;
select public.vitrine_salvar_envio(
  '34000000-0000-0000-0000-0000000000a1', '1710', '32000000-0000-0000-0000-0000000000c1', 'MSC', 3, 1,
  'Cruzeiros - MSC.pdf',
  $j$[
    {"pagina": 2, "titulo": "MSC VIRTUOSA", "imagem": "msc-virtuosa.webp", "miniatura": "msc-virtuosa-mini.webp"},
    {"pagina": 3, "titulo": "MSC SEAVIEW", "imagem": "msc-seaview.jpg"}
  ]$j$::jsonb
) is not null as salvou;
reset role;

select public._test_assert('envio grava imagem WebP e miniatura ao lado; sem miniatura = null',
  (select imagem_path = '1710/34000000-0000-0000-0000-0000000000a1/msc-virtuosa.webp'
          and miniatura_path = '1710/34000000-0000-0000-0000-0000000000a1/msc-virtuosa-mini.webp'
   from public.vitrine_ofertas where arquivo_id = '34000000-0000-0000-0000-0000000000a1' and pagina = 2)
  and (select imagem_path like '%/msc-seaview.jpg' and miniatura_path is null
       from public.vitrine_ofertas where arquivo_id = '34000000-0000-0000-0000-0000000000a1' and pagina = 3));

do $$
declare
  v_casos text[][] := array[
    ['msc.gif', null],
    ['msc.webp', 'msc.webp'],
    ['msc.webp', '../x-mini.webp'],
    ['msc.webp', 'x-mini.png']
  ];
  i int;
begin
  for i in 1 .. array_length(v_casos, 1) loop
    begin
      perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000003', true);
      set local role authenticated;
      perform public.vitrine_salvar_envio(gen_random_uuid(), '1710', '32000000-0000-0000-0000-0000000000c1', 'x', 2, null, 'x.pdf',
        jsonb_build_array(jsonb_strip_nulls(jsonb_build_object('pagina', 2, 'titulo', 'x', 'imagem', v_casos[i][1], 'miniatura', v_casos[i][2]))));
      raise exception 'FALHOU: nome aceito (%, %)', v_casos[i][1], v_casos[i][2];
    exception when invalid_parameter_value then
      raise notice 'ok: nome de imagem/miniatura inválido recusado (%)', i;
    end;
    reset role;
  end loop;
end;
$$;

set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000003';
set role authenticated;
select public.vitrine_excluir_oferta((select id from public.vitrine_ofertas
  where arquivo_id = '34000000-0000-0000-0000-0000000000a1' and pagina = 2)) as r \gset
reset role;
select public._test_assert('exclusão devolve imagem e miniatura',
  :'r'::jsonb -> 'remover' = jsonb_build_array(
    '1710/34000000-0000-0000-0000-0000000000a1/msc-virtuosa.webp',
    '1710/34000000-0000-0000-0000-0000000000a1/msc-virtuosa-mini.webp')
  and :'r'::jsonb -> 'prefixo' = 'null'::jsonb);

\ir ../migrations/20261104000001_vitrine_miniatura.sql
select public._test_assert('reaplicar não perde dados',
  (select count(*) = 1 from public.vitrine_ofertas where arquivo_id = '34000000-0000-0000-0000-0000000000a1'));

drop function public._test_assert(text, boolean);

select 'todos os asserts da miniatura da vitrine passaram' as status;
