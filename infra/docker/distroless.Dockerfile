FROM node:20-alpine AS build
WORKDIR /app
ENV NODE_ENV=production
RUN corepack enable
COPY . .
RUN pnpm install --frozen-lockfile && pnpm -r build

FROM gcr.io/distroless/nodejs20-debian12:nonroot
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app/services/edge/api-gateway/dist ./dist
COPY --from=build /app/services/edge/api-gateway/package.json ./package.json
EXPOSE 3000
CMD ["dist/main.js"]
