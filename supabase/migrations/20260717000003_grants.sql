-- ============================================================================
-- Sistema de Gestão de Casos Operacionais — CVC
-- Migration: privilégios base de tabela para authenticated/service_role
--
-- As migrations anteriores criam tabelas e políticas de RLS, mas nunca
-- concedem os GRANTs de objeto que o PostgREST exige antes mesmo de avaliar
-- RLS (normalmente o Supabase provisiona isso via ALTER DEFAULT PRIVILEGES na
-- criação do projeto; neste projeto isso não estava em vigor — confirmado por
-- "permission denied for table casos" mesmo com a service_role key, que faz
-- bypass de RLS mas ainda precisa do GRANT de objeto).
--
-- anon fica de fora deliberadamente: nenhuma policy de RLS é `to anon` — o
-- app exige login para qualquer acesso a estas tabelas.
--
-- public.desfechos fica fora do GRANT SELECT para authenticated de propósito:
-- a migration 20260717000002 revoga esse privilégio especificamente para
-- forçar a leitura só pela view public.desfechos_visivel (mascara banco_*).
-- Reconceder aqui desfaria aquela mascara. service_role recebe SELECT na
-- tabela crua normalmente (bypassa RLS/mascara para uso administrativo).
-- ============================================================================

grant usage on schema public to authenticated, service_role;

grant select, update
  on public.usuarios
  to authenticated;

grant select, insert, update
  on public.casos
  to authenticated;

grant select, insert
  on public.status_historico
  to authenticated;

grant insert
  on public.desfechos
  to authenticated;

grant select, insert, update
  on public.implicacoes
  to authenticated;

grant select, insert
  on public.anexos
  to authenticated;

grant select, insert, update
  on public.delegacoes
  to authenticated;

grant select
  on public.status_historico_com_duracao, public.desfechos_visivel
  to authenticated;

grant select, insert, update, delete
  on public.usuarios, public.casos, public.status_historico,
     public.desfechos, public.implicacoes, public.anexos, public.delegacoes
  to service_role;

grant select
  on public.status_historico_com_duracao, public.desfechos_visivel
  to service_role;

grant usage, select on all sequences in schema public to authenticated, service_role;

alter default privileges in schema public
  grant usage, select on sequences to authenticated, service_role;
