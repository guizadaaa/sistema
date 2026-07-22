-- ============================================================================
-- Seed para os testes de RLS em 02_assertions_rls.sql.
--
-- Duas filiais (1710, 1714), dois vendedores na 1710 (A é dono do caso de
-- teste, B não), um gerente da 1710, um gerente da 1714 (controle negativo
-- — filial diferente, nunca deveria ver nada do caso de teste) e um
-- adm_master. Um caso da Vendedor A com: um contrato adicional, um
-- desfecho (reembolso integral, com dados bancários) e um anexo.
-- ============================================================================

set role postgres;

insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-000000000001', 'vendedorA@teste.com', '{"nome_completo":"Vendedor A","perfil":"vendedor","filial":"1710"}'),
  ('00000000-0000-0000-0000-000000000002', 'vendedorB@teste.com', '{"nome_completo":"Vendedor B","perfil":"vendedor","filial":"1710"}'),
  ('00000000-0000-0000-0000-000000000003', 'gerente1710@teste.com', '{"nome_completo":"Gerente 1710","perfil":"gerente","filial":"1710"}'),
  ('00000000-0000-0000-0000-000000000004', 'admmaster@teste.com', '{"nome_completo":"Adm Master","perfil":"adm_master"}'),
  ('00000000-0000-0000-0000-000000000005', 'gerente1714@teste.com', '{"nome_completo":"Gerente 1714","perfil":"gerente","filial":"1714"}');

-- O bucket "anexos" já é criado pela migration 20260716000003_storage_anexos.sql.

-- Caso pertence à Vendedor A (filial 1710), criado por ela mesma.
set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000001';
set role authenticated;

insert into public.casos (
  id, tipo_caso, motivo, descricao, vendedor_dono, criado_por, prazo_vigencia,
  contrato_numero, cliente_nome, cliente_cpf
) values (
  '10000000-0000-0000-0000-000000000001', 'alteracao_data', 'pedido_cliente', 'teste RLS C1/C2/M1',
  '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', '2026-12-31',
  '17100000000001', 'Cliente Teste', '11144477735'
);

insert into public.casos_contratos_adicionais (caso_id, contrato_numero) values
  ('10000000-0000-0000-0000-000000000001', '17100000000099');

insert into public.anexos (caso_id, tipo_documento, storage_path, nome_arquivo)
values ('10000000-0000-0000-0000-000000000001', 'outro', '10000000-0000-0000-0000-000000000001/teste.pdf', 'teste.pdf');

insert into storage.objects (bucket_id, name, owner)
values ('anexos', '10000000-0000-0000-0000-000000000001/teste.pdf', '00000000-0000-0000-0000-000000000001');

reset role;
reset request.jwt.claim.sub;

-- Desfecho registrado pelo adm_master (desfechos_insert exige admin ou
-- gerente com delegação ativa — não o vendedor dono).
set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000004';
set role authenticated;

insert into public.desfechos (
  id, caso_id, tipo, subtipo_reembolso, origem_reembolso_integral, banco_codigo, banco_nome_completo,
  banco_agencia, banco_conta, banco_cpf, valor
) values (
  '20000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001',
  'reembolso', 'integral', 'fornecedor', '001', 'Banco do Brasil', '1234', '567890', '11144477735', 1000.00
);

reset role;
reset request.jwt.claim.sub;

select 'seed ok' as status;
