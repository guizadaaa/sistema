-- ============================================================================
-- Sistema de Gestão de Casos Operacionais — CVC
-- Migration: centraliza a regra de "quem enxerga este caso" (M1 da auditoria)
--
-- Causa-raiz por trás dos dois vazamentos corrigidos em
-- 20260722000002 (casos_contratos_adicionais) e 20260722000003
-- (desfechos_visivel): a expressão
--   auth_is_admin() or (auth_ativo() and (vendedor_dono = auth.uid()
--     or (auth_perfil() = 'gerente' and filial = auth_filial())))
-- estava copiada à mão em ~15 lugares (policies de casos, status_historico,
-- implicacoes, anexos x2, storage.objects x2, 4 versões da view
-- desfechos_visivel, 2 policies de casos_contratos_adicionais, e dentro de
-- log_anexo_signed_url). Não existia um único lugar para corrigir — por
-- isso a correção de 20260720000002 não se propagou para tudo que foi
-- criado depois dela.
--
-- Esta migration não muda nenhuma regra de negócio (todos os lugares
-- migrados já usam exatamente este predicado desde as correções de C1/C2) —
-- só substitui as cópias por uma função única, para que a próxima migration
-- que precisar dessa regra chame a função em vez de copiar a expressão nova.
--
-- Fora do escopo (regras diferentes, não cópias deste bug — não tocadas):
--   - status_historico_insert / implicacoes_insert / implicacoes_update /
--     registrar_correcao_desfecho / cancelar_desfecho: "admin ou gerente
--     com delegação ativa" (quem CONDUZ o fluxo, não quem só enxerga).
--   - desfechos_select (a policy da tabela crua, hoje sem efeito prático
--     para authenticated — SELECT revogado): "só dono do caso ou admin",
--     mais restrita de propósito (gerente lê só pela view mascarada).
--   - O CASE WHEN de mascaramento de banco_* dentro de desfechos_visivel:
--     "só dono do caso ou admin", também mais restrita de propósito.
-- ============================================================================

create function public.auth_pode_ver_caso(p_caso_id uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.casos c
    where c.id = p_caso_id
      and (
        public.auth_is_admin()
        or (
          public.auth_ativo()
          and (c.vendedor_dono = auth.uid() or (public.auth_perfil() = 'gerente' and c.filial = public.auth_filial()))
        )
      )
  );
$$;

comment on function public.auth_pode_ver_caso(uuid) is
  'Única fonte de verdade para "este usuário enxerga o caso p_caso_id?" (admin; dono; ou gerente da própria filial). Usada por toda policy/view/função que precisar dessa regra — nunca copiar a expressão de novo (ver M1, auditoria de 22/07).';

-- ----------------------------------------------------------------------------
-- casos
-- ----------------------------------------------------------------------------

drop policy if exists casos_select on public.casos;
create policy casos_select
  on public.casos for select to authenticated
  using (public.auth_pode_ver_caso(id));

-- ----------------------------------------------------------------------------
-- status_historico
-- ----------------------------------------------------------------------------

drop policy if exists status_historico_select on public.status_historico;
create policy status_historico_select
  on public.status_historico for select to authenticated
  using (public.auth_pode_ver_caso(status_historico.caso_id));

-- ----------------------------------------------------------------------------
-- implicacoes
-- ----------------------------------------------------------------------------

drop policy if exists implicacoes_select on public.implicacoes;
create policy implicacoes_select
  on public.implicacoes for select to authenticated
  using (public.auth_pode_ver_caso(implicacoes.caso_id));

-- ----------------------------------------------------------------------------
-- anexos
-- ----------------------------------------------------------------------------

drop policy if exists anexos_select on public.anexos;
create policy anexos_select
  on public.anexos for select to authenticated
  using (public.auth_pode_ver_caso(anexos.caso_id));

drop policy if exists anexos_insert on public.anexos;
create policy anexos_insert
  on public.anexos for insert to authenticated
  with check (public.auth_pode_ver_caso(anexos.caso_id));

-- ----------------------------------------------------------------------------
-- casos_contratos_adicionais
-- ----------------------------------------------------------------------------

drop policy if exists casos_contratos_adicionais_select on public.casos_contratos_adicionais;
create policy casos_contratos_adicionais_select
  on public.casos_contratos_adicionais for select to authenticated
  using (public.auth_pode_ver_caso(casos_contratos_adicionais.caso_id));

drop policy if exists casos_contratos_adicionais_insert on public.casos_contratos_adicionais;
create policy casos_contratos_adicionais_insert
  on public.casos_contratos_adicionais for insert to authenticated
  with check (public.auth_pode_ver_caso(casos_contratos_adicionais.caso_id));

-- ----------------------------------------------------------------------------
-- storage.objects (bucket "anexos")
-- ----------------------------------------------------------------------------

drop policy if exists storage_anexos_select on storage.objects;
create policy storage_anexos_select
  on storage.objects for select to authenticated
  using (
    bucket_id = 'anexos'
    and public.auth_pode_ver_caso(((storage.foldername(name))[1])::uuid)
  );

drop policy if exists storage_anexos_insert on storage.objects;
create policy storage_anexos_insert
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'anexos'
    and public.auth_pode_ver_caso(((storage.foldername(name))[1])::uuid)
  );

-- ----------------------------------------------------------------------------
-- log_anexo_signed_url — mesma checagem de visibilidade, via a função.
-- ----------------------------------------------------------------------------

create or replace function public.log_anexo_signed_url(p_anexo_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_visivel boolean;
begin
  select exists (
    select 1 from public.anexos a
    where a.id = p_anexo_id and public.auth_pode_ver_caso(a.caso_id)
  ) into v_visivel;

  if not v_visivel then
    raise exception 'Anexo não encontrado ou sem permissão de acesso';
  end if;

  insert into public.auditoria (tabela, registro_id, acao, realizado_por)
  values ('anexos', p_anexo_id, 'download_signed_url', auth.uid());
end;
$$;

-- ----------------------------------------------------------------------------
-- desfechos_visivel — só o filtro de linha migra para a função; o
-- mascaramento de banco_* continua com sua regra própria (dono/admin, sem
-- gerente), inalterado.
-- ----------------------------------------------------------------------------

create or replace view public.desfechos_visivel as
select
  d.id,
  d.caso_id,
  d.tipo,
  d.subtipo_reembolso,
  d.origem_reembolso_integral,
  case when public.auth_is_admin() or c.vendedor_dono = auth.uid()
    then d.banco_codigo else null end as banco_codigo,
  case when public.auth_is_admin() or c.vendedor_dono = auth.uid()
    then d.banco_nome_completo else null end as banco_nome_completo,
  case when public.auth_is_admin() or c.vendedor_dono = auth.uid()
    then d.banco_agencia else null end as banco_agencia,
  case when public.auth_is_admin() or c.vendedor_dono = auth.uid()
    then d.banco_conta else null end as banco_conta,
  case when public.auth_is_admin() or c.vendedor_dono = auth.uid()
    then d.banco_cpf else null end as banco_cpf,
  d.valor,
  d.subtipo_remarcacao,
  d.valor_taxas,
  d.valor_diferenca_tarifaria,
  d.criado_por,
  d.criado_em,
  d.origem_remarcacao_com_custo,
  d.substituido_por,
  d.substituido_em,
  d.cancelado_em
from public.desfechos d
join public.casos c on c.id = d.caso_id
where public.auth_pode_ver_caso(d.caso_id);

comment on view public.desfechos_visivel is
  'Única via de leitura de desfechos para o client (SELECT na tabela crua é revogado de authenticated). Mascara banco_* para quem não é dono do caso nem admin; visibilidade da linha via auth_pode_ver_caso (dono, admin, ou gerente da própria filial).';
