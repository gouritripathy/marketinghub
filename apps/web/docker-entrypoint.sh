#!/bin/sh
set -e

LOCKFILE="/app/pnpm-lock.yaml"
LOCK_HASH_FILE="/app/node_modules/.pnpm-lock-hash"
CURRENT_LOCK_HASH=""
if [ -f "$LOCKFILE" ]; then
  CURRENT_LOCK_HASH="$(sha256sum "$LOCKFILE" | cut -d ' ' -f1)"
fi

if [ ! -d "/app/node_modules/.pnpm" ] || \
  [ ! -d "/app/apps/web/node_modules/next" ] || \
  [ ! -f "$LOCK_HASH_FILE" ] || \
  [ -n "$CURRENT_LOCK_HASH" ] && [ "$CURRENT_LOCK_HASH" != "$(cat "$LOCK_HASH_FILE")" ]; then
  export CI=1
  export PNPM_CONFIG_CONFIRM_MODULES_PURGE=false
  pnpm install --prod=false --force
  if [ -n "$CURRENT_LOCK_HASH" ]; then
    printf "%s" "$CURRENT_LOCK_HASH" > "$LOCK_HASH_FILE"
  fi
fi

exec "$@"
