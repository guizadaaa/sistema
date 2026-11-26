-- ============================================================================
-- Categorias de anexo dos sistemas: FastZap, Orbium, Systur e Atlas.
--
-- Só os `add value`, sozinhos nesta migration: valor novo de enum não pode
-- ser USADO na mesma transação em que é criado (se o deploy rodar as
-- migrations numa transação só, qualquer uso fica para uma migration
-- seguinte). Anexos já gravados não mudam. As categorias novas nunca contam
-- como documento exigido pelo desfecho de saúde/óbito
-- (anexoObrigatorioFaltando aceita só atestado_saude / certidao_obito).
--
-- Idempotente.
-- ============================================================================

alter type tipo_documento_anexo add value if not exists 'fastzap';
alter type tipo_documento_anexo add value if not exists 'orbium';
alter type tipo_documento_anexo add value if not exists 'systur';
alter type tipo_documento_anexo add value if not exists 'atlas';
