-- ============================================================================
-- Sistema de Gestão de Casos Operacionais — CVC
-- Migration: corrige vendedor enxergando desfecho financeiro da filial inteira
--
-- desfechos_visivel é uma VIEW, não uma tabela com RLS — e nunca recebeu
-- `security_invoker = true` (mesma causa-raiz já corrigida uma vez em
-- status_historico_com_duracao, 20260717000005_fix_status_historico_view_rls_bypass.sql):
-- sem essa opção, o join com public.casos dentro da view roda com o
-- privilégio do DONO da view (quem aplicou as migrations, que bypassa RLS),
-- não do papel de quem consulta — então a única barreira real de visibilidade
-- é o WHERE explícito da própria view, não a RLS de casos_select.
--
-- 20260720000002_fix_vendedor_visibilidade_filial corrigiu esse WHERE
-- corretamente (acrescentou "and auth_perfil() = 'gerente'" na metade
-- "filial" do OR) — mas a view foi recriada 3 vezes depois disso só para
-- acrescentar colunas (20260721000003, 20260721000004, 20260722000001), e
-- nas três o WHERE voltou pro predicado antigo (cópia do original, não da
-- versão corrigida). Confirmado empiricamente nesta correção: um vendedor
-- sem ser dono do caso lia tipo/valor/valor_taxas/valor_diferenca_tarifaria
-- de desfecho de qualquer caso da própria filial (dados bancários
-- continuavam mascarados corretamente — isso nunca regrediu).
--
-- Fix: mesmo predicado de 20260720000002, reaplicado por cima da versão
-- atual da view (mantém origem_remarcacao_com_custo, substituido_por,
-- substituido_em, cancelado_em, adicionadas depois da última vez que o
-- predicado esteve correto).
--
-- Cogitou-se acrescentar security_invoker = true aqui (mesma camada extra
-- usada em status_historico_com_duracao, 20260717000005) — mas testado e
-- descartado: diferente de status_historico (que tem GRANT SELECT direto
-- para authenticated), o SELECT em public.desfechos crua foi revogado de
-- authenticated de propósito (20260717000002_desfechos_mascara_bancaria),
-- exatamente para forçar a leitura só por esta view mascarada. Com
-- security_invoker = true, essa revogação passaria a valer também para a
-- view (permission denied para todo mundo, inclusive o dono do caso) — o
-- design aqui depende da view rodar como dono para contornar o REVOKE, e o
-- WHERE explícito abaixo é a única e correta camada de proteção.
-- ============================================================================

create or replace view public.desfechos_visivel as
select
  d.id,
  d.caso_id,
  d.tipo,
  d.subtipo_reembolso,
  d.origem_reembolso_integral,
  case when public.auth_is_admin() or c.vendedor_dono = auth.uid()
    then d.banco_codigo else null end as banco_codigo,
  case when public.auth_is_admin() or c.vendedor_dono = auth.uid()
    then d.banco_nome_completo else null end as banco_nome_completo,
  case when public.auth_is_admin() or c.vendedor_dono = auth.uid()
    then d.banco_agencia else null end as banco_agencia,
  case when public.auth_is_admin() or c.vendedor_dono = auth.uid()
    then d.banco_conta else null end as banco_conta,
  case when public.auth_is_admin() or c.vendedor_dono = auth.uid()
    then d.banco_cpf else null end as banco_cpf,
  d.valor,
  d.subtipo_remarcacao,
  d.valor_taxas,
  d.valor_diferenca_tarifaria,
  d.criado_por,
  d.criado_em,
  d.origem_remarcacao_com_custo,
  d.substituido_por,
  d.substituido_em,
  d.cancelado_em
from public.desfechos d
join public.casos c on c.id = d.caso_id
where
  public.auth_is_admin()
  or (
    public.auth_ativo()
    and (c.vendedor_dono = auth.uid() or (public.auth_perfil() = 'gerente' and c.filial = public.auth_filial()))
  );

comment on view public.desfechos_visivel is
  'Única via de leitura de desfechos para o client (SELECT na tabela crua é revogado de authenticated). Mascara banco_* para quem não é dono do caso nem admin; visibilidade da linha restrita a dono, admin, ou gerente da própria filial.';
