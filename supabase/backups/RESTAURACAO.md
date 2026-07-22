# Backup de dados sensíveis — ativação e restauração

Item 6 do backlog de 22/07. Cobre `casos`, `implicacoes`, `desfechos`,
`usuarios` e `status_historico` — as tabelas com CPF, dados bancários e
histórico de status. Complementa (não substitui) o backup nativo do
Supabase: este mecanismo é independente da conta/projeto Supabase, então
protege contra um cenário que o backup nativo não cobre (perda da conta
inteira), mas roda com frequência bem mais baixa (semanal, contra diário do
plano nativo).

## O que já está pronto

- Migration `20260723000004_backup_dados_sensiveis.sql`: bucket privado
  `backups` (sem nenhuma policy para `authenticated`/`anon` — só
  `service_role` acessa, nem o adm_master do app enxerga isso pela UI), a
  função `obter_backup_encryption_key()` (lê a chave do Vault, só
  `service_role` pode chamar) e `disparar_backup_dados_sensiveis()` (chama
  a Edge Function via `pg_net`).
- Edge Function `supabase/functions/backup-dados-sensiveis/index.ts`:
  exporta as 5 tabelas, criptografa com AES-256-GCM e sobe pro bucket,
  apagando backups além dos 8 mais recentes.
- Script de restauração `supabase/backups/descriptografar.mjs` (testado
  contra o formato exato que a Edge Function produz — ver
  `descriptografar.test.mjs`).

## O que falta para ativar (mesma ressalva de `purgar_anexos_retencao_vencida`)

Estes passos exigem acesso ao dashboard do Supabase e não são seguros de
commitar numa migration — quem tem esse acesso (você) precisa rodar:

1. **Habilitar as extensões** `pg_cron` e `pg_net` no projeto (Database →
   Extensions).
2. **Gerar a chave de criptografia** (32 bytes aleatórios, base64) e
   guardá-la no Vault com o nome `backup_encryption_key`:
   ```sql
   -- gerar uma chave forte (rode uma vez, localmente ou no SQL Editor, e
   -- NUNCA reutilize esse valor de exemplo):
   select encode(gen_random_bytes(32), 'base64');

   -- guardar no Vault (Database → Vault, ou via SQL):
   select vault.create_secret('<chave-gerada-acima>', 'backup_encryption_key');
   ```
   Guarde uma cópia desta chave em outro lugar seguro fora do Supabase
   também (gerenciador de senhas da equipe, por exemplo) — se o Vault for
   perdido/rotacionado sem essa cópia, os backups já feitos ficam
   irrecuperáveis.
3. **Confirmar que `service_role_key` já está no Vault** (deveria já estar,
   da ativação da retenção de anexos — mesma secret, reaproveitada aqui).
4. **Agendar o disparo semanal**:
   ```sql
   select cron.schedule(
     'backup-dados-sensiveis-semanal',
     '0 3 * * 0', -- domingo às 03:00 UTC — ajuste o horário/fuso à vontade
     $$ select public.disparar_backup_dados_sensiveis(); $$
   );
   ```
5. **Fazer o deploy da Edge Function** (`supabase functions deploy
   backup-dados-sensiveis`) — ela não é aplicada por uma migration SQL,
   precisa do CLI do Supabase ou do dashboard.
6. Rodar `select public.disparar_backup_dados_sensiveis();` manualmente uma
   vez para confirmar que o primeiro backup sobe com sucesso antes de
   confiar no agendamento.

## Sobre a chave no Vault — o que ela protege (e o que não protege)

A chave fica no mesmo projeto Supabase que os dados (mesmo padrão da
`service_role_key`). Isso protege o backup contra vazar **sozinho** (um
bucket mal configurado, um link exposto, uma cópia do arquivo indo parar
em algum lugar errado) — sem a chave, o conteúdo é ilegível, o que já
atende à exigência de medida técnica de proteção da LGPD para esse dado em
repouso.

Isso **não** protege contra alguém que comprometa o projeto Supabase por
completo (ex.: vaza a `service_role_key`, ou ganha acesso ao dashboard) —
essa pessoa lê o Vault e a chave junto. Proteção contra esse cenário mais
amplo exigiria guardar a chave fora do Supabase (um secret manager de
outro provedor) — decisão consciente de não fazer isso agora, pra não
introduzir mais uma conta/serviço externo.

## Processo de restauração (manual, não automatizado)

Backup é para um cenário raro e grave — a restauração é deliberadamente
manual, para forçar uma decisão humana em cada passo em vez de um script
que reinsere tudo sem supervisão.

1. **Localizar o arquivo**: Dashboard do Supabase → Storage → bucket
   `backups`. Nome no formato `backup-2026-07-20T03-00-00-000Z.json`.
2. **Baixar o arquivo** pelo próprio dashboard.
3. **Buscar a chave de criptografia** no SQL Editor (exige acesso de
   owner/admin do projeto — não é self-service pelo app):
   ```sql
   select decrypted_secret from vault.decrypted_secrets where name = 'backup_encryption_key';
   ```
4. **Descriptografar localmente**:
   ```
   node supabase/backups/descriptografar.mjs backup-2026-07-20T03-00-00-000Z.json <chave-base64>
   ```
   Gera um `.descriptografado.json` com um array por tabela
   (`casos`, `implicacoes`, `desfechos`, `usuarios`, `status_historico`).
5. **Decidir o que restaurar** — dois cenários bem diferentes:
   - **Recuperar um registro específico** (ex.: um caso apagado ou
     corrompido por engano): localizar a linha certa no JSON e reinserir
     manualmente via SQL Editor, campo a campo — o caminho mais seguro,
     porque você revisa exatamente o que está indo para o banco.
   - **Restauração completa** (cenário grave — projeto inteiro perdido):
     escrever um script pontual de `INSERT ... ON CONFLICT DO NOTHING`,
     respeitando a ordem de dependência entre tabelas
     (`usuarios` → `casos` → `implicacoes`/`desfechos`/`status_historico`,
     nessa ordem, por causa das foreign keys). Esteja ciente de que os
     triggers de auditoria e o de `status_historico_sync`/
     `insert_status_inicial` disparam de novo na reinserção — avalie se
     isso é aceitável ou se alguns precisam ser suspensos
     (`ALTER TABLE ... DISABLE TRIGGER ...`) durante a restauração e
     reativados depois.
6. **Conferir**: compare a contagem de linhas restauradas com o campo
   `contagens` do envelope (impresso pelo próprio `descriptografar.mjs`) e
   confira alguns registros específicos à mão antes de considerar a
   restauração concluída.
