-- ============================================================================
-- Sistema de Gestão de Casos Operacionais — CVC
-- Migration: novo tipo de desfecho "Recadastro" (1/2 — só o valor do enum)
--
-- Recadastro não carrega nenhum dado adicional (sem valor, sem dados
-- bancários, sem subtipo) — só marca que o caso foi resolvido recadastrando
-- o produto/reserva. Mesmo padrão de carta_credito/remarcacao: um valor de
-- enum novo em tipo_desfecho + um branch na constraint
-- desfechos_campos_por_tipo exigindo todas as colunas específicas de outros
-- tipos como null.
--
-- Separada em duas migrations de propósito: ALTER TYPE ... ADD VALUE não
-- pode ter o valor novo referenciado dentro da MESMA transação em que foi
-- adicionado (SQLSTATE 55P04 "unsafe use of new value") — e cada migration
-- roda em uma transação implícita própria. A constraint que referencia
-- 'recadastro' fica na migration seguinte (20260727000002), já numa
-- transação separada, depois que este ADD VALUE já commitou.
-- ============================================================================

alter type tipo_desfecho add value 'recadastro';
