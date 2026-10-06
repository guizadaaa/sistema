-- ============================================================================
-- Sistema de Gestão de Casos Operacionais — CVC
-- Migration: imagens coladas na Descrição ao criar um caso
--
-- As specs antigas citavam uma tabela casos_descricao_imagens, que não
-- existe em nenhuma migration nem no histórico do git. Em vez de recriar
-- uma tabela paralela (que teria de duplicar RLS, policies de Storage,
-- auditoria e a purga de retenção LGPD §12), a imagem colada vira um ANEXO
-- com tipo_documento próprio. Com isso ela herda, sem cópia nenhuma:
--   - RLS de anexos (anexos_select/_insert → quem enxerga o caso);
--   - policies do bucket "anexos" (path "<caso_id>/...");
--   - trigger de auditoria de anexos;
--   - purgar_anexos_retencao_vencida (90 dias após Resolvido — a função
--     seleciona todo anexo, sem filtrar tipo_documento).
-- O app só separa na exibição: imagem_descricao aparece abaixo da
-- Descrição, fora da lista de Anexos, e nunca conta como documento exigido
-- por desfecho (anexoObrigatorioFaltando só aceita os tipos documentais).
-- ============================================================================

alter type tipo_documento_anexo add value if not exists 'imagem_descricao';
