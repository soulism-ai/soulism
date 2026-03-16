FROM node:20-alpine AS base
WORKDIR /app
RUN corepack enable

FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json tsconfig.base.json ./
COPY packages ./packages
COPY services ./services
RUN pnpm install --frozen-lockfile

FROM deps AS build
RUN pnpm --filter @soulism/tool-files-service... build

FROM node:20-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
COPY --from=deps /app/node_modules ./node_modules
COPY --from=build /app/packages ./packages
COPY --from=deps /app/services/mcp/tool-files-service/node_modules ./services/mcp/tool-files-service/node_modules
COPY --from=build /app/services/mcp/tool-files-service/dist ./services/mcp/tool-files-service/dist
COPY services/mcp/tool-files-service/package.json ./services/mcp/tool-files-service/package.json
WORKDIR /app/services/mcp/tool-files-service
EXPOSE 3003
CMD ["node", "dist/main.js"]
