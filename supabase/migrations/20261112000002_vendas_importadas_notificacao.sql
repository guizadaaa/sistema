-- ============================================================================
-- Aviso "Vendas da loja atualizadas" a cada importação de vendas.
--
-- * vendas_importacoes: uma linha por importação bem-sucedida (loja, "até",
--   quem importou, quando). Só a função abaixo grava.
-- * notificacoes.importacao_id: liga cada aviso à importação que o gerou
--   (null nos outros tipos).
-- * notificar_vendas_importadas(filial, ate): adm/adm_master; avisa todo
--   usuário ativo da loja, menos quem importou. Dedup: o aviso
--   vendas_importadas ainda não lido do usuário é marcado como lido (com o
--   mesmo now() do novo) e o novo entra no lugar — "substituído" na lista.
-- * listar_vendas_importacoes(por_filial): últimas importações por loja com
--   o status de cada destinatário (confirmado / pendente / substituído).
--   adm/adm_master veem todas as lojas; gerente só a própria.
-- ============================================================================

create table if not exists public.vendas_importacoes (
  id uuid primary key default gen_random_uuid(),
  filial filial_cvc not null,
  ate date not null,
  importado_por uuid not null references public.usuarios (id),
  importado_em timestamptz not null default now()
);

create index if not exists vendas_importacoes_filial_idx on public.vendas_importacoes (filial, importado_em desc);

alter table public.vendas_importacoes enable row level security;

drop policy if exists vendas_importacoes_select on public.vendas_importacoes;
create policy vendas_importacoes_select on public.vendas_importacoes
  for select to authenticated
  using (
    public.auth_is_admin()
    or (public.auth_perfil() = 'gerente' and filial = public.auth_filial())
  );

revoke all on public.vendas_importacoes from anon, authenticated;
grant select on public.vendas_importacoes to authenticated;

alter table public.notificacoes
  add column if not exists importacao_id uuid references public.vendas_importacoes (id) on delete cascade;

create index if not exists notificacoes_importacao_idx on public.notificacoes (importacao_id) where importacao_id is not null;

-- Guard de update: importacao_id também é imutável (só lida_em muda).
create or replace function public.enforce_notificacoes_update_permissions()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  if (
    old.destinatario_id, old.tipo, old.mensagem, old.caso_id, old.marco_dias, old.importacao_id, old.criado_em
  ) is distinct from (
    new.destinatario_id, new.tipo, new.mensagem, new.caso_id, new.marco_dias, new.importacao_id, new.criado_em
  ) then
    raise exception 'Só o campo lida_em pode ser alterado em notificacoes.';
  end if;
  return new;
end;
$$;

create or replace function public.notificar_vendas_importadas(p_filial text, p_ate date)
returns integer
language plpgsql security definer set search_path = public
as $$
declare
  v_importacao uuid;
  v_mensagem text;
  v_total integer;
begin
  if not coalesce(public.auth_is_admin(), false) then
    raise exception 'Só adm/adm_master podem registrar importação de vendas.';
  end if;
  if p_filial is null or p_ate is null then
    raise exception 'Loja e data são obrigatórias.';
  end if;

  insert into public.vendas_importacoes (filial, ate, importado_por)
  values (p_filial::filial_cvc, p_ate, auth.uid())
  returning id into v_importacao;

  v_mensagem := format('Vendas da loja %s atualizadas até %s.', p_filial, to_char(p_ate, 'DD/MM'));

  -- Dedup: o aviso anterior não lido sai (lida_em = now(), o mesmo criado_em
  -- do novo — é assim que a lista distingue "substituído" de "confirmado").
  update public.notificacoes n
     set lida_em = now()
    from public.usuarios u
   where n.destinatario_id = u.id
     and n.tipo = 'vendas_importadas'
     and n.lida_em is null
     and u.filial = p_filial::filial_cvc
     and u.ativo
     and u.id <> auth.uid();

  insert into public.notificacoes (destinatario_id, tipo, mensagem, importacao_id)
  select u.id, 'vendas_importadas', v_mensagem, v_importacao
    from public.usuarios u
   where u.filial = p_filial::filial_cvc
     and u.ativo
     and u.id <> auth.uid();
  get diagnostics v_total = row_count;

  return v_total;
end;
$$;

revoke all on function public.notificar_vendas_importadas(text, date) from public, anon;
grant execute on function public.notificar_vendas_importadas(text, date) to authenticated;

drop function if exists public.listar_vendas_importacoes(integer);

create function public.listar_vendas_importacoes(p_por_filial integer default 5)
returns table (
  id uuid,
  filial filial_cvc,
  ate date,
  importado_por_nome text,
  importado_em timestamptz,
  destinatarios jsonb
)
language sql stable security definer set search_path = public
as $$
  with visiveis as (
    select i.*, row_number() over (partition by i.filial order by i.importado_em desc) as ordem
      from public.vendas_importacoes i
     where public.auth_is_admin()
        or (public.auth_perfil() = 'gerente' and i.filial = public.auth_filial())
  )
  select
    v.id,
    v.filial,
    v.ate,
    u.nome_completo,
    v.importado_em,
    coalesce((
      select jsonb_agg(jsonb_build_object(
               'nome', d.nome_completo,
               'status', case
                 when n.lida_em is null then 'pendente'
                 when exists (
                   select 1 from public.notificacoes n2
                    where n2.destinatario_id = n.destinatario_id
                      and n2.tipo = 'vendas_importadas'
                      and n2.id <> n.id
                      and n2.criado_em = n.lida_em
                 ) then 'substituido'
                 else 'confirmado'
               end,
               'confirmado_em', n.lida_em
             ) order by d.nome_completo)
        from public.notificacoes n
        join public.usuarios d on d.id = n.destinatario_id
       where n.importacao_id = v.id
    ), '[]'::jsonb)
  from visiveis v
  join public.usuarios u on u.id = v.importado_por
  where v.ordem <= greatest(coalesce(p_por_filial, 5), 1)
  order by v.importado_em desc;
$$;

revoke all on function public.listar_vendas_importacoes(integer) from public, anon;
grant execute on function public.listar_vendas_importacoes(integer) to authenticated;
