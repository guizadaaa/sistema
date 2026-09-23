Write-Host "=== Enviando para GitHub (origin) ==="
git push origin claude/new-session-x4vojn 2>&1 | Tee-Object -Variable ghResult

Write-Host "`n=== Enviando para GitLab pessoal (deploy) ==="
git push gitlab-pessoal claude/new-session-x4vojn:main

Write-Host "`n=== Enviando para GitLab grupo (backup redundante) ==="
git push gitlab claude/new-session-x4vojn:main

Write-Host "`n=== Concluído ==="
Write-Host "Se o GitHub falhou acima (esperado se suspenso), os outros dois foram sincronizados normalmente."