# Cliques do Linkly — ativação

Feature de divulgação (28/07): rastreia cliques de 4 contas/workspaces do
Linkly — uma é a conta "vitrine" (usada pelos 3 links de vitrine, um por
loja, cada um levando ao grupo de WhatsApp de ofertas daquela loja
específica — a conta é comum, os links não), três são uma por loja com um
link por vendedor. Mesmo mecanismo de sincronização periódica de
`backup-dados-sensiveis`/`purgar_anexos_retencao_vencida` (pg_cron + pg_net).

## AVISO — API do Linkly não testada contra uma conta real

O sandbox de desenvolvimento não tem acesso de rede a `linklyhq.com`
(bloqueado pela política de rede do ambiente), e nenhuma API key real estava
disponível durante a implementação. O código em
`supabase/functions/sincronizar-linkly/index.ts` foi escrito a partir da
documentação pública do Linkly (`linklyhq.com/support/api`,
`/support/analytics-api`, `/url-shortener-api-reference`), mas os nomes
exatos de campo da resposta (id do workspace, id de cada link, campo de
contagem de cliques) **não foram confirmados contra uma resposta real**.

Tudo que depende disso está isolado em funções pequenas e comentadas
(`buscarWorkspaceId`, `buscarLinks`, `idDoLink`/`slugDoLinkApi`,
`extrairContagemDeCliques`) especificamente para serem fáceis de ajustar. A
função tenta várias variações de nome de campo e, quando nenhuma bate, **falha
alto por link** (registra em `erros`, não grava um total errado/zero
silenciosamente) — o primeiro teste manual (passo 6 abaixo) vai mostrar
exatamente o que precisa de ajuste, se precisar.

## O que já está pronto

- Migration `20260728000001_linkly_cliques.sql`: tabelas `linkly_links`,
  `linkly_vendedor_mapeamento` (histórico, escrita só via
  `atribuir_vendedor_link()`), `linkly_cliques_totais`; views
  `linkly_cliques_por_periodo` (delta por período, visibilidade por perfil) e
  `linkly_cliques_vitrine` (admin only); `obter_linkly_api_key()` (Vault, só
  `service_role`); `disparar_sincronizacao_linkly()` (procedure, pg_cron).
- Edge Function `supabase/functions/sincronizar-linkly/index.ts`: lê
  `linkly_links`, agrupa por workspace, busca a API key no Vault, chama o
  Linkly e grava `linkly_cliques_totais`.
- Botão "Atualizar agora" (Adm/Adm Master) chama a mesma Edge Function
  diretamente do servidor Next.js (`src/lib/linkly/sincronizar.ts`) — não
  depende do pg_cron nem do pg_net.

## O que falta para ativar

1. **Cadastrar as 4 API keys no Vault** (Database → Vault, ou via SQL) — os
   nomes precisam bater com o `workspace_secret` usado ao cadastrar cada link
   na tela de Mapeamento:
   ```sql
   select vault.create_secret('<api-key-da-conta-vitrine>', 'linkly_api_key_vitrine');
   select vault.create_secret('<api-key-da-conta-1710>', 'linkly_api_key_1710');
   select vault.create_secret('<api-key-da-conta-1714>', 'linkly_api_key_1714');
   select vault.create_secret('<api-key-da-conta-1730>', 'linkly_api_key_1730');
   ```
2. **Confirmar que `service_role_key` já está no Vault** (deveria já estar —
   reaproveitada do backup/retenção de anexos).
3. **Fazer o deploy da Edge Function**: `supabase functions deploy sincronizar-linkly`.
4. **Cadastrar os links** na tela `/cliques/mapeamento` (Adm Master): loja,
   URL curta (ex.: `https://linkly.link/2nlst9`) e o identificador do link
   segundo o Linkly, se souber — se não souber ou não tiver certeza, cadastre
   só a URL curta mesmo assim, o fallback por slug (passo 6) cobre isso.
5. **Atribuir o vendedor atual de cada link** (mesma tela).
6. **Testar manualmente antes de confiar no agendamento** — prefira o botão
   "Atualizar agora" na tela `/cliques` em vez de chamar a procedure pelo SQL
   Editor: o botão mostra o resultado detalhado (`atualizados`/`erros`); a
   procedure só devolve o status HTTP, sem o corpo da resposta. Se `erros`
   vier com "Nenhum campo de contagem de cliques reconhecido" ou "Link não
   encontrado", ver o aviso no topo deste documento — normalmente é só ajustar
   os nomes de campo em `extrairContagemDeCliques`/`idDoLink` na Edge Function
   depois de inspecionar uma resposta real (`console.log` temporário + `supabase
   functions logs sincronizar-linkly`).
7. **Agendar o pg_cron** (depois do passo 6 confirmar que funciona):
   ```sql
   select cron.schedule(
     'sincronizar-linkly',
     '0 */4 * * *', -- a cada 4h — ajuste à vontade, cliques não são tão sensíveis a frescor quanto o backup
     $$ call public.disparar_sincronizacao_linkly(null); $$
   );
   ```
