#!/usr/bin/env bash
# Run the migration checks in a fresh, disposable PostgreSQL container only.
set -euo pipefail
export MSYS_NO_PATHCONV=1

name="guide-host-migration-check-$(date +%s)-$$"
cid=$(docker run --detach --rm --name "$name" --env POSTGRES_PASSWORD=local-migration-test-only postgres:17-alpine)

cleanup() {
  status=$?
  trap - EXIT
  if ! docker rm -fv "$cid"; then
    printf 'Pembersihan gagal; hapus container sementara %s beserta anonymous volume-nya secara manual.\n' "$name" >&2
    [ "$status" -ne 0 ] || status=1
  fi
  exit "$status"
}
trap cleanup EXIT

if [ "$(docker inspect "$cid" --format '{{.Name}}')" != "/$name" ] ||
   [ -n "$(docker port "$cid")" ]; then
  printf 'Identitas container tidak cocok atau port host terbuka. Tidak ada migrasi yang dijalankan.\n' >&2
  exit 1
fi

ready=false
for ((attempt=0; attempt<30; attempt++)); do
  if docker exec "$cid" pg_isready -U postgres -d postgres > /dev/null 2>&1; then ready=true; break; fi
  sleep 1
done
if [ "$ready" != true ]; then
  printf 'PostgreSQL sementara tidak siap setelah 30 detik.\n' >&2
  exit 1
fi

run_sql() {
  docker exec "$cid" psql -X -U postgres -d postgres -v ON_ERROR_STOP=1 -f "$1"
}

printf 'Menyiapkan shim Supabase di PostgreSQL sementara...\n'
docker cp tests/backend/personal-invitations-bootstrap.sql "$cid:/tmp/bootstrap.sql"
docker cp tests/backend/personal-invitations-before.sql "$cid:/tmp/before.sql"
run_sql /tmp/bootstrap.sql

for migration in supabase/migrations/*.sql; do
  file=${migration##*/}
  if [ "$file" = 202610110001_personal_invitations.sql ]; then
    printf 'Menyiapkan acara dan RSVP lama sintetis sebelum migrasi baru...\n'
    run_sql /tmp/before.sql
  fi
  printf 'Menerapkan %s...\n' "$file"
  docker cp "$migration" "$cid:/tmp/current.sql"
  run_sql /tmp/current.sql > /dev/null
done

# Every *-check.sql runs in its own transaction and rolls back, so their order does not matter.
for check in tests/backend/*-check.sql; do
  printf 'Menjalankan %s...\n' "${check##*/}"
  docker cp "$check" "$cid:/tmp/check.sql"
  run_sql /tmp/check.sql
done
printf 'PASS: semua migrasi dan pemeriksaan SQL lokal selesai.\n'
