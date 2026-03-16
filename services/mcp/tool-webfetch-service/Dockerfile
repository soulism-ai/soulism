FROM node:20-alpine AS base
WORKDIR /app
RUN corepack enable

FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json tsconfig.base.json ./
COPY packages ./packages
COPY services ./services
RUN pnpm install --frozen-lockfile

FROM deps AS build
RUN pnpm --filter @soulism/tool-webfetch-service... build

FROM node:20-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
COPY --from=deps /app/node_modules ./node_modules
COPY --from=build /app/packages ./packages
COPY --from=deps /app/services/mcp/tool-webfetch-service/node_modules ./services/mcp/tool-webfetch-service/node_modules
COPY --from=build /app/services/mcp/tool-webfetch-service/dist ./services/mcp/tool-webfetch-service/dist
COPY services/mcp/tool-webfetch-service/package.json ./services/mcp/tool-webfetch-service/package.json
WORKDIR /app/services/mcp/tool-webfetch-service
EXPOSE 3004
CMD ["node", "dist/main.js"]
