# Segurança — Sistema de Gestão de Casos Operacionais (CVC)

Este documento registra decisões de segurança do projeto que não vivem no código (configurações do painel do Supabase, políticas operacionais) — para não ficarem só na memória de quem decidiu.

## Autenticação em duas etapas (2FA / TOTP)

Obrigatória para os perfis `adm` e `adm_master` — são os perfis com acesso a gestão de usuários, dado bancário sem máscara (`desfechos_visivel`) e auditoria. `vendedor` e `gerente` podem ativar por conta própria em **Segurança**, mas não são forçados: mesmo com uma delegação ativa, um gerente não ganha acesso a dado bancário sem máscara (`desfechos_visivel` só libera isso para o dono do caso ou admin), então a exposição que justifica a obrigatoriedade não se aplica a ele.

Implementação: `src/lib/auth/mfa.ts`, `src/app/mfa/`, `src/app/(app)/seguranca/`. Sem migration — o mecanismo (fatores TOTP, AAL) vive inteiramente no schema `auth`, gerenciado pelo Supabase.

**Recuperação**: quem perde acesso ao app autenticador não consegue se auto-recuperar (a API de remoção de fator exige uma sessão já verificada em 2FA). Um `adm_master` reseta o 2FA de outro usuário travado em **Gestão de Usuários** ("Resetar 2FA"), via Admin API — a ação fica registrada em `auditoria`. Por isso: **mantenha pelo menos 2 contas `adm_master` ativas** — se só existir uma e ela travar, ninguém dentro do sistema consegue resetar.

## Expiração de sessão

Configurado no painel do Supabase (Authentication → Sessions), não no código deste repositório:

- **Time-box de sessão: 12 horas** — força login completo (senha + 2FA) de novo depois desse período, independente de uso.
- **Timeout de inatividade: 30 minutos** — força login de novo depois desse tempo sem atividade.

Motivo: o sistema lida com CPF e dado bancário de clientes (contas para reembolso), e roda em ambiente de loja/atendimento com tela potencialmente compartilhada — 30 minutos de inatividade cobre o cenário de alguém sair da mesa com a sessão aberta; 12 horas garante que ninguém fica com sessão aberta de um turno para o outro sem repassar pela autenticação completa.

Esses dois controles são por projeto, não por perfil — valem para todo mundo (vendedor, gerente, adm, adm_master), já que todo perfil lida com CPF de cliente.
