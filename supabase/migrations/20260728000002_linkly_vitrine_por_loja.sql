-- ============================================================================
-- Sistema de Gestão de Casos Operacionais — CVC
-- Migration: vitrine por loja (correção de desenho)
--
-- Desenho original (20260728000001) assumia um único QR de vitrine comum às
-- 3 lojas. Na prática são 3 links de vitrine DISTINTOS — um por loja, cada
-- um levando ao grupo de WhatsApp de ofertas daquela loja específica — todos
-- sob o mesmo workspace/conta Linkly (linkly_api_key_vitrine, só a CONTA é
-- comum, não o link). Ajusta:
--
-- 1. filial passa a ser obrigatória pra QUALQUER tipo de link — não existe
--    mais um link "sem loja" (nem vendedor, nem vitrine).
-- 2. linkly_cliques_vitrine passa a expor filial, e a visibilidade é
--    estendida pro gerente (só da própria loja) — mesmo padrão de
--    linkly_cliques_por_periodo/vendas_com_vendedor. adm/adm_master
--    continuam vendo as 3.
-- ============================================================================

alter table public.linkly_links drop constraint linkly_links_filial_por_tipo;
alter table public.linkly_links alter column filial set not null;

comment on column public.linkly_links.filial is
  'Obrigatória pra qualquer tipo — inclusive vitrine: cada loja tem seu próprio link de vitrine (grupo de WhatsApp daquela loja), não existe mais um link comum às 3.';

-- CREATE OR REPLACE VIEW só permite ADICIONAR coluna no fim da lista (não
-- reordenar/remover) — filial entra depois de atualizado_em, não junto de
-- link_id, pra manter a definição anterior substituível sem precisar de
-- DROP VIEW.
create or replace view public.linkly_cliques_vitrine as
select l.id as link_id, l.short_url, ct.total_cliques, ct.atualizado_em, l.filial
from public.linkly_links l
join public.linkly_cliques_totais ct on ct.link_id = l.id
where
  l.tipo = 'vitrine'
  and (
    public.auth_is_admin()
    or (public.auth_ativo() and public.auth_perfil() = 'gerente' and l.filial = public.auth_filial())
  );

comment on view public.linkly_cliques_vitrine is
  'Cliques do(s) link(s) tipo vitrine (um por loja, mesmo workspace Linkly) — adm/adm_master veem as 3, gerente só a da própria loja.';
