# Cliques do Linkly — ativação

Feature de divulgação (28/07): rastreia cliques de 4 contas/workspaces do
Linkly — uma é a conta "vitrine" (usada pelos 3 links de vitrine, um por
loja, cada um levando ao grupo de WhatsApp de ofertas daquela loja
específica — a conta é comum, os links não), três são uma por loja com um
link por vendedor. Mesmo mecanismo de sincronização periódica de
`backup-dados-sensiveis`/`purgar_anexos_retencao_vencida` (pg_cron + pg_net).

## Formato da API — confirmado contra uma resposta real (28/07)

O primeiro teste manual (item 6, antes desta atualização) falhou nos 18
links com "Link não encontrado" — sinal de que autenticação, descoberta do
workspace e a chamada de listagem funcionavam, mas a correspondência de
campos (baseada só na documentação pública, nunca testada contra uma conta
real) estava errada. O usuário capturou uma resposta real via `net.http_get`
direto no SQL Editor (mesma técnica de diagnóstico já usada antes neste
projeto) e o código foi corrigido com base nela:

- Contagem de cliques: campo **`clicks_total`** (não `clicks`/`click_count`/
  `total_clicks`/`visits`, que eram só suposições).
- Identificador único do link: campo **`id`** (numérico).
- URL curta completa: campo **`full_url`** (ex.: `"https://linkly.link/2nlqB"`)
  — o campo `slug` existe mas vem sempre `null` nesta conta, e o campo `url`
  é o **destino** do link (ex.: o grupo de WhatsApp), não a URL curta do
  Linkly — usar `url` pra correspondência seria um bug silencioso (todos os
  links de uma loja apontam pro mesmo destino).

A lógica de parsing/correspondência agora mora em
`supabase/functions/sincronizar-linkly/matching.ts` (funções puras, sem
`fetch`/`Deno.*`) com testes automatizados em `matching.test.ts` usando a
resposta real capturada como fixture — `npx vitest run` cobre isso.

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
   URL curta (ex.: `https://linkly.link/2nlst9`) e o identificador do link no
   Linkly, se souber — a URL curta sozinha já é suficiente na prática (é o
   que a correspondência usa como fallback, e o `id` interno do Linkly não é
   algo que normalmente se sabe de cabeça).
5. **Atribuir o vendedor atual de cada link** (mesma tela).
6. **Testar manualmente antes de confiar no agendamento** — prefira o botão
   "Atualizar agora" na tela `/cliques` em vez de chamar a procedure pelo SQL
   Editor: o botão mostra o resultado detalhado (`atualizados`/`erros`); a
   procedure só devolve o status HTTP, sem o corpo da resposta. Se `erros`
   vier com "Nenhum campo de contagem de cliques reconhecido" ou "Link não
   encontrado" mesmo depois da correção de 28/07 (ver seção acima), a API do
   Linkly pode ter mudado de novo — capture uma resposta real de novo (mesma
   técnica de `net.http_get` + `net._http_collect_response` direto no SQL
   Editor) e ajuste `matching.ts` com base nela, igual da última vez.
7. **Agendar o pg_cron** (depois do passo 6 confirmar que funciona):
   ```sql
   select cron.schedule(
     'sincronizar-linkly',
     '0 */4 * * *', -- a cada 4h — ajuste à vontade, cliques não são tão sensíveis a frescor quanto o backup
     $$ call public.disparar_sincronizacao_linkly(null); $$
   );
   ```
