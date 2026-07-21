-- ============================================================================
-- Sistema de Gestão de Casos Operacionais — CVC
-- Migration: código do banco (COMPE/FEBRABAN) em desfechos
--
-- Reduz erro de digitação no campo "Nome do banco": a UI passa a oferecer um
-- seletor com os bancos mais comuns (código COMPE de 3 dígitos + nome
-- oficial), preenchendo banco_nome_completo automaticamente a partir do
-- banco escolhido — texto livre só fica disponível para "Outro (não
-- listado)", com banco_codigo nulo nesse caso. banco_agencia/banco_conta
-- continuam texto livre (o formato varia demais entre bancos para validar no
-- banco de dados); a máscara de dígitos fica só na UI.
-- ============================================================================

alter table public.desfechos
  add column banco_codigo text,
  add constraint desfechos_banco_codigo_formato check (banco_codigo is null or banco_codigo ~ '^\d{3}$');

-- CREATE OR REPLACE VIEW só permite acrescentar colunas no fim da lista —
-- para posicionar banco_codigo junto dos outros campos banco_*, é preciso
-- recriar a view do zero (mesma lógica de mascaramento de
-- 20260717000002_desfechos_mascara_bancaria.sql, só com a coluna nova).
drop view public.desfechos_visivel;

create view public.desfechos_visivel as
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
  d.criado_em
from public.desfechos d
join public.casos c on c.id = d.caso_id
where
  public.auth_is_admin()
  or (public.auth_ativo() and (c.vendedor_dono = auth.uid() or c.filial = public.auth_filial()));

comment on view public.desfechos_visivel is
  'Única via de leitura de desfechos para o client (SELECT na tabela crua é revogado de authenticated). Mascara banco_* (incluindo banco_codigo) para quem não é dono do caso nem admin.';

grant select on public.desfechos_visivel to authenticated;
