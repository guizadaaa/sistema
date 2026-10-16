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
     '0 * * * *', -- de hora em hora (agendamento em uso em produção)
     $$ call public.disparar_sincronizacao_linkly(null); $$
   );
   ```
   Desde `20261006000009_linkly_disparo_timeout.sql` esse agendamento também
   é registrado pela própria migration (só onde o pg_cron existe; mesmo
   nome, horário e comando — não duplica o job).

## Timeout do disparo pelo pg_cron (20261006000009)

O job falhava em toda execução com `Timeout of 5000 ms reached`: o
`net.http_post` usa 5 s por padrão e a sincronização dos 4 workspaces leva
mais que isso. A procedure agora pede `timeout_milliseconds = 60000` e
espera até 75 s pela resposta (aguarda enquanto o pg_net disser PENDING ou
"not found"). Se a Edge Function passar a levar mais de ~50 s, divida a
sincronização por workspace em vez de aumentar o timeout.

Validar em produção:
```sql
call public.disparar_sincronizacao_linkly(null);   -- deve devolver p_status_code 200 (ou 207)

select status, return_message, start_time, end_time
from cron.job_run_details
where jobid = (select jobid from cron.job where jobname = 'sincronizar-linkly')
order by start_time desc
limit 5;                                           -- próximas execuções: status = succeeded
```

## Cliques por mês: virada e base do mês

**Como a base de cada mês é escolhida** (`_linkly_links_no_mes`): a base do
mês M é o **último snapshot com data anterior ao dia 1 de M**. O snapshot de
um dia guarda o **último** total sincronizado naquele dia (a trigger faz
upsert a cada sync), ou seja, o total da sync das ~23h do último dia do mês
anterior. Os cliques entre essa sync e a meia-noite caem no mês novo:
**erro máximo de ~1 h na virada** (mais o tempo da própria sincronização;
se a sync das 23h falhar, o erro cresce até a última sync bem-sucedida do
dia). Usar o primeiro snapshot do dia 1 seria pior: ele guarda o total do
**fim** do dia 1, e o dia 1 inteiro sumiria do mês. Teste: cenário "virada"
em `supabase/tests/28_assertions_linkly_cliques_snapshots.sql`.

**Mês sem snapshot anterior** (outubro/2026, primeiro mês do registro): a
tela mostra "contagem a partir de DD/MM (início do registro)" até o
adm_master definir a base em **Cliques → Base do mês** (`/cliques/base`):

1. **Buscar no Linkly** — uma chamada a `/clicks/counters/link_id` por
   workspace (`start` = dia 1, `end` = hoje, `timezone=America/Sao_Paulo`),
   além de `/workspaces` e `/list_links` para casar os links. O formato
   esperado (`{ total, values: [{ value, count }] }`) vem da documentação e
   **não foi confirmado contra uma resposta real**; se não bater, nada é
   usado e a tela mostra o trecho bruto da resposta (sem a API key) — envie
   esse trecho para ajustar `src/lib/linkly/contagem-linkly.ts`.
2. **Manual** — digitar, por link, os "cliques desde 01/MM" do relatório
   do Linkly.

A prévia mostra total atual, cliques do mês e base resultante (total atual
− cliques); só grava depois de "Confirmar e gravar". A contagem do Linkly
pode estar até 3 h defasada (cache), o que deixa o mês com alguns cliques a
menos, nunca a mais. A base só pode ser definida para o **mês atual** (a
fórmula usa o total atual) e nunca substitui um snapshot real; reaplicar
substitui a base anterior.
