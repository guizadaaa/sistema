-- ============================================================================
-- Sistema de Gestão de Casos Operacionais — CVC
-- Migration: SELECT em vendas_importadas para admin (já aplicada à mão)
--
-- Registra no repositório o SQL que já foi rodado manualmente no SQL Editor
-- de produção. A importação de vendas falhava com "permission denied for
-- table vendas_importadas" (42501): o upsert com ON CONFLICT DO UPDATE
-- precisa de SELECT na tabela (GRANT) e de uma policy de SELECT, e a
-- migration original (20260727000005) só dava INSERT/UPDATE.
--
-- Idempotente: GRANT repetido não falha e a policy é recriada com
-- "drop policy if exists" — rodar de novo em produção não muda nada.
-- Leitura continua restrita a admin (auth_is_admin), os mesmos perfis que
-- já gravam; os demais seguem lendo pela view vendas_com_vendedor.
-- ============================================================================

grant select on public.vendas_importadas to authenticated;

drop policy if exists vendas_importadas_select on public.vendas_importadas;
create policy vendas_importadas_select
  on public.vendas_importadas
  for select
  to authenticated
  using (public.auth_is_admin());
