-- ============================================================================
-- Anexos em WebP + dimensões da imagem das ofertas da Vitrine
--
-- 1. Imagens anexadas a protocolos (coladas ou escolhidas) passam a ser
--    comprimidas no navegador e costumam virar WebP (lib/comprimir-imagem.ts):
--    o bucket "anexos" aceita image/webp. Nada do que já está no bucket muda.
-- 2. vitrine_ofertas.imagem_largura/imagem_altura: tamanho da miniatura do
--    card, gravado no envio, para o <img> reservar o espaço certo (proporção
--    natural da arte, sem faixas pretas). Null nas ofertas antigas.
--
-- Idempotente.
-- ============================================================================

update storage.buckets
set allowed_mime_types = array['application/pdf', 'image/jpeg', 'image/png', 'image/webp']
where id = 'anexos';

alter table public.vitrine_ofertas
  add column if not exists imagem_largura integer check (imagem_largura is null or imagem_largura > 0),
  add column if not exists imagem_altura integer check (imagem_altura is null or imagem_altura > 0);

comment on column public.vitrine_ofertas.imagem_largura is 'Largura (px) da miniatura do card, gravada no envio; null nas antigas.';
comment on column public.vitrine_ofertas.imagem_altura is 'Altura (px) da miniatura do card, gravada no envio; null nas antigas.';

-- vitrine_salvar_envio: aceita largura/altura por oferta (o resto igual a 20261104000001).
--   p_ofertas: [{pagina, titulo, link, validade, imagem, miniatura, largura, altura}]

create or replace function public.vitrine_salvar_envio(
  p_arquivo_id uuid,
  p_filial filial_cvc,
  p_categoria_id uuid,
  p_titulo text,
  p_paginas integer,
  p_capa_pagina integer,
  p_pdf_nome text,
  p_ofertas jsonb,
  p_copiar_para filial_cvc[] default '{}'
)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_pasta text := p_filial::text || '/' || p_arquivo_id::text;
  v_categoria_nome text;
  v_destino filial_cvc;
  v_arquivo uuid;
  v_categoria uuid;
  o jsonb;
begin
  if jsonb_typeof(p_ofertas) is distinct from 'array' or jsonb_array_length(p_ofertas) = 0 then
    raise exception 'Nenhuma oferta para salvar.' using errcode = '22023';
  end if;
  if coalesce(p_pdf_nome, '') !~ '^[A-Za-z0-9][A-Za-z0-9 ._-]*\.pdf$' or length(p_pdf_nome) > 120 then
    raise exception 'Nome do PDF inválido.' using errcode = '22023';
  end if;
  if exists (
    select 1 from jsonb_array_elements(p_ofertas) x
    where coalesce(x.value ->> 'imagem', '') !~ '^[A-Za-z0-9][A-Za-z0-9 ._-]*\.(png|webp|jpg)$'
       or length(x.value ->> 'imagem') > 120
       or (x.value ->> 'miniatura') !~ '^[A-Za-z0-9][A-Za-z0-9 ._-]*-mini\.(webp|jpg)$'
       or length(x.value ->> 'miniatura') > 120
  ) then
    raise exception 'Nome de imagem inválido.' using errcode = '22023';
  end if;
  if coalesce(array_length(p_copiar_para, 1), 0) > 0 and not public.auth_is_admin() then
    raise exception 'Só adm/adm_master publica em outras filiais.' using errcode = '42501';
  end if;

  select nome into v_categoria_nome from public.vitrine_categorias where id = p_categoria_id and filial = p_filial;
  if v_categoria_nome is null then
    raise exception 'Categoria não encontrada nesta filial.' using errcode = '22023';
  end if;

  foreach v_destino in array
    array[p_filial] || array(select distinct d from unnest(coalesce(p_copiar_para, '{}')) d where d <> p_filial)
  loop
    if v_destino = p_filial then
      v_arquivo := p_arquivo_id;
      v_categoria := p_categoria_id;
    else
      v_arquivo := gen_random_uuid();
      select id into v_categoria from public.vitrine_categorias
      where filial = v_destino and lower(nome) = lower(v_categoria_nome);
      if v_categoria is null then
        insert into public.vitrine_categorias (filial, nome) values (v_destino, v_categoria_nome)
        returning id into v_categoria;
      end if;
    end if;

    insert into public.vitrine_arquivos (id, filial, categoria_id, titulo, pdf_path, paginas, capa_pagina)
    values (v_arquivo, v_destino, v_categoria, trim(p_titulo), v_pasta || '/' || p_pdf_nome, p_paginas, p_capa_pagina);

    for o in select value from jsonb_array_elements(p_ofertas) loop
      if (o ->> 'pagina') is not null and ((o ->> 'pagina')::int < 1 or (o ->> 'pagina')::int > p_paginas) then
        raise exception 'Página % fora do PDF.', o ->> 'pagina' using errcode = '22023';
      end if;
      insert into public.vitrine_ofertas (
        filial, categoria_id, arquivo_id, pagina, titulo, imagem_path, miniatura_path, imagem_largura, imagem_altura, link, validade
      )
      values (
        v_destino,
        v_categoria,
        v_arquivo,
        (o ->> 'pagina')::int,
        trim(o ->> 'titulo'),
        v_pasta || '/' || (o ->> 'imagem'),
        v_pasta || '/' || nullif(o ->> 'miniatura', ''),
        nullif(o ->> 'largura', '')::int,
        nullif(o ->> 'altura', '')::int,
        nullif(trim(o ->> 'link'), ''),
        nullif(o ->> 'validade', '')::date
      );
    end loop;
  end loop;

  return p_arquivo_id;
end;
$$;

revoke all on function public.vitrine_salvar_envio(uuid, filial_cvc, uuid, text, integer, integer, text, jsonb, filial_cvc[]) from public, anon;
grant execute on function public.vitrine_salvar_envio(uuid, filial_cvc, uuid, text, integer, integer, text, jsonb, filial_cvc[])
  to authenticated, service_role;
