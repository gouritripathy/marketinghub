#!/bin/sh
set -e

# Install dependencies into mounted volumes if missing
if [ ! -x "node_modules/.bin/tsx" ] || [ ! -d "packages/db/node_modules/prisma" ]; then
  CI=1 pnpm install --prod=false
fi

DB_HOST="${DB_HOST:-db}"
DB_PORT="${DB_PORT:-5432}"
echo "Waiting for database at ${DB_HOST}:${DB_PORT}..."
until nc -z "$DB_HOST" "$DB_PORT"; do
  sleep 1
done

pnpm --filter @marketinghub/db prisma:generate

if [ -d "packages/db/prisma/migrations" ] && [ "$(ls -A packages/db/prisma/migrations 2>/dev/null)" ]; then
  pnpm --filter @marketinghub/db prisma:deploy
else
  # Avoid interactive migrate dev in containers
  pnpm --filter @marketinghub/db exec prisma db push
fi

pnpm --filter @marketinghub/db prisma:seed

exec "$@"
