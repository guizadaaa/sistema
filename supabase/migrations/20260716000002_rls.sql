-- ============================================================================
-- Sistema de Gestão de Casos Operacionais — CVC
-- Migration 2: helper functions + Row-Level Security policies
--
-- Leitura confirmada com o cliente (não é mais uma suposição em aberto):
--   - Fora de delegação ativa, vendedor e gerente NÃO avançam o status
--     (Recepcionado→Resolvido é sempre adm/adm_master, ou gerente com
--     delegação ativa restrito à própria filial). A frase da seção 2
--     ("vê e altera status") é o resumo geral, refinado pelas seções 5 e 8.
--   - O desfecho é registrado por quem resolve o caso (mesma regra acima).
-- ============================================================================

-- ----------------------------------------------------------------------------
-- HELPER FUNCTIONS (security definer, search_path fixo — evita recursão de
-- RLS e hijacking de search_path)
-- ----------------------------------------------------------------------------

create function public.auth_ativo()
returns boolean
language sql stable security definer set search_path = public
as $$
  select coalesce((select ativo from public.usuarios where id = auth.uid()), false);
$$;

create function public.auth_perfil()
returns perfil_usuario
language sql stable security definer set search_path = public
as $$
  select perfil from public.usuarios where id = auth.uid() and ativo;
$$;

create function public.auth_filial()
returns filial_cvc
language sql stable security definer set search_path = public
as $$
  select filial from public.usuarios where id = auth.uid() and ativo;
$$;

create function public.usuario_filial(p_id uuid)
returns filial_cvc
language sql stable security definer set search_path = public
as $$
  select filial from public.usuarios where id = p_id;
$$;

create function public.auth_is_admin()
returns boolean
language sql stable
as $$
  select public.auth_perfil() in ('adm', 'adm_master');
$$;

create function public.auth_is_adm_master()
returns boolean
language sql stable
as $$
  select public.auth_perfil() = 'adm_master';
$$;

-- Delegação vigente para o gerente autenticado (modo férias do adm — seção 8).
create function public.auth_has_delegacao_ativa()
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.delegacoes d
    where d.gerente_id = auth.uid()
      and d.ativa
      and now() >= d.inicio
      and (d.fim is null or now() <= d.fim)
  ) and public.auth_ativo();
$$;

-- Quem pode conduzir o fluxo adm (Recepcionado→Resolvido) e lançar multas.
create function public.auth_can_drive_flow()
returns boolean
language sql stable
as $$
  select public.auth_is_admin() or public.auth_has_delegacao_ativa();
$$;

-- ----------------------------------------------------------------------------
-- USUARIOS
-- ----------------------------------------------------------------------------

alter table public.usuarios enable row level security;

create policy usuarios_select_self
  on public.usuarios for select to authenticated
  using (id = auth.uid());

create policy usuarios_select_filial_gerente
  on public.usuarios for select to authenticated
  using (public.auth_perfil() = 'gerente' and filial = public.auth_filial());

create policy usuarios_select_admin
  on public.usuarios for select to authenticated
  using (public.auth_is_admin());

-- INSERT/DELETE: nenhuma policy — usuários só são criados via trigger
-- (auth.users) e exclusão é sempre lógica (ativo=false via UPDATE abaixo).
create policy usuarios_update_adm_master
  on public.usuarios for update to authenticated
  using (public.auth_is_adm_master())
  with check (public.auth_is_adm_master());

-- ----------------------------------------------------------------------------
-- CASOS
-- ----------------------------------------------------------------------------

alter table public.casos enable row level security;

create policy casos_select
  on public.casos for select to authenticated
  using (
    public.auth_is_admin()
    or (public.auth_ativo() and (vendedor_dono = auth.uid() or filial = public.auth_filial()))
  );

create policy casos_insert
  on public.casos for insert to authenticated
  with check (
    criado_por = auth.uid()
    and public.auth_ativo()
    and (
      public.auth_is_admin()
      or vendedor_dono = auth.uid()
      or (public.auth_perfil() = 'gerente' and public.usuario_filial(vendedor_dono) = public.auth_filial())
    )
  );

create policy casos_update
  on public.casos for update to authenticated
  using (public.auth_is_admin() or vendedor_dono = auth.uid())
  with check (public.auth_is_admin() or vendedor_dono = auth.uid());

-- Fora do perfil admin, só prazo_vigencia pode mudar (decisão confirmada #5:
-- editável apenas pelo vendedor dono; gerente e adm não editam esse campo
-- diretamente aqui — admin usa esta mesma policy para reatribuições/correções
-- administrativas, então o bypass completo para admin é intencional).
-- Dois caminhos legítimos de escrita não-admin em casos:
--   (a) status_atual muda sozinho — efeito colateral (trigger sync_caso_status)
--       de uma inserção em status_historico feita por quem pode conduzir o
--       fluxo (admin ou gerente delegado);
--   (b) prazo_vigencia muda sozinho — vendedor dono editando o prazo.
-- Qualquer outra combinação de colunas alteradas é rejeitada para não-admin.
create function public.enforce_casos_update_permissions()
returns trigger
language plpgsql security definer set search_path = public
as $$
declare
  v_outros_campos_iguais boolean;
begin
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
    and new.elegivel_ouvidoria is not distinct from old.elegivel_ouvidoria
    and new.contrato_numero is not distinct from old.contrato_numero
    and new.cliente_nome is not distinct from old.cliente_nome
    and new.cliente_cpf is not distinct from old.cliente_cpf
    and new.parcelas_em_aberto is not distinct from old.parcelas_em_aberto
    and new.data_cancelamento is not distinct from old.data_cancelamento
  );

  if v_outros_campos_iguais
    and new.status_atual is distinct from old.status_atual
    and new.prazo_vigencia is not distinct from old.prazo_vigencia
    and public.auth_can_drive_flow()
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

create trigger casos_enforce_update_permissions
  before update on public.casos
  for each row execute function public.enforce_casos_update_permissions();

-- Sem DELETE: casos nunca são apagados fisicamente.

-- ----------------------------------------------------------------------------
-- STATUS_HISTORICO (linha do tempo — append-only, sem UPDATE/DELETE)
-- ----------------------------------------------------------------------------

alter table public.status_historico enable row level security;

create policy status_historico_select
  on public.status_historico for select to authenticated
  using (
    exists (
      select 1 from public.casos c
      where c.id = status_historico.caso_id
        and (
          public.auth_is_admin()
          or (public.auth_ativo() and (c.vendedor_dono = auth.uid() or c.filial = public.auth_filial()))
        )
    )
  );

-- alterado_por e via_delegacao nunca vêm do cliente em transições manuais:
-- sempre computados aqui. O item 'inicial' é exceção — vem só do trigger de
-- criação do caso (insert_status_inicial, contexto confiável/sem JWT em
-- chamadas via service role), então preservamos os valores que ele já define
-- em vez de sobrescrever com auth.uid() (que seria NULL nesse contexto).
create function public.set_status_historico_audit()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  if new.status <> 'inicial' then
    new.alterado_por := auth.uid();
    new.via_delegacao := (not public.auth_is_admin());
  end if;
  return new;
end;
$$;

create trigger status_historico_set_audit
  before insert on public.status_historico
  for each row execute function public.set_status_historico_audit();

-- Inicial só entra via trigger de criação do caso (insert_status_inicial),
-- que roda como owner da função e não passa pela policy de authenticated.
-- Transições manuais (Recepcionado→Resolvido) exigem admin ou gerente com
-- delegação ativa na própria filial; Ouvidoria é exclusiva do admin e só
-- nos casos marcados elegivel_ouvidoria.
create policy status_historico_insert
  on public.status_historico for insert to authenticated
  with check (
    status <> 'inicial'
    and exists (
      select 1 from public.casos c
      where c.id = status_historico.caso_id
        and (
          public.auth_is_admin()
          or (c.filial = public.auth_filial() and public.auth_has_delegacao_ativa())
        )
    )
    and (
      status <> 'ouvidoria'
      or (
        public.auth_is_admin()
        and exists (select 1 from public.casos c2 where c2.id = status_historico.caso_id and c2.elegivel_ouvidoria)
      )
    )
  );

-- ----------------------------------------------------------------------------
-- DESFECHOS
-- ----------------------------------------------------------------------------

alter table public.desfechos enable row level security;

create policy desfechos_select
  on public.desfechos for select to authenticated
  using (
    exists (
      select 1 from public.casos c
      where c.id = desfechos.caso_id
        and (
          public.auth_is_admin()
          or (public.auth_ativo() and (c.vendedor_dono = auth.uid() or c.filial = public.auth_filial()))
        )
    )
  );

create function public.set_desfechos_criado_por()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  new.criado_por := auth.uid();
  return new;
end;
$$;

create trigger desfechos_set_criado_por
  before insert on public.desfechos
  for each row execute function public.set_desfechos_criado_por();

-- Quem registra o desfecho é quem resolve o caso: admin ou gerente com
-- delegação ativa na própria filial (mesma regra de status_historico).
create policy desfechos_insert
  on public.desfechos for insert to authenticated
  with check (
    exists (
      select 1 from public.casos c
      where c.id = desfechos.caso_id
        and (
          public.auth_is_admin()
          or (c.filial = public.auth_filial() and public.auth_has_delegacao_ativa())
        )
    )
  );

-- Sem UPDATE/DELETE: desfecho é um registro do que foi decidido ao resolver
-- o caso; correções após o fato não são cobertas pela especificação atual.

-- ----------------------------------------------------------------------------
-- IMPLICACOES (financeiro)
-- ----------------------------------------------------------------------------

alter table public.implicacoes enable row level security;

create policy implicacoes_select
  on public.implicacoes for select to authenticated
  using (
    exists (
      select 1 from public.casos c
      where c.id = implicacoes.caso_id
        and (
          public.auth_is_admin()
          or (public.auth_ativo() and (c.vendedor_dono = auth.uid() or c.filial = public.auth_filial()))
        )
    )
  );

create function public.set_implicacoes_criado_por()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  new.criado_por := auth.uid();
  return new;
end;
$$;

create trigger implicacoes_set_criado_por
  before insert on public.implicacoes
  for each row execute function public.set_implicacoes_criado_por();

create policy implicacoes_insert
  on public.implicacoes for insert to authenticated
  with check (
    exists (
      select 1 from public.casos c
      where c.id = implicacoes.caso_id
        and (
          public.auth_is_admin()
          or (c.filial = public.auth_filial() and public.auth_has_delegacao_ativa())
        )
    )
  );

-- Correções de valores depois de lançado: mesma elegibilidade do insert.
create policy implicacoes_update
  on public.implicacoes for update to authenticated
  using (
    exists (
      select 1 from public.casos c
      where c.id = implicacoes.caso_id
        and (
          public.auth_is_admin()
          or (c.filial = public.auth_filial() and public.auth_has_delegacao_ativa())
        )
    )
  )
  with check (
    exists (
      select 1 from public.casos c
      where c.id = implicacoes.caso_id
        and (
          public.auth_is_admin()
          or (c.filial = public.auth_filial() and public.auth_has_delegacao_ativa())
        )
    )
  );

-- ----------------------------------------------------------------------------
-- ANEXOS (a tabela; políticas do Storage Bucket ficam numa migration à parte)
-- ----------------------------------------------------------------------------

alter table public.anexos enable row level security;

create policy anexos_select
  on public.anexos for select to authenticated
  using (
    exists (
      select 1 from public.casos c
      where c.id = anexos.caso_id
        and (
          public.auth_is_admin()
          or (public.auth_ativo() and (c.vendedor_dono = auth.uid() or c.filial = public.auth_filial()))
        )
    )
  );

create function public.set_anexos_enviado_por()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  new.enviado_por := auth.uid();
  return new;
end;
$$;

create trigger anexos_set_enviado_por
  before insert on public.anexos
  for each row execute function public.set_anexos_enviado_por();

-- Upload é liberado para qualquer perfil que já enxerga o caso (não exige
-- delegação — anexar documento não é uma ação exclusiva do fluxo adm).
create policy anexos_insert
  on public.anexos for insert to authenticated
  with check (
    exists (
      select 1 from public.casos c
      where c.id = anexos.caso_id
        and (
          public.auth_is_admin()
          or (public.auth_ativo() and (c.vendedor_dono = auth.uid() or c.filial = public.auth_filial()))
        )
    )
  );

-- Sem DELETE por ora (ver nota LGPD §12 sobre retenção mínima — item em
-- aberto para decisão futura, não bloqueia o lançamento).

-- ----------------------------------------------------------------------------
-- DELEGACOES (modo férias — só adm_master administra; gerente vê a própria)
-- ----------------------------------------------------------------------------

alter table public.delegacoes enable row level security;

create policy delegacoes_select
  on public.delegacoes for select to authenticated
  using (public.auth_is_adm_master() or gerente_id = auth.uid());

create policy delegacoes_insert
  on public.delegacoes for insert to authenticated
  with check (public.auth_is_adm_master());

create policy delegacoes_update
  on public.delegacoes for update to authenticated
  using (public.auth_is_adm_master())
  with check (public.auth_is_adm_master());

-- Sem DELETE: encerrar é sempre via UPDATE (ativa=false), preservando o
-- histórico de delegações para auditoria.
