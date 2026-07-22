-- ============================================================================
-- Sistema de Gestão de Casos Operacionais — CVC
-- Migration: auditoria de public.casos (LGPD §12 — dado sensível cliente_cpf)
--
-- implicacoes e desfechos já são auditados (20260717000001_auditoria.sql,
-- estendido em 20260722000001) pelo trigger genérico log_auditoria() —
-- grava dados_antigos/dados_novos (to_jsonb(old)/to_jsonb(new)) e quem/quando
-- em public.auditoria. public.casos nunca teve esse trigger, apesar de
-- guardar cliente_cpf (dado sensível, LGPD art. 5º, II) e de casos_update
-- permitir que admin altere qualquer coluna livremente
-- (enforce_casos_update_permissions retorna cedo para auth_is_admin(), sem
-- restringir quais colunas mudam — só o caminho não-admin é restrito a
-- status_atual/prazo_vigencia). Sem este trigger, uma correção (ou erro) de
-- CPF/contrato/dono feita por um admin direto na tabela não deixava rastro.
--
-- Mesmo padrão já usado em implicacoes/desfechos/usuarios — after insert or
-- update, reaproveitando a função log_auditoria() existente, sem trigger
-- novo. INSERT também é auditado (não só UPDATE) para manter o mesmo
-- comportamento das outras tabelas — dados_antigos fica null nesse caso,
-- dados_novos é o snapshot completo do caso criado.
-- ============================================================================

create trigger casos_log_auditoria
  after insert or update on public.casos
  for each row execute function public.log_auditoria();
