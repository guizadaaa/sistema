-- ============================================================================
-- Migration 20261105000001: anexos em WebP + dimensões das ofertas da Vitrine.
-- ============================================================================

set role postgres;

-- Testes anteriores reaplicam versões antigas de vitrine_salvar_envio: reaplica esta.
\ir ../migrations/20261105000001_anexos_webp_vitrine_dimensoes.sql

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

select public._test_assert('bucket anexos aceita webp (e continua com pdf/jpeg/png)',
  (select allowed_mime_types = array['application/pdf', 'image/jpeg', 'image/png', 'image/webp'] from storage.buckets where id = 'anexos'));

set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000003';
set role authenticated;
select public.vitrine_salvar_envio(
  '35000000-0000-0000-0000-0000000000a1', '1710', '32000000-0000-0000-0000-0000000000c1', 'MSC', 3, null, 'Cruzeiros - MSC.pdf',
  $j$[
    {"pagina": 2, "titulo": "A", "imagem": "a.webp", "miniatura": "a-mini.webp", "largura": 800, "altura": 571},
    {"pagina": 3, "titulo": "B", "imagem": "b.webp"}
  ]$j$::jsonb
) is not null as salvou;
reset role;

select public._test_assert('largura/altura da miniatura gravadas; sem elas, null',
  (select imagem_largura = 800 and imagem_altura = 571 from public.vitrine_ofertas
   where arquivo_id = '35000000-0000-0000-0000-0000000000a1' and pagina = 2)
  and (select imagem_largura is null and imagem_altura is null from public.vitrine_ofertas
       where arquivo_id = '35000000-0000-0000-0000-0000000000a1' and pagina = 3));

do $$
begin
  perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000003', true);
  set local role authenticated;
  perform public.vitrine_salvar_envio(gen_random_uuid(), '1710', '32000000-0000-0000-0000-0000000000c1', 'x', 2, null, 'x.pdf',
    '[{"pagina": 2, "titulo": "x", "imagem": "x.webp", "largura": 0, "altura": 10}]'::jsonb);
  raise exception 'FALHOU: largura 0 aceita';
exception when check_violation then
  raise notice 'ok: largura/altura precisam ser positivas';
end;
$$;

\ir ../migrations/20261105000001_anexos_webp_vitrine_dimensoes.sql
select public._test_assert('reaplicar não perde dados',
  (select count(*) = 2 from public.vitrine_ofertas where arquivo_id = '35000000-0000-0000-0000-0000000000a1'));

drop function public._test_assert(text, boolean);

select 'todos os asserts de anexos webp e dimensões da vitrine passaram' as status;
