#!/usr/bin/env bash
# Testes de RLS contra Postgres local (sem Docker/Supabase CLI — ver
# .claude/skills/verify/SKILL.md). Recria um banco efêmero, aplica o mock de
# auth/storage, todas as migrations reais em ordem, semeia dados de teste e
# roda as asserções em supabase/tests/02_assertions_rls.sql.
#
# Requer: Postgres local rodando com um usuário que possa `createdb`/`dropdb`
# (por padrão usa o role "postgres" via `sudo -u postgres`, ajuste PSQL/DB_USER
# se o seu setup local for diferente).
set -euo pipefail

DB_NAME="${DB_NAME:-cvc_rls_test}"
PSQL="${PSQL:-sudo -u postgres psql}"
CREATEDB="${CREATEDB:-sudo -u postgres createdb}"
DROPDB="${DROPDB:-sudo -u postgres dropdb}"
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

echo "==> Recriando banco de teste ${DB_NAME}"
$DROPDB --if-exists "$DB_NAME"
$CREATEDB "$DB_NAME"

echo "==> Aplicando mock de auth/storage"
$PSQL -d "$DB_NAME" -v ON_ERROR_STOP=1 -f "$REPO_ROOT/supabase/tests/00_mock_supabase.sql"

echo "==> Aplicando migrations reais (supabase/migrations/*.sql, em ordem)"
for f in "$REPO_ROOT"/supabase/migrations/*.sql; do
  echo "    - $(basename "$f")"
  $PSQL -d "$DB_NAME" -v ON_ERROR_STOP=1 -f "$f"
done

echo "==> Semeando dados de teste"
$PSQL -d "$DB_NAME" -v ON_ERROR_STOP=1 -f "$REPO_ROOT/supabase/tests/01_seed.sql"

echo "==> Rodando asserções de RLS"
$PSQL -d "$DB_NAME" -v ON_ERROR_STOP=1 -f "$REPO_ROOT/supabase/tests/02_assertions_rls.sql"

echo "==> Limpando banco de teste"
$DROPDB --if-exists "$DB_NAME"

echo "==> RLS OK: todos os asserts passaram"
