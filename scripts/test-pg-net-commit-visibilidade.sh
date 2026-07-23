#!/usr/bin/env bash
# Prova standalone (não faz parte do loop de scripts/test-rls.sh, porque
# precisa de duas conexões concorrentes, e não só um `psql -f` sequencial)
# do mecanismo exato por trás do bug corrigido em
# 20260724000004_commit_antes_de_coletar_resposta_pg_net.sql:
#
#   Uma linha inserida numa transação ainda aberta em uma conexão (A) é
#   INVISÍVEL para qualquer outra conexão (B) até A dar commit — é assim que
#   isolamento entre transações funciona em Postgres, sempre, sem exceção,
#   com ou sem pg_net envolvido.
#
# É exatamente por isso que `disparar_backup_dados_sensiveis()` e
# `purgar_anexos_retencao_vencida()` nunca funcionavam antes desta correção:
# o worker do pg_net roda numa conexão própria (como a conexão B aqui) e só
# processa requisições já commitadas na fila — enquanto nossa função
# continuava tentando coletar a resposta na MESMA transação que enfileirou o
# pedido (nunca commitada até a função retornar), o worker nunca via nada
# pra processar. "not found" para sempre, não porque o worker estava lento,
# mas porque a requisição, do ponto de vista dele, nunca tinha sido feita.
#
# Este script não usa pg_net nem rede alguma — testa só o princípio de MVCC
# entre conexões, que é a causa raiz real, com uma tabela comum.
set -euo pipefail

DB_NAME="${DB_NAME:-cvc_commit_visibilidade_test}"
PSQL="${PSQL:-sudo -u postgres psql}"
CREATEDB="${CREATEDB:-sudo -u postgres createdb}"
DROPDB="${DROPDB:-sudo -u postgres dropdb}"

cleanup() {
  $DROPDB --if-exists "$DB_NAME" >/dev/null 2>&1 || true
}
trap cleanup EXIT

echo "==> Recriando banco de teste ${DB_NAME}"
$DROPDB --if-exists "$DB_NAME"
$CREATEDB "$DB_NAME"
$PSQL -d "$DB_NAME" -v ON_ERROR_STOP=1 -c "create table public._test_visibilidade (id int primary key);"

echo "==> Conexão A: insere numa transação que só commita depois de 2s (simula o padrão antigo: enfileirar + tentar coletar sem nunca ter commitado)"
$PSQL -d "$DB_NAME" -v ON_ERROR_STOP=1 <<'SQL' &
begin;
insert into public._test_visibilidade values (1);
select pg_sleep(2);
commit;
SQL
PID_A=$!

echo "==> Conexão B: poll a cada 0.1s, como o worker do pg_net faria numa conexão própria"
ITERACAO_VISIVEL=0
for i in $(seq 1 40); do
  COUNT=$($PSQL -d "$DB_NAME" -t -A -c "select count(*) from public._test_visibilidade;")
  if [ "$COUNT" -gt 0 ]; then
    ITERACAO_VISIVEL=$i
    break
  fi
  sleep 0.1
done

wait "$PID_A"

if [ "$ITERACAO_VISIVEL" -eq 0 ]; then
  echo "FALHOU: a linha nunca ficou visível para a conexão B (esperado ~iteração 20, ~2s)"
  exit 1
fi

echo "==> linha ficou visível para a conexão B na iteração ${ITERACAO_VISIVEL} (~$(awk -v i="$ITERACAO_VISIVEL" 'BEGIN { printf "%.1f", i * 0.1 }')s)"

if [ "$ITERACAO_VISIVEL" -lt 8 ]; then
  echo "FALHOU: ficou visível cedo demais (antes do commit) — isolamento entre conexões não se comportou como esperado, hipótese da causa raiz estaria errada"
  exit 1
fi

echo "==> OK: a linha só ficou visível para outra conexão DEPOIS do commit — confirma a causa raiz do bug de pg_net (worker não enxerga fila não commitada) e por que o fix (commit explícito antes do loop de coleta) é necessário"
