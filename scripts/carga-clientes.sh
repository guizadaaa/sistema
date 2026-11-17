#!/usr/bin/env bash
# Carga de desempenho da base de clientes: cria um banco local, aplica o mock
# de auth/storage, todas as migrations e a semente de teste, gera o volume
# real (supabase/tests/perf/carga.sql: 60 mil reservas, 70 mil compras, 25 mil
# clientes, 80 nomes no mapeamento) e mede cada consulta da página /clientes
# como `authenticated` para vendedor 1710, gerente 1710 e adm_master
# (supabase/tests/perf/mede.sql — EXPLAIN ANALYZE, tabela em ms).
#
# Mesmo Postgres local de scripts/test-rls.sh. O banco fica criado no fim
# (para EXPLAIN à mão); --limpar apaga.
set -euo pipefail

DB_NAME="${DB_NAME:-cvc_carga_clientes}"
PSQL="${PSQL:-sudo -u postgres psql}"
CREATEDB="${CREATEDB:-sudo -u postgres createdb}"
DROPDB="${DROPDB:-sudo -u postgres dropdb}"
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

echo "==> Recriando ${DB_NAME}"
$DROPDB --if-exists "$DB_NAME"
$CREATEDB "$DB_NAME"

echo "==> Mock + migrations + semente"
$PSQL -q -d "$DB_NAME" -v ON_ERROR_STOP=1 < "$REPO_ROOT/supabase/tests/00_mock_supabase.sql" > /dev/null
for f in "$REPO_ROOT"/supabase/migrations/*.sql; do
  $PSQL -q -d "$DB_NAME" -v ON_ERROR_STOP=1 < "$f" > /dev/null 2>&1 || { echo "falhou: $(basename "$f")"; exit 1; }
done
$PSQL -q -d "$DB_NAME" -v ON_ERROR_STOP=1 < "$REPO_ROOT/supabase/tests/01_seed.sql" > /dev/null

echo "==> Gerando o volume (carga.sql)"
$PSQL -q -d "$DB_NAME" < "$REPO_ROOT/supabase/tests/perf/carga.sql" | tail -4

echo "==> Medindo como authenticated (mede.sql)"
$PSQL -q -d "$DB_NAME" < "$REPO_ROOT/supabase/tests/perf/mede.sql" | sed -n '/+---/,$p'

if [[ "${1:-}" == "--limpar" ]]; then
  $DROPDB --if-exists "$DB_NAME"
else
  echo "==> Banco ${DB_NAME} mantido (npm run carga-clientes -- --limpar apaga)."
fi
