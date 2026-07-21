-- ============================================================================
-- Sistema de Gestão de Casos Operacionais — CVC
-- Migration: corrige checagem de sobreposição em delegacoes p/ agendamento
--
-- validate_delegacao() (20260716000001_schema.sql) bloqueava qualquer nova
-- delegação para um gerente que já tivesse uma linha ativa=true com fim nulo
-- ou no futuro, comparando contra now() — sem olhar para o inicio da nova
-- linha. Isso nunca deu problema porque toda delegação até agora começava
-- imediatamente; ao permitir inicio futuro (agendamento com antecedência),
-- vira um falso bloqueio: duas delegações agendadas para o mesmo gerente em
-- períodos que não se sobrepõem de verdade (ex.: agosto e depois setembro)
-- eram rejeitadas só porque a primeira "ainda não morreu" segundo now().
--
-- Troca o predicado por uma checagem de sobreposição de intervalo real:
-- [d.inicio, d.fim) e [new.inicio, new.fim) se sobrepõem sse
-- d.inicio < coalesce(new.fim, infinity) and new.inicio < coalesce(d.fim, infinity).
-- ============================================================================

create or replace function public.validate_delegacao()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_perfil_adm perfil_usuario;
  v_perfil_gerente perfil_usuario;
begin
  select perfil into v_perfil_adm from public.usuarios where id = new.adm_id;
  select perfil into v_perfil_gerente from public.usuarios where id = new.gerente_id;

  if v_perfil_adm <> 'adm_master' then
    raise exception 'delegacoes.adm_id deve ser um adm_master';
  end if;

  if v_perfil_gerente <> 'gerente' then
    raise exception 'delegacoes.gerente_id deve ser um gerente';
  end if;

  if new.ativa and exists (
    select 1 from public.delegacoes d
    where d.gerente_id = new.gerente_id
      and d.id is distinct from new.id
      and d.ativa
      and d.inicio < coalesce(new.fim, 'infinity'::timestamptz)
      and new.inicio < coalesce(d.fim, 'infinity'::timestamptz)
  ) then
    raise exception 'Já existe uma delegação vigente ou agendada que se sobrepõe a este período para este gerente';
  end if;

  return new;
end;
$$;
