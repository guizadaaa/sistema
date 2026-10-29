-- ============================================================================
-- Vitrine: nomes legíveis no storage e correção dos títulos sugeridos
--
-- 1. A imagem e o PDF passam a abrir inline (URL assinada sem "download");
--    "Salvar como" usa o nome do objeto. Layout novo, tudo na pasta da vitrine:
--      {filial}/{arquivo_id}/{categoria} - {titulo da vitrine}.pdf
--      {filial}/{arquivo_id}/{titulo-da-oferta}.png   (capa: capa.png)
--    Layout antigo ({filial}/{arquivo_id}.pdf e .../p{n}.png) continua
--    legível até ser migrado — o adm_master migra pela tela (copia, atualiza
--    pdf_path/imagem_path e só depois apaga o antigo; ver
--    src/lib/vitrine/migrar-nomes.ts). SQL não move objeto no Storage.
-- 2. Títulos gravados que começam com "A partir de:" ficam só com o nome da
--    oferta (até antes de "Valor"), mesma regra de corrigirTituloGravado()
--    em src/lib/vitrine/titulo.ts.
--
-- Idempotente.
-- ============================================================================

-- Pasta da vitrine a partir do pdf_path (layout novo e antigo).
create or replace function public.vitrine_pasta(p_pdf_path text)
returns text
language sql
immutable
set search_path = public
as $$
  select case
    when p_pdf_path ~ '^[^/]+/[^/]+\.pdf$' then left(p_pdf_path, length(p_pdf_path) - 4)  -- antigo
    else regexp_replace(p_pdf_path, '/[^/]+$', '')                                        -- novo
  end;
$$;

-- ----------------------------------------------------------------------------
-- 2. Títulos
-- ----------------------------------------------------------------------------

create or replace function public._vitrine_corrigir_titulo(p_titulo text)
returns text
language sql
immutable
set search_path = public
as $$
  select case
    when p_titulo !~* '^\s*a\s+partir\s+de' then p_titulo
    else coalesce(
      nullif(
        regexp_replace(
          regexp_replace(
            regexp_replace(
              regexp_replace(
                regexp_replace(p_titulo, '^\s*a\s+partir\s+de\s*:?\s*', '', 'i'),
                '\mvalor\M.*$', '', 'i'),
              'R\$\s*[0-9.,]+|\mp(or|/)\s*pessoa\M|\+\s*taxas?|\*', ' ', 'gi'),
            '\s+', ' ', 'g'),
          '^[[:space:],.:;-]+|[[:space:],.:;-]+$', '', 'g'),
        ''),
      p_titulo)
  end;
$$;

update public.vitrine_ofertas
set titulo = public._vitrine_corrigir_titulo(titulo)
where titulo ~* '^\s*a\s+partir\s+de'
  and public._vitrine_corrigir_titulo(titulo) <> titulo;

-- ----------------------------------------------------------------------------
-- 1. Storage: leitura pela pasta da vitrine (layout novo e antigo)
-- ----------------------------------------------------------------------------

drop policy if exists storage_vitrine_select on storage.objects;
create policy storage_vitrine_select
  on storage.objects for select to authenticated
  using (
    bucket_id = 'vitrine'
    and exists (
      select 1 from public.vitrine_arquivos a
      where storage.objects.name = a.pdf_path
         or storage.objects.name like public.vitrine_pasta(a.pdf_path) || '/%'
    )
  );

-- ----------------------------------------------------------------------------
-- vitrine_salvar_envio: nomes dos arquivos vêm do envio.
--   p_pdf_nome:   "{categoria} - {titulo}.pdf"
--   p_ofertas:    [{pagina, titulo, link, validade, imagem}] (imagem = nome do PNG)
-- ----------------------------------------------------------------------------

drop function if exists public.vitrine_salvar_envio(uuid, filial_cvc, uuid, text, integer, integer, jsonb, filial_cvc[]);

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
    where coalesce(x.value ->> 'imagem', '') !~ '^[A-Za-z0-9][A-Za-z0-9 ._-]*\.png$' or length(x.value ->> 'imagem') > 120
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
      insert into public.vitrine_ofertas (filial, categoria_id, arquivo_id, pagina, titulo, imagem_path, link, validade)
      values (
        v_destino,
        v_categoria,
        v_arquivo,
        (o ->> 'pagina')::int,
        trim(o ->> 'titulo'),
        v_pasta || '/' || (o ->> 'imagem'),
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

-- ----------------------------------------------------------------------------
-- vitrine_excluir_oferta: "prefixo" = pasta da vitrine (layout novo e antigo).
-- ----------------------------------------------------------------------------

create or replace function public.vitrine_excluir_oferta(p_oferta_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_oferta public.vitrine_ofertas%rowtype;
  v_pdf text;
  v_remover text[] := '{}';
  v_prefixo text;
begin
  select * into v_oferta from public.vitrine_ofertas where id = p_oferta_id for update;
  if not found or not public.vitrine_pode_editar(v_oferta.filial) then
    raise exception 'Oferta não encontrada.' using errcode = '42501';
  end if;

  delete from public.vitrine_ofertas where id = p_oferta_id;

  select pdf_path into v_pdf from public.vitrine_arquivos where id = v_oferta.arquivo_id;

  if not exists (select 1 from public.vitrine_ofertas where imagem_path = v_oferta.imagem_path) then
    v_remover := v_remover || v_oferta.imagem_path;
  end if;

  if not exists (select 1 from public.vitrine_ofertas where arquivo_id = v_oferta.arquivo_id) then
    delete from public.vitrine_arquivos where id = v_oferta.arquivo_id;
  end if;

  if not exists (select 1 from public.vitrine_arquivos where pdf_path = v_pdf) then
    v_prefixo := public.vitrine_pasta(v_pdf);
    v_remover := v_remover || v_pdf;
  end if;

  return jsonb_build_object('remover', to_jsonb(v_remover), 'prefixo', v_prefixo);
end;
$$;

revoke all on function public.vitrine_excluir_oferta(uuid) from public, anon;
grant execute on function public.vitrine_excluir_oferta(uuid) to authenticated, service_role;
