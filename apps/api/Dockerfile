FROM node:20-slim

WORKDIR /app

RUN corepack enable

COPY package.json pnpm-workspace.yaml tsconfig.base.json ./
COPY apps/api/package.json apps/api/tsconfig.json apps/api/.env.example ./apps/api/
COPY apps/api/docker-entrypoint.sh ./apps/api/docker-entrypoint.sh
COPY packages/db/package.json packages/db/tsconfig.json packages/db/.env.example ./packages/db/
COPY packages/shared/package.json packages/shared/tsconfig.json ./packages/shared/

RUN pnpm install

COPY apps/api ./apps/api
COPY packages/db ./packages/db
COPY packages/shared ./packages/shared

RUN chmod +x ./apps/api/docker-entrypoint.sh
RUN pnpm --filter @marketinghub/db prisma:generate
RUN pnpm --filter @marketinghub/api build

EXPOSE 4000

ENTRYPOINT ["sh", "-c", "./apps/api/docker-entrypoint.sh \"$@\"", "--"]
CMD ["pnpm", "--filter", "@marketinghub/api", "start"]
