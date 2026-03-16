FROM node:20-alpine AS base
WORKDIR /app
RUN corepack enable

FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json tsconfig.base.json ./
COPY packages ./packages
COPY services ./services
RUN pnpm install --frozen-lockfile

FROM deps AS build
RUN pnpm --filter @soulism/audit-ledger-service... build

FROM node:20-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
COPY --from=deps /app/node_modules ./node_modules
COPY --from=build /app/packages ./packages
COPY --from=deps /app/services/trust-safety/audit-ledger-service/node_modules ./services/trust-safety/audit-ledger-service/node_modules
COPY --from=build /app/services/trust-safety/audit-ledger-service/dist ./services/trust-safety/audit-ledger-service/dist
COPY services/trust-safety/audit-ledger-service/package.json ./services/trust-safety/audit-ledger-service/package.json
WORKDIR /app/services/trust-safety/audit-ledger-service
EXPOSE 4003
CMD ["node", "dist/main.js"]
