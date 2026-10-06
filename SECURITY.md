# Segurança — Sistema de Gestão de Casos Operacionais (CVC)

Este documento registra decisões de segurança do projeto que não vivem no código (configurações do painel do Supabase, políticas operacionais) — para não ficarem só na memória de quem decidiu.

## Autenticação em duas etapas (2FA / TOTP)

Obrigatória para os perfis `adm` e `adm_master` — são os perfis com acesso a gestão de usuários, dado bancário sem máscara (`desfechos_visivel`) e auditoria. `vendedor` e `gerente` podem ativar por conta própria em **Segurança**, mas não são forçados: mesmo com uma delegação ativa, um gerente não ganha acesso a dado bancário sem máscara (`desfechos_visivel` só libera isso para o dono do caso ou admin), então a exposição que justifica a obrigatoriedade não se aplica a ele.

Implementação: `src/lib/auth/mfa.ts`, `src/app/mfa/`, `src/app/(app)/seguranca/`. Sem migration — o mecanismo (fatores TOTP, AAL) vive inteiramente no schema `auth`, gerenciado pelo Supabase.

**Recuperação**: quem perde acesso ao app autenticador não consegue se auto-recuperar (a API de remoção de fator exige uma sessão já verificada em 2FA). Um `adm_master` reseta o 2FA de outro usuário travado em **Gestão de Usuários** ("Resetar 2FA"), via Admin API — a ação fica registrada em `auditoria`. Por isso: **mantenha pelo menos 2 contas `adm_master` ativas** — se só existir uma e ela travar, ninguém dentro do sistema consegue resetar.

## Expiração de sessão

O projeto segue no plano gratuito do Supabase, sem previsão de migrar para o Pro — decisão do projeto, não uma limitação temporária. Os controles nativos de sessão (Authentication → Sessions: time-box e inactivity timeout) só existem no plano pago, então **foram implementados na própria aplicação**, fora do Supabase:

- **Time-box de sessão: 12 horas** — força login completo (senha + 2FA) de novo depois desse período, independente de uso.
- **Timeout de inatividade: 30 minutos** — força login de novo depois desse tempo sem atividade no servidor (navegação de página ou submit de formulário/Server Action).

Motivo: o sistema lida com CPF e dado bancário de clientes (contas para reembolso), e roda em ambiente de loja/atendimento com tela potencialmente compartilhada — 30 minutos de inatividade cobre o cenário de alguém sair da mesa com a sessão aberta; 12 horas garante que ninguém fica com sessão aberta de um turno para o outro sem repassar pela autenticação completa.

**Implementação**: dois cookies `httpOnly` (`sessao_inicio`, `ultima_atividade` — `src/lib/auth/sessao.ts`), checados a cada requisição autenticada em `src/proxy.ts` (é onde a sessão já é revalidada hoje — Next.js 16 renomeou `middleware.ts`/`middleware` para `proxy.ts`/`proxy`, ver `AGENTS.md`). Ao expirar qualquer um dos dois limites, a sessão é encerrada (`signOut()`) e a pessoa volta para `/login` com uma mensagem explicando o motivo. `login()` grava `sessao_inicio` explicitamente no momento do login; os cookies são "self-healing" nos demais pontos de entrada de sessão (ex.: `/auth/confirm`) — se ausentes, só começam a contar a partir daquele momento, sem forçar logout.

**Limitação conhecida e aceita**: a checagem de inatividade só enxerga requisições ao servidor, não digitação/scroll no cliente — alguém preenchendo um formulário longo por mais de 30 minutos sem nenhum submit ou navegação seria desconectado mesmo "ativo" na tela. Não implementamos um heartbeat (ping periódico em JS) para cobrir esse caso porque os formulários deste sistema não são longos o suficiente para isso ser um problema real na prática.

## Quem avança o status de um caso

Desde as migrations `20261006000002_vendedor_avanca_status.sql` e `20261006000004_gerente_filial_avanca_status.sql`, avançar status (inserir em `status_historico`) é permitido a:

- **adm / adm_master**: qualquer caso, incluindo **Ouvidoria** (exclusiva do admin).
- **gerente**: casos da própria filial, **com ou sem delegação** (desde `20261006000004_gerente_filial_avanca_status.sql`). Nunca de outra filial.
- **vendedor**: somente os casos dos quais é **dono** (`vendedor_dono`) e que já enxerga. Nunca caso de colega nem de outra filial.

Regras iguais para todos: "Resolvido" exige ao menos um comentário (trigger `impede_resolvido_sem_comentario`). O histórico grava quem avançou (`alterado_por`); `via_delegacao` só é verdadeiro para gerente que está com delegação ativa no momento. A mudança aparece na `auditoria` com o autor real.

**Onde é imposto (banco, não só tela)**: função `auth_pode_avancar_status(caso)` usada pela policy `status_historico_insert`; o trigger `enforce_casos_update_permissions` só aceita a troca de `status_atual` feita pelo vendedor quando ela vem do histórico (`sync_caso_status`), nunca por UPDATE direto em `casos`. A tela só espelha isso (`podeAvancarStatus` em `src/lib/casos/permissoes.ts`).

**Delegação ainda importa para**: registrar/corrigir desfecho e lançar implicações financeiras, que continuam restritos a admin ou gerente **com** delegação (o vendedor nunca) (`podeConduzirFluxo` e policies `desfechos_*` / `implicacoes_*`).

**Ordem das transições (imposta no banco desde `20261006000003_ordem_transicoes_status.sql`)**: a trigger `validar_transicao_status` (BEFORE INSERT em `status_historico`) só aceita Inicial → Recepcionado → Em andamento interno → {Reavaliação | Ouvidoria | Resolvido}, Reavaliação → Resolvido e Ouvidoria → Resolvido. Status repetido é recusado; Inicial só existe como primeiro item (criação do caso). **Resolvido não tem saída**, exceto para **adm/adm_master**, que podem reabrir para Em andamento interno ou Reavaliação — só permissão no banco, sem botão na tela. A tela (`src/lib/casos/status.ts`) só oferece as mesmas transições normais.
