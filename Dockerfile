FROM oven/bun:1.4.0 AS build
WORKDIR /app

COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

COPY tsconfig.json ./
COPY shared ./shared
COPY server ./server
COPY web ./web
RUN bun run build

FROM oven/bun:1.4.0-slim AS runtime
WORKDIR /app

COPY package.json bun.lock ./
RUN bun install --production --frozen-lockfile

COPY shared ./shared
COPY server ./server
COPY web/src/strings.ts ./web/src/strings.ts
COPY --from=build /app/web/dist ./web/dist

ENV NODE_ENV=production
USER bun
ARG PORT=3000
EXPOSE 3000

CMD ["bun", "server/index.ts"]
