FROM node:20-slim

WORKDIR /app

RUN corepack enable

COPY package.json pnpm-workspace.yaml tsconfig.base.json ./
COPY apps/web/package.json apps/web/tsconfig.json apps/web/.env.example ./apps/web/
COPY packages/shared/package.json packages/shared/tsconfig.json ./packages/shared/

RUN pnpm install

COPY apps/web ./apps/web
COPY packages/shared ./packages/shared

RUN pnpm --filter @marketinghub/web build

EXPOSE 3000

CMD ["pnpm", "--filter", "@marketinghub/web", "start"]
