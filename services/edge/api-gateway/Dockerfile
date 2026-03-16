FROM node:20-alpine AS base
WORKDIR /app
RUN corepack enable

FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json tsconfig.base.json ./
COPY packages ./packages
COPY services ./services
RUN pnpm install --frozen-lockfile

FROM deps AS build
RUN pnpm --filter @soulism/api-gateway... build

FROM node:20-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
COPY --from=deps /app/node_modules ./node_modules
COPY --from=build /app/packages ./packages
COPY --from=deps /app/services/edge/api-gateway/node_modules ./services/edge/api-gateway/node_modules
COPY --from=build /app/services/edge/api-gateway/dist ./services/edge/api-gateway/dist
COPY services/edge/api-gateway/package.json ./services/edge/api-gateway/package.json
COPY ci/policies ./ci/policies
WORKDIR /app/services/edge/api-gateway
EXPOSE 8080
CMD ["node", "dist/main.js"]
