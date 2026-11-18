-- ============================================================================
-- Vendedores do Systur: vínculo automático, sugestões e origem do vínculo.
--
--   systur_vendedor_mapeamento
--     vinculo_origem                'automatico' | 'manual' (null sem vínculo)
--     vinculo_automatico_bloqueado  true depois que um adm desvincula o nome:
--                                   o vínculo automático não volta.
--
--   Vínculo automático: nome do Systur sem vínculo cujo nome (sem acento e
--   caixa — normalizar_nome) é igual ao de exatamente UM usuário ativo.
--     * quando o nome entra no mapeamento (trigger BEFORE INSERT: cobre o
--       conferencia_sync da extensão e o conferencia_base do bot);
--     * quando um usuário é criado, reativado ou tem o nome corrigido
--       (trigger em usuarios), para os nomes que ainda estavam sem vínculo;
--     * uma vez nesta migration, para os nomes existentes.
--   Nunca troca um vínculo existente nem desfaz um desvínculo manual. Dois ou
--   mais usuários ativos com o mesmo nome: não vincula (vira sugestão).
--   Cada vínculo automático grava em auditoria
--   "vínculo automático: <nome Systur> → <usuário>". Sem usuário logado
--   (bot, criação de usuário pelo Auth, esta migration) o realizado_por é o
--   próprio usuário vinculado — a coluna é not null.
--
--   systur_sugestoes_usuarios(loja)   até 3 usuários ativos por nome sem
--     vínculo: nome igual, mesmo primeiro nome + sobrenome em comum, ou
--     similaridade pg_trgm >= 0,45. "forte" = 1º lugar único por nome igual
--     ou primeiro nome + sobrenome.
--   systur_vincular_sugestoes_fortes(ids)  vincula (origem manual) as
--     sugestões fortes dos ids confirmados na tela. Só adm/adm_master.
--
-- Acesso: nada muda — leitura e escrita do mapeamento continuam só para
-- adm/adm_master; as funções internas não são executáveis por authenticated.
--
-- Idempotente.
-- ============================================================================

create schema if not exists extensions;
create extension if not exists pg_trgm with schema extensions;

alter table public.systur_vendedor_mapeamento
  add column if not exists vinculo_origem text,
  add column if not exists vinculo_automatico_bloqueado boolean not null default false;

alter table public.systur_vendedor_mapeamento drop constraint if exists systur_vendedor_mapeamento_vinculo_origem_check;
alter table public.systur_vendedor_mapeamento add constraint systur_vendedor_mapeamento_vinculo_origem_check
  check (vinculo_origem in ('automatico', 'manual'));

comment on column public.systur_vendedor_mapeamento.vinculo_origem is
  'automatico (nome igual ao de um único usuário ativo) ou manual (adm). Null sem vínculo.';
comment on column public.systur_vendedor_mapeamento.vinculo_automatico_bloqueado is
  'true depois que um adm desvinculou o nome: o vínculo automático não volta a vincular.';

-- Vínculos que já existiam foram feitos pelo adm.
update public.systur_vendedor_mapeamento
set vinculo_origem = 'manual'
where usuario_id is not null and vinculo_origem is null;

-- ----------------------------------------------------------------------------
-- Auditoria do vínculo automático
-- ----------------------------------------------------------------------------

create or replace function public._systur_auditar_vinculo_automatico(
  p_mapeamento uuid, p_nome_systur text, p_usuario uuid, p_acao acao_auditoria
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_nome text;
  v_autor uuid;
begin
  select u.nome_completo into v_nome from public.usuarios u where u.id = p_usuario;
  select u.id into v_autor from public.usuarios u where u.id = auth.uid();

  insert into public.auditoria (tabela, registro_id, acao, dados_antigos, dados_novos, realizado_por)
  values (
    'systur_vendedor_mapeamento',
    p_mapeamento,
    p_acao,
    case when p_acao = 'update' then jsonb_build_object('usuario_id', null) end,
    jsonb_build_object(
      'descricao', format('vínculo automático: %s → %s', p_nome_systur, v_nome),
      'nome_systur', p_nome_systur,
      'usuario_id', p_usuario,
      'vinculo_origem', 'automatico'
    ),
    coalesce(v_autor, p_usuario)
  );
end;
$$;

revoke all on function public._systur_auditar_vinculo_automatico(uuid, text, uuid, acao_auditoria) from public, anon, authenticated;

-- Usuário ativo único com o nome (sem acento/caixa); null se nenhum ou 2+.
create or replace function public._systur_usuario_unico_por_nome(p_nome text)
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select case when count(*) = 1 then (array_agg(u.id))[1] end
  from public.usuarios u
  where u.ativo
    and public.normalizar_nome(u.nome_completo) = public.normalizar_nome(p_nome)
    and not public.vendedor_eh_site(p_nome);
$$;

revoke all on function public._systur_usuario_unico_por_nome(text) from public, anon, authenticated;

-- ----------------------------------------------------------------------------
-- Vínculo automático dos nomes sem vínculo (p_usuario: só os desse usuário)
-- ----------------------------------------------------------------------------

create or replace function public.systur_vincular_automatico(p_usuario uuid default null)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  r record;
  v_qtd integer := 0;
begin
  for r in
    select m.id, m.nome_systur, x.usuario_id
    from public.systur_vendedor_mapeamento m
    cross join lateral (select public._systur_usuario_unico_por_nome(m.nome_systur) as usuario_id) x
    where m.usuario_id is null
      and not m.vinculo_automatico_bloqueado
      and x.usuario_id is not null
      and (p_usuario is null or x.usuario_id = p_usuario)
    order by m.loja, m.nome_systur
  loop
    update public.systur_vendedor_mapeamento
    set usuario_id = r.usuario_id, vinculo_origem = 'automatico'
    where id = r.id and usuario_id is null and not vinculo_automatico_bloqueado;

    if found then
      perform public._systur_auditar_vinculo_automatico(r.id, r.nome_systur, r.usuario_id, 'update');
      v_qtd := v_qtd + 1;
    end if;
  end loop;
  return v_qtd;
end;
$$;

revoke all on function public.systur_vincular_automatico(uuid) from public, anon, authenticated;
grant execute on function public.systur_vincular_automatico(uuid) to service_role;

-- ----------------------------------------------------------------------------
-- Triggers do mapeamento
-- ----------------------------------------------------------------------------

-- Nome novo (conferencia_sync / conferencia_base): vínculo automático antes
-- de gravar. Com "on conflict do nothing" o BEFORE INSERT roda também para
-- nome que já existe — a checagem do índice (loja, nome) evita o trabalho.
create or replace function public.systur_mapeamento_vinculo_ao_inserir()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.usuario_id is not null then
    new.vinculo_origem := coalesce(new.vinculo_origem, 'manual');
  elsif not new.vinculo_automatico_bloqueado
    and not exists (
      select 1 from public.systur_vendedor_mapeamento m
      where m.loja = new.loja and m.nome_systur = new.nome_systur
    )
  then
    new.usuario_id := public._systur_usuario_unico_por_nome(new.nome_systur);
    new.vinculo_origem := case when new.usuario_id is not null then 'automatico' end;
  end if;
  return new;
end;
$$;

drop trigger if exists systur_vendedor_mapeamento_vinculo_ao_inserir on public.systur_vendedor_mapeamento;
create trigger systur_vendedor_mapeamento_vinculo_ao_inserir
  before insert on public.systur_vendedor_mapeamento
  for each row execute function public.systur_mapeamento_vinculo_ao_inserir();

-- Auditoria só do que foi gravado (AFTER: não dispara no "do nothing").
create or replace function public.systur_mapeamento_auditar_insercao()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.vinculo_origem = 'automatico' then
    perform public._systur_auditar_vinculo_automatico(new.id, new.nome_systur, new.usuario_id, 'insert');
  end if;
  return null;
end;
$$;

drop trigger if exists systur_vendedor_mapeamento_auditar_insercao on public.systur_vendedor_mapeamento;
create trigger systur_vendedor_mapeamento_auditar_insercao
  after insert on public.systur_vendedor_mapeamento
  for each row execute function public.systur_mapeamento_auditar_insercao();

-- Troca de vínculo pela tela (o adm só tem grant em usuario_id e
-- login_systur): vira 'manual'; desvincular bloqueia o vínculo automático.
-- O vínculo automático grava vinculo_origem = 'automatico' junto — como
-- antes era null, o valor mudou e é mantido.
create or replace function public.systur_mapeamento_origem_vinculo()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.usuario_id is distinct from old.usuario_id then
    if new.usuario_id is null then
      new.vinculo_origem := null;
      new.vinculo_automatico_bloqueado := true;
    elsif new.vinculo_origem is not distinct from old.vinculo_origem then
      new.vinculo_origem := 'manual';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists systur_vendedor_mapeamento_origem_vinculo on public.systur_vendedor_mapeamento;
create trigger systur_vendedor_mapeamento_origem_vinculo
  before update of usuario_id on public.systur_vendedor_mapeamento
  for each row execute function public.systur_mapeamento_origem_vinculo();

-- ----------------------------------------------------------------------------
-- Usuário criado, reativado ou com nome corrigido
-- ----------------------------------------------------------------------------

create or replace function public.usuarios_vincular_systur()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.ativo and (
    tg_op = 'INSERT'
    or not old.ativo
    or public.normalizar_nome(new.nome_completo) is distinct from public.normalizar_nome(old.nome_completo)
  ) then
    perform public.systur_vincular_automatico(new.id);
  end if;
  return null;
end;
$$;

drop trigger if exists usuarios_vincular_systur on public.usuarios;
create trigger usuarios_vincular_systur
  after insert or update of ativo, nome_completo on public.usuarios
  for each row execute function public.usuarios_vincular_systur();

-- ----------------------------------------------------------------------------
-- Sugestões (até 3 por nome sem vínculo)
-- ----------------------------------------------------------------------------

create or replace function public._systur_sugestoes(p_loja filial_cvc default null)
returns table (mapeamento_id uuid, usuario_id uuid, criterio text, posicao integer, forte boolean)
language sql
stable
security definer
set search_path = public
as $$
  with m as (
    select m.id, m.loja, public.normalizar_nome(m.nome_systur) as n
    from public.systur_vendedor_mapeamento m
    where m.usuario_id is null
      and not public.vendedor_eh_site(m.nome_systur)
      and (p_loja is null or m.loja = p_loja)
  ),
  u as (
    select u.id, u.filial, public.normalizar_nome(u.nome_completo) as n
    from public.usuarios u
    where u.ativo
  ),
  pares as (
    select
      m.id as mapeamento_id,
      u.id as usuario_id,
      (u.filial = m.loja) as mesma_loja,
      extensions.similarity(u.n, m.n) as sim,
      case
        when u.n = m.n then 1
        when split_part(u.n, ' ', 1) = split_part(m.n, ' ', 1)
          and exists (
            select 1
            from unnest((string_to_array(u.n, ' '))[2:]) t
            where length(t) >= 3
              and t not in ('dos', 'das', 'de', 'da', 'do', 'e')
              and t = any ((string_to_array(m.n, ' '))[2:])
          )
          then 2
        when extensions.similarity(u.n, m.n) >= 0.45 then 3
      end as nivel
    from m
    cross join u
  ),
  ranqueados as (
    select
      p.*,
      row_number() over (
        partition by p.mapeamento_id
        order by p.nivel, p.mesma_loja desc nulls last, p.sim desc, p.usuario_id
      )::integer as posicao,
      count(*) over (partition by p.mapeamento_id, p.nivel) as empatados
    from pares p
    where p.nivel is not null
  )
  select r.mapeamento_id, r.usuario_id,
    case r.nivel when 1 then 'nome_igual' when 2 then 'nome_sobrenome' else 'parecido' end,
    r.posicao,
    r.posicao = 1 and r.nivel <= 2 and r.empatados = 1
  from ranqueados r
  where r.posicao <= 3;
$$;

revoke all on function public._systur_sugestoes(filial_cvc) from public, anon, authenticated;

create or replace function public.systur_sugestoes_usuarios(p_loja filial_cvc default null)
returns table (mapeamento_id uuid, usuario_id uuid, criterio text, posicao integer, forte boolean)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.auth_is_admin() then
    raise exception 'Apenas administradores podem ver sugestões de vínculo.' using errcode = '42501';
  end if;
  return query select * from public._systur_sugestoes(p_loja) order by 1, 4;
end;
$$;

revoke all on function public.systur_sugestoes_usuarios(filial_cvc) from public, anon;
grant execute on function public.systur_sugestoes_usuarios(filial_cvc) to authenticated, service_role;

-- Vincula as sugestões fortes dos ids que o adm confirmou (a tela mostra a
-- lista antes). Ignora nome que já ganhou vínculo, que o adm desvinculou ou
-- cuja sugestão deixou de ser forte desde a confirmação.
create or replace function public.systur_vincular_sugestoes_fortes(p_ids uuid[])
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_qtd integer;
begin
  if not public.auth_is_admin() then
    raise exception 'Apenas administradores podem vincular nomes do Systur.' using errcode = '42501';
  end if;

  update public.systur_vendedor_mapeamento m
  set usuario_id = s.usuario_id, vinculo_origem = 'manual'
  from public._systur_sugestoes(null) s
  where s.forte
    and s.mapeamento_id = m.id
    and m.id = any (p_ids)
    and m.usuario_id is null
    and not m.vinculo_automatico_bloqueado;
  get diagnostics v_qtd = row_count;
  return v_qtd;
end;
$$;

revoke all on function public.systur_vincular_sugestoes_fortes(uuid[]) from public, anon;
grant execute on function public.systur_vincular_sugestoes_fortes(uuid[]) to authenticated, service_role;

-- ----------------------------------------------------------------------------
-- Tela: grupos + origem do vínculo
-- ----------------------------------------------------------------------------

drop function if exists public.systur_mapeamento_grupos(filial_cvc);

create function public.systur_mapeamento_grupos(p_loja filial_cvc default null)
returns table (
  id uuid,
  nome_systur text,
  loja filial_cvc,
  usuario_id uuid,
  login_systur text,
  usuario_nome text,
  grupo text,
  parece_ativo boolean,
  vinculo_origem text,
  vinculo_automatico_bloqueado boolean
)
language sql
stable
security definer
set search_path = public
as $$
  select m.id, m.nome_systur, m.loja, m.usuario_id, m.login_systur, u.nome_completo,
    case
      when public.vendedor_eh_site(m.nome_systur) then 'site'
      when coalesce(u.ativo, false) then 'atual'
      else 'sem_vinculo'
    end,
    m.usuario_id is null and exists (
      select 1 from public.usuarios x
      where x.ativo and public.normalizar_nome(x.nome_completo) = public.normalizar_nome(m.nome_systur)
    ),
    m.vinculo_origem,
    m.vinculo_automatico_bloqueado
  from public.systur_vendedor_mapeamento m
  left join public.usuarios u on u.id = m.usuario_id
  where public.auth_is_admin()
    and (p_loja is null or m.loja = p_loja)
  order by public.normalizar_nome(m.nome_systur), m.loja;
$$;

revoke all on function public.systur_mapeamento_grupos(filial_cvc) from public, anon;
grant execute on function public.systur_mapeamento_grupos(filial_cvc) to authenticated, service_role;

-- ----------------------------------------------------------------------------
-- Uma vez: nomes que já existem
-- ----------------------------------------------------------------------------

select public.systur_vincular_automatico(null);
