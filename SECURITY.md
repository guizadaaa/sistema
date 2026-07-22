# Segurança — Sistema de Gestão de Casos Operacionais (CVC)

Este documento registra decisões de segurança do projeto que não vivem no código (configurações do painel do Supabase, políticas operacionais) — para não ficarem só na memória de quem decidiu.

## Autenticação em duas etapas (2FA / TOTP)

Obrigatória para os perfis `adm` e `adm_master` — são os perfis com acesso a gestão de usuários, dado bancário sem máscara (`desfechos_visivel`) e auditoria. `vendedor` e `gerente` podem ativar por conta própria em **Segurança**, mas não são forçados: mesmo com uma delegação ativa, um gerente não ganha acesso a dado bancário sem máscara (`desfechos_visivel` só libera isso para o dono do caso ou admin), então a exposição que justifica a obrigatoriedade não se aplica a ele.

Implementação: `src/lib/auth/mfa.ts`, `src/app/mfa/`, `src/app/(app)/seguranca/`. Sem migration — o mecanismo (fatores TOTP, AAL) vive inteiramente no schema `auth`, gerenciado pelo Supabase.

**Recuperação**: quem perde acesso ao app autenticador não consegue se auto-recuperar (a API de remoção de fator exige uma sessão já verificada em 2FA). Um `adm_master` reseta o 2FA de outro usuário travado em **Gestão de Usuários** ("Resetar 2FA"), via Admin API — a ação fica registrada em `auditoria`. Por isso: **mantenha pelo menos 2 contas `adm_master` ativas** — se só existir uma e ela travar, ninguém dentro do sistema consegue resetar.

## Expiração de sessão

**Status: limitação conhecida e aceita, não é um plano de ação.** Time-box e inactivity timeout (Authentication → Sessions) são recursos do plano Pro do Supabase. Decisão do projeto: seguir no plano gratuito indefinidamente, sem previsão de migrar para o Pro — então esses dois controles **não vão ser aplicados**, não é algo "pendente" esperando um upgrade futuro.

Caso o cálculo de custo/benefício mude no futuro e o projeto migre para o Pro, os valores recomendados seriam:

- **Time-box de sessão: 12 horas** — força login completo (senha + 2FA) de novo depois desse período, independente de uso.
- **Timeout de inatividade: 30 minutos** — força login de novo depois desse tempo sem atividade.

Motivo (vale como registro, mesmo sem os controles ligados): o sistema lida com CPF e dado bancário de clientes (contas para reembolso), e roda em ambiente de loja/atendimento com tela potencialmente compartilhada — 30 minutos de inatividade cobriria o cenário de alguém sair da mesa com a sessão aberta; 12 horas garantiria que ninguém fica com sessão aberta de um turno para o outro sem repassar pela autenticação completa.

Sem esses controles, uma sessão pode em teoria persistir indefinidamente (o Supabase renova o token sozinho enquanto o navegador mantiver o cookie). Mitigação real hoje, dentro do plano gratuito:

- **2FA obrigatório para adm/adm_master** é a principal proteção contra sessão comprometida — mesmo com a sessão aberta, um ataque preexistente ao navegador não teria driblado o 2FA para chegar até ali.
- Hábito operacional de clicar em **"Sair"** ao deixar a mesa, especialmente em terminal compartilhado — não é reforçado por código, depende de cada pessoa.
- Existe um caminho para implementar inactivity timeout e time-box **na própria aplicação** (sem depender do Supabase Pro — checagem de última atividade e de início de sessão via cookie próprio, reforçada no middleware) caso o projeto decida que vale o esforço de manutenção extra. Não implementado; ver com o time antes de priorizar.
