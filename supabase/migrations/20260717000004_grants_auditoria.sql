-- ============================================================================
-- Sistema de Gestão de Casos Operacionais — CVC
-- Migration: grant faltante em public.auditoria
--
-- 20260717000003_grants.sql cobriu as 7 tabelas da migration inicial, mas
-- esqueceu public.auditoria (criada em 20260717000001_auditoria.sql) — sem
-- isso nem service_role conseguia ler/gerenciar a tabela (auditoria_select_adm_master
-- é a única policy de SELECT, restrita a adm_master; não há policy de
-- INSERT/UPDATE/DELETE para authenticated — escrita é só via trigger/RPC
-- SECURITY DEFINER, que não depende de GRANT na tabela).
-- ============================================================================

grant select
  on public.auditoria
  to authenticated;

grant select, insert, update, delete
  on public.auditoria
  to service_role;
