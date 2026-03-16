FROM node:20-alpine AS base
WORKDIR /app
RUN corepack enable

FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json tsconfig.base.json ./
COPY packages ./packages
COPY services ./services
RUN pnpm install --frozen-lockfile

FROM deps AS build
RUN pnpm --filter @soulism/persona-registry-service... build

FROM node:20-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
COPY --from=deps /app/node_modules ./node_modules
COPY --from=build /app/packages ./packages
COPY --from=deps /app/services/mcp/persona-registry-service/node_modules ./services/mcp/persona-registry-service/node_modules
COPY --from=build /app/services/mcp/persona-registry-service/dist ./services/mcp/persona-registry-service/dist
COPY services/mcp/persona-registry-service/package.json ./services/mcp/persona-registry-service/package.json
COPY build/bootstrap-packs ./bootstrap/packs
COPY services/mcp/persona-registry-service/docker-entrypoint.sh ./services/mcp/persona-registry-service/docker-entrypoint.sh
RUN chmod +x ./services/mcp/persona-registry-service/docker-entrypoint.sh
WORKDIR /app/services/mcp/persona-registry-service
EXPOSE 3001
CMD ["./docker-entrypoint.sh"]
