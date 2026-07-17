-- ============================================================================
-- Sistema de Gestão de Casos Operacionais — CVC
-- Migration 5: mascarar dados bancários de desfechos
--
-- Decisão confirmada com o cliente: dados bancários de desfechos visíveis
-- apenas para o dono do caso, adm e adm_master (gerente da filial continua
-- vendo o restante do desfecho — tipo, valor etc. — só não os campos
-- banco_*). Valores de implicacoes continuam visíveis ao gerente da filial
-- sem alteração (já era assim: implicacoes_select em
-- 20260716000002_rls.sql não muda).
--
-- RLS é por linha, não por coluna, e todo usuário autenticado compartilha o
-- mesmo role do Postgres ("authenticated") — não dá para expressar "vê a
-- linha mas não a coluna X" com uma policy comum. A abordagem robusta:
--   1. REVOGAR o SELECT direto na tabela desfechos do role authenticated,
--      para que a única forma de ler os dados seja através da view abaixo
--      (não depende de "lembrar" de usar a view — o Postgres barra o
--      acesso à tabela crua).
--   2. Criar uma view SECURITY DEFINER-like (dona da migration, sem
--      security_invoker) que reimplementa a mesma regra de visibilidade de
--      linha do desfechos_select original, e mascara (NULL) as colunas
--      banco_* quando quem consulta não é o dono do caso nem admin.
-- ============================================================================

revoke select on public.desfechos from authenticated;

-- A policy de SELECT original (linha 100716000002) continua existindo, mas
-- fica sem efeito prático para authenticated (sem privilégio de SELECT na
-- tabela crua). Substituída por uma nova, mais restrita, para o caso de o
-- privilégio ser regravado no futuro: só dono do caso e admin, sem gerente
-- (gerente passa a enxergar desfechos exclusivamente pela view mascarada).
drop policy if exists desfechos_select on public.desfechos;

create policy desfechos_select
  on public.desfechos for select to authenticated
  using (
    exists (
      select 1 from public.casos c
      where c.id = desfechos.caso_id
        and (
          public.auth_is_admin()
          or (public.auth_ativo() and c.vendedor_dono = auth.uid())
        )
    )
  );

create view public.desfechos_visivel as
select
  d.id,
  d.caso_id,
  d.tipo,
  d.subtipo_reembolso,
  d.origem_reembolso_integral,
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
  d.criado_em
from public.desfechos d
join public.casos c on c.id = d.caso_id
where
  public.auth_is_admin()
  or (public.auth_ativo() and (c.vendedor_dono = auth.uid() or c.filial = public.auth_filial()));

comment on view public.desfechos_visivel is
  'Única via de leitura de desfechos para o client (SELECT na tabela crua é revogado de authenticated). Mascara banco_* para quem não é dono do caso nem admin.';

grant select on public.desfechos_visivel to authenticated;
