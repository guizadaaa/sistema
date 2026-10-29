-- ============================================================================
-- Materiais de apoio · aba "Vitrine" (por filial)
--
-- Vitrines são PDFs de "vitrine LED" (página larga): capa + uma oferta por
-- página. Diferente de materiais_apoio (corporativo, vale para todas as
-- filiais), a Vitrine é separada por filial:
--
--   vitrine_categorias  categorias da filial (Cruzeiros, Nacional...)
--   vitrine_arquivos    o PDF enviado (pdf_path no bucket "vitrine")
--   vitrine_ofertas     uma por página (PNG da página, título, link, validade)
--
-- Storage privado "vitrine": {filial}/{arquivo_id}.pdf e
-- {filial}/{arquivo_id}/p{n}.png. O PDF (até 25 MB) sobe direto do navegador
-- com URL assinada de upload — nunca passa pelo servidor do Next (teto de
-- corpo da Vercel). "Publicar também em" (adm) cria cópias independentes
-- nas outras filiais apontando para os mesmos arquivos do storage.
--
-- Quem vê: a própria filial (usuarios.filial); adm/adm_master todas.
-- Quem edita: adm/adm_master qualquer filial; gerente a própria. Vendedor só
-- visualiza, e não vê oferta inativa, vencida (validade < hoje) nem de
-- categoria inativa.
--
-- Idempotente (if not exists / create or replace / drop policy if exists).
-- ============================================================================

create or replace function public.vitrine_pode_ver(p_filial filial_cvc)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.auth_is_admin() or (public.auth_ativo() and public.auth_filial() = p_filial);
$$;

create or replace function public.vitrine_pode_editar(p_filial filial_cvc)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.auth_is_admin()
    or (public.auth_ativo() and public.auth_perfil() = 'gerente' and public.auth_filial() = p_filial);
$$;

revoke all on function public.vitrine_pode_ver(filial_cvc) from public, anon;
revoke all on function public.vitrine_pode_editar(filial_cvc) from public, anon;
grant execute on function public.vitrine_pode_ver(filial_cvc) to authenticated, service_role;
grant execute on function public.vitrine_pode_editar(filial_cvc) to authenticated, service_role;

-- ----------------------------------------------------------------------------
-- Tabelas
-- ----------------------------------------------------------------------------

create table if not exists public.vitrine_categorias (
  id uuid primary key default gen_random_uuid(),
  filial filial_cvc not null,
  nome text not null check (length(trim(nome)) > 0),
  ordem integer not null,
  ativo boolean not null default true,
  criado_em timestamptz not null default now()
);

create unique index if not exists vitrine_categorias_filial_nome_unico
  on public.vitrine_categorias (filial, lower(nome));

create table if not exists public.vitrine_arquivos (
  id uuid primary key default gen_random_uuid(),
  filial filial_cvc not null,
  categoria_id uuid not null references public.vitrine_categorias (id) on delete restrict,
  titulo text not null check (length(trim(titulo)) > 0),
  pdf_path text not null,
  paginas integer not null check (paginas between 1 and 200),
  capa_pagina integer check (capa_pagina is null or capa_pagina between 1 and paginas),
  enviado_por uuid references public.usuarios (id),
  enviado_em timestamptz not null default now()
);

comment on column public.vitrine_arquivos.pdf_path is
  '{filial}/{arquivo_id}.pdf. Cópias publicadas em outra filial apontam para o mesmo arquivo (e PNGs em {pdf sem .pdf}/p{n}.png).';
comment on column public.vitrine_arquivos.capa_pagina is
  'Página marcada como capa: não vira oferta, mas fica guardada para "Ver vitrine completa".';

create index if not exists vitrine_arquivos_pdf_path_idx on public.vitrine_arquivos (pdf_path);

create table if not exists public.vitrine_ofertas (
  id uuid primary key default gen_random_uuid(),
  filial filial_cvc not null,
  categoria_id uuid not null references public.vitrine_categorias (id) on delete restrict,
  arquivo_id uuid not null references public.vitrine_arquivos (id) on delete restrict,
  pagina integer check (pagina is null or pagina >= 1),
  titulo text not null check (length(trim(titulo)) > 0),
  imagem_path text not null,
  link text check (link is null or link ~* '^https://'),
  validade date,
  ordem integer not null,
  ativo boolean not null default true,
  criado_por uuid references public.usuarios (id),
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

comment on column public.vitrine_ofertas.pagina is 'Página do PDF; null = "PDF inteiro como uma oferta só".';
comment on column public.vitrine_ofertas.link is 'Só https://. Fora de cvc.com.br a tela pede confirmação antes de salvar.';

create index if not exists vitrine_ofertas_categoria_idx on public.vitrine_ofertas (categoria_id, ordem);
create index if not exists vitrine_ofertas_arquivo_idx on public.vitrine_ofertas (arquivo_id);
create index if not exists vitrine_ofertas_imagem_idx on public.vitrine_ofertas (imagem_path);

-- ----------------------------------------------------------------------------
-- Triggers: autoria, ordem, atualizado_em e coerência de filial
-- ----------------------------------------------------------------------------

create or replace function public.vitrine_antes_de_gravar()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_table_name = 'vitrine_categorias' then
    if tg_op = 'INSERT' and new.ordem is null then
      select coalesce(max(ordem), 0) + 1 into new.ordem from public.vitrine_categorias where filial = new.filial;
    end if;
    return new;
  end if;

  if tg_table_name = 'vitrine_arquivos' then
    if tg_op = 'INSERT' then
      new.enviado_por := coalesce(auth.uid(), new.enviado_por);
      new.enviado_em := now();
    else
      new.enviado_por := old.enviado_por;
      new.enviado_em := old.enviado_em;
    end if;
    if (select c.filial from public.vitrine_categorias c where c.id = new.categoria_id) is distinct from new.filial then
      raise exception 'A categoria é de outra filial.' using errcode = '22023';
    end if;
    return new;
  end if;

  -- vitrine_ofertas
  if tg_op = 'INSERT' then
    new.criado_por := coalesce(auth.uid(), new.criado_por);
    if new.ordem is null then
      select coalesce(max(ordem), 0) + 1 into new.ordem from public.vitrine_ofertas where categoria_id = new.categoria_id;
    end if;
  else
    new.criado_por := old.criado_por;
    new.criado_em := old.criado_em;
  end if;
  new.atualizado_em := now();
  if (select c.filial from public.vitrine_categorias c where c.id = new.categoria_id) is distinct from new.filial
     or (select a.filial from public.vitrine_arquivos a where a.id = new.arquivo_id) is distinct from new.filial then
    raise exception 'Categoria e vitrine precisam ser da mesma filial da oferta.' using errcode = '22023';
  end if;
  return new;
end;
$$;

drop trigger if exists vitrine_categorias_antes_de_gravar on public.vitrine_categorias;
create trigger vitrine_categorias_antes_de_gravar before insert or update on public.vitrine_categorias
  for each row execute function public.vitrine_antes_de_gravar();
drop trigger if exists vitrine_arquivos_antes_de_gravar on public.vitrine_arquivos;
create trigger vitrine_arquivos_antes_de_gravar before insert or update on public.vitrine_arquivos
  for each row execute function public.vitrine_antes_de_gravar();
drop trigger if exists vitrine_ofertas_antes_de_gravar on public.vitrine_ofertas;
create trigger vitrine_ofertas_antes_de_gravar before insert or update on public.vitrine_ofertas
  for each row execute function public.vitrine_antes_de_gravar();

-- ----------------------------------------------------------------------------
-- RLS
-- ----------------------------------------------------------------------------

alter table public.vitrine_categorias enable row level security;
alter table public.vitrine_arquivos enable row level security;
alter table public.vitrine_ofertas enable row level security;

drop policy if exists vitrine_categorias_select on public.vitrine_categorias;
create policy vitrine_categorias_select
  on public.vitrine_categorias for select to authenticated
  using (public.vitrine_pode_ver(filial) and (ativo or public.vitrine_pode_editar(filial)));

drop policy if exists vitrine_categorias_insert on public.vitrine_categorias;
create policy vitrine_categorias_insert
  on public.vitrine_categorias for insert to authenticated
  with check (public.vitrine_pode_editar(filial));

drop policy if exists vitrine_categorias_update on public.vitrine_categorias;
create policy vitrine_categorias_update
  on public.vitrine_categorias for update to authenticated
  using (public.vitrine_pode_editar(filial))
  with check (public.vitrine_pode_editar(filial));

drop policy if exists vitrine_categorias_delete on public.vitrine_categorias;
create policy vitrine_categorias_delete
  on public.vitrine_categorias for delete to authenticated
  using (public.vitrine_pode_editar(filial));

drop policy if exists vitrine_arquivos_select on public.vitrine_arquivos;
create policy vitrine_arquivos_select
  on public.vitrine_arquivos for select to authenticated
  using (public.vitrine_pode_ver(filial));

drop policy if exists vitrine_arquivos_insert on public.vitrine_arquivos;
create policy vitrine_arquivos_insert
  on public.vitrine_arquivos for insert to authenticated
  with check (public.vitrine_pode_editar(filial));

drop policy if exists vitrine_arquivos_update on public.vitrine_arquivos;
create policy vitrine_arquivos_update
  on public.vitrine_arquivos for update to authenticated
  using (public.vitrine_pode_editar(filial))
  with check (public.vitrine_pode_editar(filial));

-- Vendedor: só oferta ativa, não vencida e de categoria ativa.
drop policy if exists vitrine_ofertas_select on public.vitrine_ofertas;
create policy vitrine_ofertas_select
  on public.vitrine_ofertas for select to authenticated
  using (
    public.vitrine_pode_ver(filial)
    and (
      public.vitrine_pode_editar(filial)
      or (
        ativo
        and (validade is null or validade >= (now() at time zone 'America/Sao_Paulo')::date)
        and exists (select 1 from public.vitrine_categorias c where c.id = vitrine_ofertas.categoria_id and c.ativo)
      )
    )
  );

drop policy if exists vitrine_ofertas_insert on public.vitrine_ofertas;
create policy vitrine_ofertas_insert
  on public.vitrine_ofertas for insert to authenticated
  with check (public.vitrine_pode_editar(filial));

drop policy if exists vitrine_ofertas_update on public.vitrine_ofertas;
create policy vitrine_ofertas_update
  on public.vitrine_ofertas for update to authenticated
  using (public.vitrine_pode_editar(filial))
  with check (public.vitrine_pode_editar(filial));

-- DELETE de oferta/arquivo só por vitrine_excluir_oferta() (decide o que
-- sobra no storage, inclusive cópias de outras filiais).
grant select, insert, update, delete on public.vitrine_categorias to authenticated;
grant select, insert, update on public.vitrine_arquivos, public.vitrine_ofertas to authenticated;
grant select, insert, update, delete on public.vitrine_categorias, public.vitrine_arquivos, public.vitrine_ofertas
  to service_role;

-- ----------------------------------------------------------------------------
-- Storage
-- ----------------------------------------------------------------------------

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('vitrine', 'vitrine', false, 26214400, array['application/pdf', 'image/png'])
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- Leitura: o arquivo pertence a alguma vitrine que o usuário enxerga (a
-- cópia de outra filial aponta para a pasta da filial que enviou).
drop policy if exists storage_vitrine_select on storage.objects;
create policy storage_vitrine_select
  on storage.objects for select to authenticated
  using (
    bucket_id = 'vitrine'
    and exists (
      select 1 from public.vitrine_arquivos a
      where storage.objects.name = a.pdf_path
         or storage.objects.name like left(a.pdf_path, length(a.pdf_path) - 4) || '/%'
    )
  );

-- Envio: na pasta de uma filial que o usuário edita (URL assinada de upload
-- criada no servidor com a sessão do usuário passa por esta policy).
drop policy if exists storage_vitrine_insert on storage.objects;
create policy storage_vitrine_insert
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'vitrine'
    and (storage.foldername(name))[1] in ('1710', '1714', '1730')
    and public.vitrine_pode_editar(((storage.foldername(name))[1])::filial_cvc)
  );

-- ----------------------------------------------------------------------------
-- vitrine_salvar_envio: grava a vitrine revisada (e as cópias) numa
-- transação. Roda como o usuário (security invoker): a RLS decide.
--   p_ofertas: [{pagina, titulo, link, validade}] — pagina null = PDF inteiro.
-- ----------------------------------------------------------------------------

create or replace function public.vitrine_salvar_envio(
  p_arquivo_id uuid,
  p_filial filial_cvc,
  p_categoria_id uuid,
  p_titulo text,
  p_paginas integer,
  p_capa_pagina integer,
  p_ofertas jsonb,
  p_copiar_para filial_cvc[] default '{}'
)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_pdf_path text := p_filial::text || '/' || p_arquivo_id::text || '.pdf';
  v_prefixo text := p_filial::text || '/' || p_arquivo_id::text;
  v_categoria_nome text;
  v_destino filial_cvc;
  v_arquivo uuid;
  v_categoria uuid;
  o jsonb;
begin
  if jsonb_typeof(p_ofertas) is distinct from 'array' or jsonb_array_length(p_ofertas) = 0 then
    raise exception 'Nenhuma oferta para salvar.' using errcode = '22023';
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
      -- Mesma categoria (pelo nome) na filial de destino; cria se não existir.
      select id into v_categoria from public.vitrine_categorias
      where filial = v_destino and lower(nome) = lower(v_categoria_nome);
      if v_categoria is null then
        insert into public.vitrine_categorias (filial, nome) values (v_destino, v_categoria_nome)
        returning id into v_categoria;
      end if;
    end if;

    insert into public.vitrine_arquivos (id, filial, categoria_id, titulo, pdf_path, paginas, capa_pagina)
    values (v_arquivo, v_destino, v_categoria, trim(p_titulo), v_pdf_path, p_paginas, p_capa_pagina);

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
        v_prefixo || '/p' || coalesce((o ->> 'pagina')::int, coalesce(p_capa_pagina, 1)) || '.png',
        nullif(trim(o ->> 'link'), ''),
        nullif(o ->> 'validade', '')::date
      );
    end loop;
  end loop;

  return p_arquivo_id;
end;
$$;

revoke all on function public.vitrine_salvar_envio(uuid, filial_cvc, uuid, text, integer, integer, jsonb, filial_cvc[]) from public, anon;
grant execute on function public.vitrine_salvar_envio(uuid, filial_cvc, uuid, text, integer, integer, jsonb, filial_cvc[])
  to authenticated, service_role;

-- ----------------------------------------------------------------------------
-- vitrine_excluir_oferta: apaga a oferta e diz o que pode sair do storage.
-- Security definer porque precisa enxergar as cópias das outras filiais
-- para saber se a imagem/PDF ainda está em uso. Retorna
--   {"remover": [caminhos], "prefixo": "<filial>/<arquivo>" | null}
-- prefixo = nenhuma vitrine usa mais o PDF: apagar o PDF e a pasta de PNGs.
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
    v_prefixo := left(v_pdf, length(v_pdf) - 4);
    v_remover := v_remover || v_pdf;
  end if;

  return jsonb_build_object('remover', to_jsonb(v_remover), 'prefixo', v_prefixo);
end;
$$;

revoke all on function public.vitrine_excluir_oferta(uuid) from public, anon;
grant execute on function public.vitrine_excluir_oferta(uuid) to authenticated, service_role;

-- ----------------------------------------------------------------------------
-- Reordenar (setas): troca a ordem com o vizinho. Security invoker — a RLS
-- de update decide. Renumera o grupo antes, para não depender de ordens
-- repetidas.
-- ----------------------------------------------------------------------------

create or replace function public.vitrine_mover(p_tabela text, p_id uuid, p_direcao integer)
returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_ids uuid[];
  v_pos integer;
  v_outro integer;
begin
  if p_direcao not in (-1, 1) then
    raise exception 'Direção inválida.' using errcode = '22023';
  end if;

  if p_tabela = 'categoria' then
    select array_agg(c.id order by c.ordem, c.nome) into v_ids
    from public.vitrine_categorias c
    where c.filial = (select filial from public.vitrine_categorias where id = p_id);
  elsif p_tabela = 'oferta' then
    select array_agg(o.id order by o.ordem, o.criado_em) into v_ids
    from public.vitrine_ofertas o
    where o.categoria_id = (select categoria_id from public.vitrine_ofertas where id = p_id);
  else
    raise exception 'Tabela inválida.' using errcode = '22023';
  end if;

  v_pos := array_position(v_ids, p_id);
  if v_pos is null then
    raise exception 'Item não encontrado.' using errcode = '22023';
  end if;
  v_outro := v_pos + p_direcao;
  if v_outro < 1 or v_outro > array_length(v_ids, 1) then
    return;
  end if;
  -- troca as posições
  select array_agg(x order by i) into v_ids from (
    select case when u.i = v_pos then v_ids[v_outro] when u.i = v_outro then v_ids[v_pos] else u.x end as x, u.i
    from unnest(v_ids) with ordinality as u (x, i)
  ) t;

  if p_tabela = 'categoria' then
    update public.vitrine_categorias c set ordem = u.i from unnest(v_ids) with ordinality as u (id, i)
    where c.id = u.id and c.ordem is distinct from u.i;
  else
    update public.vitrine_ofertas o set ordem = u.i from unnest(v_ids) with ordinality as u (id, i)
    where o.id = u.id and o.ordem is distinct from u.i;
  end if;
end;
$$;

revoke all on function public.vitrine_mover(text, uuid, integer) from public, anon;
grant execute on function public.vitrine_mover(text, uuid, integer) to authenticated, service_role;
