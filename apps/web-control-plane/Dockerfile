FROM node:20-alpine AS base
WORKDIR /app
RUN corepack enable

FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json tsconfig.base.json ./
COPY apps ./apps
COPY packages ./packages
RUN pnpm install --frozen-lockfile

FROM deps AS build
ENV NEXT_TELEMETRY_DISABLED=1
RUN pnpm --filter @soulism/web-control-plane build

FROM node:20-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=80
ENV HOSTNAME=0.0.0.0
COPY --from=build /app/apps/web-control-plane/.next/standalone ./
COPY --from=build /app/apps/web-control-plane/.next/static ./apps/web-control-plane/.next/static
COPY --from=build /app/apps/web-control-plane/public ./apps/web-control-plane/public
EXPOSE 80
CMD ["node", "apps/web-control-plane/server.js"]
