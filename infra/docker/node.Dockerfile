# syntax=docker/dockerfile:1.7

FROM node:20-alpine AS base
WORKDIR /app
ENV NODE_ENV=production
RUN corepack enable

FROM base AS deps
COPY . .
RUN pnpm install --frozen-lockfile

FROM deps AS build
ARG TARGET_PATH=services/edge/api-gateway
RUN pnpm --filter "./${TARGET_PATH}" build

FROM node:20-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
RUN addgroup -S app && adduser -S app -G app
ARG TARGET_PATH=services/edge/api-gateway
COPY --from=deps /app/node_modules ./node_modules
COPY --from=build /app/${TARGET_PATH}/dist ./dist
COPY --from=build /app/${TARGET_PATH}/package.json ./package.json
USER app
EXPOSE 3000
CMD ["node", "dist/main.js"]
