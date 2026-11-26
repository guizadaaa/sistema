-- ============================================================================
-- Migration 20261128000002: categorias de anexo FastZap, Orbium, Systur, Atlas.
-- ============================================================================

set role postgres;

\ir ../migrations/20261128000002_anexo_categorias_sistemas.sql

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

select public._test_assert('enum tem fastzap, orbium, systur e atlas (e mantém os antigos)',
  enum_range(null::tipo_documento_anexo)::text[] @> array['carta_cancelamento', 'atestado_saude', 'certidao_obito', 'outro', 'imagem_descricao', 'fastzap', 'orbium', 'systur', 'atlas']);

-- Dono do caso da semente grava um anexo de cada categoria nova (mesmo insert da criação e do protocolo).
begin;
set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-000000000001';
insert into public.anexos (caso_id, tipo_documento, storage_path, nome_arquivo)
select '10000000-0000-0000-0000-000000000001', t::tipo_documento_anexo, '10000000-0000-0000-0000-000000000001/' || t || '.pdf', t || '.pdf'
from unnest(array['fastzap', 'orbium', 'systur', 'atlas']) t;
select public._test_assert('anexos com as categorias novas gravados pelo dono do caso',
  (select count(*) = 4 from public.anexos where caso_id = '10000000-0000-0000-0000-000000000001' and tipo_documento in ('fastzap', 'orbium', 'systur', 'atlas')));
reset role;
rollback;

\ir ../migrations/20261128000002_anexo_categorias_sistemas.sql
select public._test_assert('reaplicar é idempotente',
  (select count(*) = 4 from unnest(enum_range(null::tipo_documento_anexo)) v where v::text in ('fastzap', 'orbium', 'systur', 'atlas')));

drop function public._test_assert(text, boolean);

select 'todos os asserts das categorias de anexo passaram' as status;
