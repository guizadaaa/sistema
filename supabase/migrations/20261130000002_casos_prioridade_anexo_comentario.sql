-- ============================================================================
-- Casos: grau de prioridade, comentário nos anexos e "Casos em aberto" por
-- grau na página inicial.
--
-- 1. casos.prioridade smallint (1 Baixa, 2 Média, 3 Alta, 4 Urgente).
--    NULL = "Sem grau" (casos antigos; nada é preenchido automaticamente).
--    Obrigatória na criação pela tela (zod em src/lib/validation/caso.ts);
--    no banco fica nullable pelos casos antigos e pelas cargas/scripts.
-- 2. Quem altera depois de criado: só admin (adm/adm_master) e o gerente da
--    filial do caso — alterar_prioridade_caso (SECURITY DEFINER) +
--    enforce_casos_update_permissions (o vendedor dono, que tem UPDATE em
--    casos pelo prazo_vigencia, não consegue trocar a prioridade).
-- 3. Histórico: casos_prioridade_historico (de → para, quem, quando), escrito
--    por trigger na criação e em toda mudança. A auditoria já vem do
--    casos_log_auditoria (to_jsonb(old/new) de casos).
-- 4. Notificação no sino quando o grau vira 3 ou 4 (na criação ou depois):
--    gerentes ativos da filial do caso + adm/adm_master ativos (os mesmos que
--    já recebem "caso novo"); quem fez a mudança não recebe. Caso de teste
--    não notifica.
-- 5. anexos.comentario text (até 300 caracteres). Editável por quem enviou,
--    pelo gerente da filial e por admin — só essa coluna (grant de coluna),
--    com auditoria do UPDATE.
-- 6. casos_contagem_barra: a contagem da barra de Acompanhar Casos ganha o
--    filtro de prioridade (substitui casos_contagem_status).
-- 7. casos_em_aberto_inicio(p_limite): card "Casos em aberto" da página
--    inicial — as duas listas (por grau / por tempo parado) numa consulta,
--    com a quantidade de casos em aberto de cada grau.
--
-- Regras de leitura não mudam. Idempotente.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Colunas
-- ----------------------------------------------------------------------------

alter table public.casos add column if not exists prioridade smallint;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'casos_prioridade_faixa') then
    alter table public.casos add constraint casos_prioridade_faixa check (prioridade between 1 and 4);
  end if;
end
$$;

comment on column public.casos.prioridade is
  'Grau de prioridade: 1 Baixa, 2 Média, 3 Alta, 4 Urgente; NULL = Sem grau (casos anteriores). Depois de criado, só admin ou gerente da filial alteram (alterar_prioridade_caso).';

alter table public.anexos add column if not exists comentario text;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'anexos_comentario_tamanho') then
    alter table public.anexos add constraint anexos_comentario_tamanho check (char_length(comentario) <= 300);
  end if;
end
$$;

comment on column public.anexos.comentario is
  'Comentário opcional do anexo (até 300 caracteres). Editável por quem enviou, gerente da filial do caso e admin.';

-- ----------------------------------------------------------------------------
-- 2. Quem gerencia o caso (altera prioridade, edita comentário de anexo alheio)
-- ----------------------------------------------------------------------------

create or replace function public.auth_gerencia_caso(p_caso_id uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select public.auth_pode_ver_caso(p_caso_id)
    and (
      public.auth_is_admin()
      or (
        public.auth_perfil() = 'gerente'
        and exists (select 1 from public.casos c where c.id = p_caso_id and c.filial = public.auth_filial())
      )
    );
$$;

comment on function public.auth_gerencia_caso(uuid) is
  'Admin, ou gerente (ativo) da filial do caso. Usada para alterar a prioridade e editar comentário de anexo de outra pessoa.';

revoke all on function public.auth_gerencia_caso(uuid) from public, anon;
grant execute on function public.auth_gerencia_caso(uuid) to authenticated, service_role;

-- enforce_casos_update_permissions — mesma função de 20261006000008, com
-- prioridade: não-admin só muda a prioridade sozinha (nenhum outro campo
-- junto) e só se for gerente da filial do caso.
create or replace function public.enforce_casos_update_permissions()
returns trigger
language plpgsql security definer set search_path = public
as $$
declare
  v_outros_campos_iguais boolean;
begin
  if new.caso_teste is distinct from old.caso_teste and not public.auth_is_adm_master() then
    raise exception 'Alteração não permitida para este perfil neste caso.';
  end if;

  if public.auth_is_admin() then
    return new;
  end if;

  v_outros_campos_iguais := (
    new.tipo_caso is not distinct from old.tipo_caso
    and new.motivo is not distinct from old.motivo
    and new.descricao is not distinct from old.descricao
    and new.filial is not distinct from old.filial
    and new.vendedor_dono is not distinct from old.vendedor_dono
    and new.vendedor_original_nome is not distinct from old.vendedor_original_nome
    and new.criado_por is not distinct from old.criado_por
    and new.contrato_numero is not distinct from old.contrato_numero
    and new.cliente_nome is not distinct from old.cliente_nome
    and new.cliente_cpf is not distinct from old.cliente_cpf
    and new.parcelas_em_aberto is not distinct from old.parcelas_em_aberto
    and new.data_cancelamento is not distinct from old.data_cancelamento
    and new.contrato_origem is not distinct from old.contrato_origem
    and new.subtipo_recadastro is not distinct from old.subtipo_recadastro
  );

  if new.prioridade is distinct from old.prioridade then
    if v_outros_campos_iguais
      and new.status_atual is not distinct from old.status_atual
      and new.prazo_vigencia is not distinct from old.prazo_vigencia
      and new.prioridade is not null
      and public.auth_gerencia_caso(new.id)
    then
      return new;
    end if;
    raise exception 'Só o gerente da filial ou o adm alteram a prioridade do caso.';
  end if;

  if v_outros_campos_iguais
    and new.status_atual is distinct from old.status_atual
    and new.prazo_vigencia is not distinct from old.prazo_vigencia
    and (
      public.auth_can_drive_flow()
      -- Vendedor: só como efeito do insert em status_historico (sync_caso_status).
      or (pg_trigger_depth() > 1 and public.auth_pode_avancar_status(new.id))
    )
  then
    return new;
  end if;

  if v_outros_campos_iguais
    and new.prazo_vigencia is distinct from old.prazo_vigencia
    and new.status_atual is not distinct from old.status_atual
  then
    return new; -- RLS já restringe este caminho a vendedor_dono = auth.uid()
  end if;

  raise exception 'Alteração não permitida para este perfil neste caso.';
end;
$$;

create or replace function public.alterar_prioridade_caso(p_caso_id uuid, p_prioridade smallint)
returns void
language plpgsql security definer set search_path = public
as $$
begin
  if p_prioridade is null or p_prioridade not between 1 and 4 then
    raise exception 'Grau de prioridade inválido.' using errcode = '22023';
  end if;
  if not public.auth_gerencia_caso(p_caso_id) then
    raise exception 'Só o gerente da filial ou o adm alteram a prioridade do caso.' using errcode = '42501';
  end if;
  update public.casos set prioridade = p_prioridade
  where id = p_caso_id and prioridade is distinct from p_prioridade;
end;
$$;

comment on function public.alterar_prioridade_caso(uuid, smallint) is
  'Altera o grau de prioridade (1..4) de um caso já criado: só admin ou gerente da filial do caso. Histórico, auditoria e notificação vêm dos triggers de casos.';

revoke all on function public.alterar_prioridade_caso(uuid, smallint) from public, anon;
grant execute on function public.alterar_prioridade_caso(uuid, smallint) to authenticated, service_role;

-- ----------------------------------------------------------------------------
-- 3. Histórico de prioridade + 4. notificação de grau 3/4
-- ----------------------------------------------------------------------------

create table if not exists public.casos_prioridade_historico (
  id uuid primary key default gen_random_uuid(),
  caso_id uuid not null references public.casos (id) on delete cascade,
  de smallint check (de between 1 and 4),
  para smallint check (para between 1 and 4),
  alterado_por uuid not null references public.usuarios (id),
  alterado_em timestamptz not null default now()
);

create index if not exists casos_prioridade_historico_caso_idx on public.casos_prioridade_historico (caso_id, alterado_em);

comment on table public.casos_prioridade_historico is
  'Toda definição/mudança do grau de prioridade (de NULL na criação). Só escrita por trigger de casos; leitura com a visibilidade do caso.';

alter table public.casos_prioridade_historico enable row level security;

drop policy if exists casos_prioridade_historico_select on public.casos_prioridade_historico;
create policy casos_prioridade_historico_select
  on public.casos_prioridade_historico for select to authenticated
  using (public.auth_pode_ver_caso(casos_prioridade_historico.caso_id));

revoke all on public.casos_prioridade_historico from anon, authenticated;
grant select on public.casos_prioridade_historico to authenticated;
grant select, insert, update, delete on public.casos_prioridade_historico to service_role;

create or replace function public.registrar_prioridade_caso()
returns trigger
language plpgsql security definer set search_path = public
as $$
declare
  v_de smallint := case when tg_op = 'UPDATE' then old.prioridade end;
  v_autor uuid := coalesce(auth.uid(), new.criado_por);
  v_autor_nome text;
begin
  if new.prioridade is not distinct from v_de then
    return new;
  end if;

  insert into public.casos_prioridade_historico (caso_id, de, para, alterado_por)
  values (new.id, v_de, new.prioridade, v_autor);

  if new.prioridade >= 3 and not new.caso_teste then
    select u.nome_completo into v_autor_nome from public.usuarios u where u.id = v_autor;

    insert into public.notificacoes (destinatario_id, tipo, mensagem, caso_id)
    select u.id, 'prioridade_alta',
      format('Caso #%s marcado como %s por %s', new.protocolo,
        case new.prioridade when 4 then 'Urgente' else 'Alta' end,
        coalesce(v_autor_nome, new.vendedor_original_nome)),
      new.id
    from public.usuarios u
    where u.ativo
      and u.id is distinct from auth.uid()
      and (u.perfil in ('adm', 'adm_master') or (u.perfil = 'gerente' and u.filial = new.filial));
  end if;

  return new;
end;
$$;

drop trigger if exists casos_registrar_prioridade on public.casos;
create trigger casos_registrar_prioridade
  after insert or update of prioridade on public.casos
  for each row execute function public.registrar_prioridade_caso();

-- ----------------------------------------------------------------------------
-- 5. Comentário do anexo: UPDATE só da coluna, por quem pode, auditado
-- ----------------------------------------------------------------------------

grant update (comentario) on public.anexos to authenticated;

drop policy if exists anexos_update_comentario on public.anexos;
create policy anexos_update_comentario
  on public.anexos for update to authenticated
  using (
    public.auth_pode_ver_caso(anexos.caso_id)
    and (anexos.enviado_por = auth.uid() or public.auth_gerencia_caso(anexos.caso_id))
  )
  with check (
    public.auth_pode_ver_caso(anexos.caso_id)
    and (anexos.enviado_por = auth.uid() or public.auth_gerencia_caso(anexos.caso_id))
  );

-- Só o UPDATE do comentário (a purga por retenção também faz UPDATE em
-- anexos, sem usuário — não entra aqui).
drop trigger if exists anexos_log_auditoria_comentario on public.anexos;
create trigger anexos_log_auditoria_comentario
  after update of comentario on public.anexos
  for each row
  when (old.comentario is distinct from new.comentario)
  execute function public.log_auditoria();

-- ----------------------------------------------------------------------------
-- 6. Barra "Casos por status" com o filtro de prioridade
-- ----------------------------------------------------------------------------

drop function if exists public.casos_contagem_status(tipo_caso, filial_cvc, uuid, date, date, boolean, uuid[], text, date);
drop function if exists public.casos_contagem_barra(tipo_caso, filial_cvc, uuid, date, date, boolean, uuid[], text, date, smallint);

create function public.casos_contagem_barra(
  p_tipo tipo_caso default null,
  p_filial filial_cvc default null,
  p_vendedor uuid default null,
  p_data_inicio date default null,
  p_data_fim date default null,
  p_teste boolean default false,
  p_ids uuid[] default null,
  -- 'vencido' | 'vence5' (0..5 dias) | 'aberto': só não resolvidos (filtros da lista).
  p_prazo text default null,
  p_hoje date default null,
  -- 1..4 = o grau; 0 = sem grau (NULL); null = todas.
  p_prioridade smallint default null
)
returns table (status status_caso, total bigint, vencidos bigint, vencem_5 bigint)
language sql
stable
security definer
set search_path = public
as $$
  with hoje as (
    select coalesce(p_hoje, (now() at time zone 'America/Sao_Paulo')::date) as d
  ),
  eu as materialized (
    select auth.uid() as uid, public.auth_is_admin() as admin, public.auth_is_adm_master() as adm_master,
      public.auth_ativo() as ativo, public.auth_perfil() as perfil, public.auth_filial() as filial
  ),
  filtrados as (
    select c.status_atual, c.prazo_vigencia
    from public.casos c, hoje h, eu
    -- = auth_pode_ver_caso(c.id)
    where (not c.caso_teste or eu.adm_master)
      and (
        eu.admin
        or (eu.ativo and (c.vendedor_dono = eu.uid or (eu.perfil = 'gerente' and c.filial = eu.filial)))
      )
      and c.caso_teste = coalesce(p_teste, false)
      and (p_tipo is null or c.tipo_caso = p_tipo)
      and (p_filial is null or c.filial = p_filial)
      and (p_vendedor is null or c.vendedor_dono = p_vendedor)
      -- Mesmo recorte da lista: 'aaaa-mm-ddT00:00:00' / 'T23:59:59.999' no fuso da sessão.
      and (p_data_inicio is null or c.criado_em >= (p_data_inicio::text || 'T00:00:00')::timestamptz)
      and (p_data_fim is null or c.criado_em <= (p_data_fim::text || 'T23:59:59.999')::timestamptz)
      and (p_ids is null or c.id = any (p_ids))
      and (p_prazo is null
        or (p_prazo = 'vencido' and c.status_atual <> 'resolvido' and c.prazo_vigencia < h.d)
        or (p_prazo = 'vence5' and c.status_atual <> 'resolvido' and c.prazo_vigencia between h.d and h.d + 5)
        or (p_prazo = 'aberto' and c.status_atual <> 'resolvido'))
      and (p_prioridade is null
        or (p_prioridade = 0 and c.prioridade is null)
        or c.prioridade = p_prioridade)
  ),
  por_status as (
    select f.status_atual,
      count(*) as total,
      count(*) filter (where f.status_atual <> 'resolvido' and f.prazo_vigencia < h.d) as vencidos,
      count(*) filter (where f.status_atual <> 'resolvido' and f.prazo_vigencia between h.d and h.d + 5) as vencem_5
    from filtrados f, hoje h
    group by f.status_atual
  )
  select s, coalesce(p.total, 0), coalesce(p.vencidos, 0), coalesce(p.vencem_5, 0)
  from unnest(enum_range(null::status_caso)) s
  left join por_status p on p.status_atual = s;
$$;

revoke all on function public.casos_contagem_barra(tipo_caso, filial_cvc, uuid, date, date, boolean, uuid[], text, date, smallint) from public, anon;
grant execute on function public.casos_contagem_barra(tipo_caso, filial_cvc, uuid, date, date, boolean, uuid[], text, date, smallint) to authenticated, service_role;

-- ----------------------------------------------------------------------------
-- 7. Página inicial: "Casos em aberto" por grau / por tempo parado
-- ----------------------------------------------------------------------------

drop function if exists public.casos_em_aberto_inicio(integer);

create function public.casos_em_aberto_inicio(p_limite integer default 8)
returns table (
  lista text,
  id uuid,
  protocolo bigint,
  cliente_nome text,
  status_atual status_caso,
  filial filial_cvc,
  prioridade smallint,
  entrou_em timestamptz,
  total_grau bigint
)
language sql
stable
security definer
set search_path = public
as $$
  with eu as materialized (
    select auth.uid() as uid, public.auth_is_admin() as admin, public.auth_ativo() as ativo,
      public.auth_perfil() as perfil, public.auth_filial() as filial
  ),
  -- Só o necessário para ordenar; nome, status e loja vêm depois, das
  -- linhas escolhidas. Entrada na etapa atual: uma agregação de
  -- status_historico (hash join) — mais rápida que uma busca por caso
  -- quando são milhares de casos em aberto.
  abertos as materialized (
    select c.id, c.protocolo, c.prioridade, coalesce(e.entrou_em, c.criado_em) as entrou_em
    from public.casos c
    cross join eu
    left join (
      select sh.caso_id, max(sh.entrou_em) as entrou_em from public.status_historico sh group by sh.caso_id
    ) e on e.caso_id = c.id
    -- = auth_pode_ver_caso(c.id), só casos reais em aberto
    where not c.caso_teste
      and c.status_atual <> 'resolvido'
      and (
        eu.admin
        or (eu.ativo and (c.vendedor_dono = eu.uid or (eu.perfil = 'gerente' and c.filial = eu.filial)))
      )
  ),
  por_grau as (
    select a.prioridade, count(*) as n from abertos a group by a.prioridade
  ),
  -- Top-N primeiro; a quantidade do grau entra só nas linhas escolhidas.
  top_grau as (
    select a.*, row_number() over (order by a.prioridade desc nulls last, a.entrou_em, a.protocolo) as ordem
    from (
      select * from abertos a
      order by a.prioridade desc nulls last, a.entrou_em, a.protocolo
      limit p_limite
    ) a
  ),
  top_parado as (
    select a.*, row_number() over (order by a.entrou_em, a.protocolo) as ordem
    from (
      select * from abertos a
      order by a.entrou_em, a.protocolo
      limit p_limite
    ) a
  )
  select l.lista, l.id, l.protocolo, c.cliente_nome, c.status_atual, c.filial, l.prioridade, l.entrou_em, coalesce(g.n, 0)
  from (
    select 'grau' as lista, 1 as bloco, t.* from top_grau t
    union all
    select 'parado', 2, t.* from top_parado t
  ) l
  join public.casos c on c.id = l.id
  left join por_grau g on g.prioridade is not distinct from l.prioridade
  order by l.bloco, l.ordem;
$$;

comment on function public.casos_em_aberto_inicio(integer) is
  'Card "Casos em aberto" da página inicial: lista=grau (Urgente→Sem grau, mais parado primeiro) e lista=parado (mais parado primeiro), p_limite de cada, com total_grau = casos em aberto do mesmo grau. Mesma visibilidade de auth_pode_ver_caso, só casos reais.';

revoke all on function public.casos_em_aberto_inicio(integer) from public, anon;
grant execute on function public.casos_em_aberto_inicio(integer) to authenticated, service_role;

-- ----------------------------------------------------------------------------
-- nomes_usuarios_casos — mesma função de 20261005000001, agora também com
-- quem definiu/alterou a prioridade (histórico na tela do caso).
-- ----------------------------------------------------------------------------

create or replace function public.nomes_usuarios_casos(p_caso_ids uuid[])
returns table (id uuid, nome_completo text)
language sql stable security definer set search_path = public
as $$
  with casos_visiveis as (
    select c.id, c.criado_por, c.vendedor_dono
    from public.casos c
    where c.id = any (p_caso_ids)
      and public.auth_pode_ver_caso(c.id)
  ),
  participantes as (
    select cv.criado_por as usuario_id from casos_visiveis cv
    union
    select cv.vendedor_dono from casos_visiveis cv
    union
    select sh.alterado_por
    from public.status_historico sh
    join casos_visiveis cv on cv.id = sh.caso_id
    union
    select cc.criado_por
    from public.casos_complementos cc
    join casos_visiveis cv on cv.id = cc.caso_id
    union
    select ph.alterado_por
    from public.casos_prioridade_historico ph
    join casos_visiveis cv on cv.id = ph.caso_id
  )
  select u.id, u.nome_completo
  from public.usuarios u
  join participantes p on p.usuario_id = u.id;
$$;
