#!/bin/sh
# Docker init script (runs once, when the db volume is first created).
# Applies the local Supabase shim, then every migration, in order.
set -eu
for f in /kwamz/supabase/local/*.sql /kwamz/supabase/migrations/*.sql; do
  echo "applying $f"
  psql -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB" -f "$f"
done
