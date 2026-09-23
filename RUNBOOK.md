RUNBOOK — Aura



Guia operacional do sistema Aura (gestão de casos/protocolos — CVC Viagens, lojas 1710/1714/1730). Objetivo: qualquer passo crítico de deploy/manutenção documentado aqui, sem depender de memória.



1\. Deploy pós-merge (SEMPRE que um PR com migration ou Edge Function for mesclado)



Rodar manualmente em UM dos dois PCs (não precisa nos dois, mas mantenha ambos sincronizados eventualmente):



powershell

\# PC de casa

cd C:\\Users\\Guilherme\\sistema



\# PC do trabalho (principal)

cd C:\\Users\\admin\\sistema

powershell

git pull

supabase db push



Se o PR incluiu Edge Function nova ou alterada:



powershell

supabase functions deploy <nome-da-function>



⚠️ Esquecer esse passo já causou bug em produção (tela quebrando) mais de uma vez. Sempre confirmar se o PR mexeu em supabase/migrations/ ou supabase/functions/ antes de dar como "concluído".



2\. Sincronizar os dois PCs



Os dois PCs (casa e trabalho) podem divergir se git pull não for feito regularmente nos dois. O PC do trabalho é considerado o principal/mais atualizado.



Ao alternar de PC, sempre rodar primeiro:



powershell

git pull

git status



Se houver divergência de histórico entre os dois PCs, comparar com:



powershell

git log --oneline -10

git branch -a

3\. Se a conta GitHub for suspensa novamente



Sintoma: git fetch/git push pedem login e falham, ou retornam erro de permissão/conta suspensa.



Não entrar em pânico — geralmente é falso positivo por volume de commits via Claude Code.

Abrir ticket em https://support.github.com/contact (categoria: Account Suspension / Reinstatement request), com contexto: uso de Claude Code para desenvolvimento, franquia CVC, sem violação de ToS conhecida.

Continuar trabalhando localmente — todo commit fica salvo no .git local, sem necessidade de acesso ao GitHub.

Fazer backup do .git local imediatamente (ver seção 4) e/ou usar push-all.ps1 (ver seção 10).

Responder à MESMA thread do ticket a cada \~1 semana se não houver resposta — não abrir ticket novo. Espaçar os follow-ups (evita parecer spam, é o padrão que a comunidade recomenda).

Fórum da comunidade GitHub NÃO ajuda em casos de suspensão de conta — a equipe fecha esses tópicos redirecionando para o Support. Não usar esse canal para esse tipo de caso.

Continuar usando GitLab (gitlab-pessoal) como fonte de deploy alternativa e vercel --prod como emergência (ver seções 10-11) enquanto aguarda.

Considerar migração completa (GitLab como principal) apenas se a suspensão ultrapassar várias semanas sem qualquer resposta — decisão a ser reavaliada, não automática.

4\. Backup local do .git (usar sempre que houver bloqueio de push, ou periodicamente)

powershell

cd C:\\Users\\admin

Compress-Archive -Path sistema -DestinationPath sistema-backup-trabalho-<data>.zip -Force



Subir o .zip para o Google Drive (fora da máquina local).



5\. Varredura de segredo vazado (gitleaks)



Rodar após qualquer sessão grande de commits, ou periodicamente:



powershell

cd C:\\Users\\admin\\sistema

gitleaks detect --source . -v --report-path gitleaks-report.json



Se algo for encontrado: não apagar direto do código. Rotacionar a chave/segredo primeiro (ela já está no histórico do Git, remover do arquivo atual não resolve), depois reescrever o histórico se necessário.



gitleaks-report.json está no .gitignore — não deve ser commitado.



6\. Gerar/rotacionar SUPABASE\_ACCESS\_TOKEN

https://supabase.com/dashboard → ícone da conta → Account Settings → Access Tokens.

Generate new token → nomear (ex. github-actions-ci) → copiar (só aparece uma vez).

Guardar em gerenciador de senhas.

Cadastrar como secret no GitHub: Settings do repositório → Secrets and variables → Actions → New repository secret.



Secrets necessários no GitHub Actions (CI/CD):



SUPABASE\_ACCESS\_TOKEN

SUPABASE\_PROJECT\_REF

SUPABASE\_DB\_URL



⚠️ Login do dashboard Supabase é vinculado exclusivamente ao GitHub OAuth (sem senha própria) — enquanto o GitHub estiver suspenso, o acesso ao painel Supabase também fica bloqueado. Ticket de suporte aberto com a Supabase (SU-441383) para esse problema especificamente.



7\. Ritmo de commits/push (para evitar nova suspensão)

Máximo \~1-2 pushes por dia por PR.

Máximo \~3-5 PRs por semana no total.

PRs separados por assunto — nunca um PR único empilhando várias mudanças não relacionadas.

8\. Checklist rápido antes de reportar um PR como "concluído"

&#x20;tsc limpo

&#x20;eslint limpo

&#x20;vitest passando

&#x20;test:rls passando (se mexeu em RLS/schema)

&#x20;Verificação visual (Playwright/harness, removido depois)

&#x20;Estado real do PR confirmado via API do GitHub (não supor que foi mesclado)

&#x20;Se envolveu migration/Edge Function: seção 1 deste runbook executada

9\. Backup remoto no GitLab (mirror manual)



Grupo GitLab com 2 owners (guiaugustoluz e guiluzgo) — redundância caso uma conta tenha problema de acesso.



Repositórios:



https://gitlab.com/aura-group2372632/aura-sistema (grupo — backup redundante)

https://gitlab.com/guiaugustoluz/aura-sistema (pessoal — usado para deploy na Vercel, ver seção 10)

Se precisar recuperar do GitLab (cenário de desastre)

powershell

git clone https://gitlab.com/aura-group2372632/aura-sistema.git



Isso restaura o histórico completo, independente do estado do GitHub.



10\. Script de sincronização multi-remote (push-all.ps1)



Localização: raiz do repositório (push-all.ps1).



Envia o branch atual para os três remotes de uma vez: GitHub (origin), GitLab pessoal (gitlab-pessoal, usado para deploy na Vercel) e GitLab grupo (gitlab, backup redundante com 2 owners).



Uso



Substituir o hábito de git push origin ... por:



powershell

cd C:\\Users\\admin\\sistema

.\\push-all.ps1

Comportamento esperado

Se o GitHub estiver suspenso/bloqueado, a etapa dele falha (mensagem em vermelho) mas o script continua para os outros dois remotes — não trava.

Serve também como teste automático: se a etapa do GitHub passar a funcionar sem erro, é sinal de que a suspensão foi resolvida.

Os remotes GitLab devem sempre completar com sucesso, independente do estado do GitHub.

Remotes configurados

origin          → https://github.com/guizadaaa/sistema.git

gitlab          → https://gitlab.com/aura-group2372632/aura-sistema.git (grupo, 2 owners: guiaugustoluz + guiluzgo)

gitlab-pessoal  → https://gitlab.com/guiaugustoluz/aura-sistema.git (pessoal — único que funciona para deploy gratuito na Vercel)



⚠️ Importante: a Vercel no plano Hobby (grátis) só permite importar/deployar repositórios em namespace pessoal — não funciona a partir de Organization (GitHub) nem Group (GitLab). Por isso o gitlab-pessoal existe separado do gitlab (grupo).



11\. Deploy de emergência via Vercel CLI (sem depender de nenhum Git)



Já configurado e testado neste PC (trabalho) — vercel link já vincula esta pasta ao projeto de produção guizadas-projects/sistema.



Quando usar



Só em emergência real: GitHub e/ou GitLab indisponíveis, ou necessidade de publicar uma correção urgente (ex. limite de uso da Vercel perto de estourar) sem esperar o fluxo normal de PR.



Comando

powershell

cd C:\\Users\\admin\\sistema

vercel --prod



⚠️ Isso publica diretamente em produção, pulando todo o checklist normal (tsc, eslint, vitest, test:rls, verificação visual). Usar com cautela — preferir sempre o fluxo normal (PR + push) quando não for emergência.



Setup (já feito neste PC, não repetir a menos que troque de máquina)

powershell

npm install -g vercel

vercel login

cd C:\\Users\\admin\\sistema

vercel link   # selecionar "sistema (linked by git)" → guizadas-projects/sistema



Gera .vercel/ (config local) e .env.local (token OIDC) — ambos devem permanecer fora do Git (já cobertos pelo .gitignore).



Última atualização: agosto/2026. Manter este documento vivo — atualizar sempre que um novo processo operacional crítico for estabelecido.

