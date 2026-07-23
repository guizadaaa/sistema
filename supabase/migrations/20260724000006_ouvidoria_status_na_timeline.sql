-- ============================================================================
-- Sistema de Gestão de Casos Operacionais — CVC
-- Migration: Ouvidoria vira um status normal na timeline, não um flag à parte
--
-- Antes: Ouvidoria só era alcançável DEPOIS de "Resolvido" (reabertura),
-- exigia marcar `elegivel_ouvidoria=true` num botão separado, e só admin
-- podia de fato inserir o status (mesmo com o flag marcado).
--
-- Agora: Ouvidoria é um desvio opcional a partir de "Em andamento interno",
-- no mesmo nível de "Reavaliação" — Em andamento interno → Ouvidoria →
-- Resolvido, oferecido no mesmo dropdown "Avançar status" (ver
-- src/lib/casos/status.ts). Continua exclusivo do admin (decisão explícita:
-- gerente com delegação não ganha essa permissão só porque o fluxo mudou de
-- lugar) — só que agora sem depender de nenhum flag: a policy abaixo checa
-- só `auth_is_admin()`, sem o "elegivel_ouvidoria" que deixa de existir.
--
-- A coluna `elegivel_ouvidoria` é removida (não há caminho de dado a
-- preservar: o novo modelo não tem equivalente para "caso resolvido
-- marcado para uma futura reabertura via Ouvidoria" — confirmado que não
-- há casos assim em produção antes de aplicar esta migration).
-- ============================================================================

drop policy status_historico_insert on public.status_historico;

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
    and (status <> 'ouvidoria' or public.auth_is_admin())
  );

-- Mesma lógica de enforce_casos_update_permissions, só removendo a checagem
-- da coluna que deixa de existir logo abaixo.
create or replace function public.enforce_casos_update_permissions()
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

alter table public.casos drop column elegivel_ouvidoria;
