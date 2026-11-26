-- ============================================================================
-- Anexos de caso em HTML (página salva, ex.: tela de erro do Systur)
--
-- O bucket "anexos" passa a aceitar text/html, além dos 4 tipos de
-- 20261105000001. O HTML é limpo no servidor antes de gravar (sem script e
-- sem cookie/sessão — src/lib/casos/html-anexo.ts) e só é mostrado num
-- visualizador isolado (iframe sandbox + CSP), nunca pela URL do Storage.
-- Acesso, auditoria, exclusão, retenção e backup: os mesmos dos outros
-- anexos (nada muda nas policies).
--
-- Idempotente.
-- ============================================================================

update storage.buckets
set allowed_mime_types = array['application/pdf', 'image/jpeg', 'image/png', 'image/webp', 'text/html']
where id = 'anexos';
