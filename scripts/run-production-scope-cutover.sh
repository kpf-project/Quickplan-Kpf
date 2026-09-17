#!/usr/bin/env bash
set -Eeuo pipefail

PACKAGE_DIR="${1:?Usage: $0 PACKAGE_DIR [PROJECT_DIR]}"
PROJECT_DIR="${2:-/home/administrator/supabase-production-line}"
DB_CONTAINER="production-line-supabase-db"
COMPOSE_FILES=(-f docker-compose.yml -f docker-compose.pg17.yml)
STOP_SERVICES=(studio kong auth rest realtime storage imgproxy meta functions supavisor)
TIMESTAMP="$(date +%Y%m%d-%H%M%S)"
BACKUP_DIR="/home/administrator/backups/production-line-before-cutover-${TIMESTAMP}"
CONTAINER_DIR="/tmp/production-scope-${TIMESTAMP}"
SUCCESS=0

if [[ ! -d "$PACKAGE_DIR" ]]; then
  echo "Package directory not found: $PACKAGE_DIR" >&2
  exit 1
fi

cd "$PACKAGE_DIR"
sha256sum -c production-scope-SHA256SUMS

mkdir -p "$BACKUP_DIR"
sudo docker exec "$DB_CONTAINER" \
  pg_dump -U postgres -d postgres --format=custom \
  > "$BACKUP_DIR/postgres-before-cutover.dump"
sudo docker exec -i "$DB_CONTAINER" pg_restore --list \
  < "$BACKUP_DIR/postgres-before-cutover.dump" \
  > "$BACKUP_DIR/postgres-before-cutover.list"
sha256sum "$BACKUP_DIR/postgres-before-cutover.dump" \
  > "$BACKUP_DIR/SHA256SUMS"

cd "$PROJECT_DIR"
sudo docker compose "${COMPOSE_FILES[@]}" stop "${STOP_SERVICES[@]}"

finish() {
  local status=$?
  if [[ $status -eq 0 && $SUCCESS -eq 1 ]]; then
    sudo docker compose "${COMPOSE_FILES[@]}" up -d
    sudo docker compose "${COMPOSE_FILES[@]}" ps
  else
    echo "CUTOVER FAILED. Services remain stopped. Backup: $BACKUP_DIR" >&2
  fi
}
trap finish EXIT

sudo docker exec "$DB_CONTAINER" mkdir -p "$CONTAINER_DIR"
sudo docker cp "$PACKAGE_DIR/." "$DB_CONTAINER:$CONTAINER_DIR"

sudo docker exec -w "$CONTAINER_DIR" "$DB_CONTAINER" \
  psql -U postgres -d postgres \
  --set=ON_ERROR_STOP=on \
  --file=production-scope-01-preflight.sql

sudo docker exec -w "$CONTAINER_DIR" "$DB_CONTAINER" \
  psql -U postgres -d postgres \
  --set=ON_ERROR_STOP=on \
  --file=production-scope-02-restore.sql

sudo docker exec -w "$CONTAINER_DIR" "$DB_CONTAINER" \
  psql -U postgres -d postgres \
  --set=ON_ERROR_STOP=on \
  --file=production-scope-03-verify.sql \
  | tee "$BACKUP_DIR/verify.log"

if grep -Eq '\| f([[:space:]]|$)' "$BACKUP_DIR/verify.log"; then
  echo "CUTOVER VERIFY FAILED: row-count mismatch" >&2
  exit 1
fi

if grep -Eq '_orphans[[:space:]]*\|[[:space:]]*[1-9][0-9]*' "$BACKUP_DIR/verify.log"; then
  echo "CUTOVER VERIFY FAILED: orphan rows found" >&2
  exit 1
fi

SUCCESS=1
echo "CUTOVER_OK"
echo "Backup: $BACKUP_DIR"
