# syntax=docker/dockerfile:1

# --- Build -------------------------------------------------------------------
FROM oven/bun:1.3 AS build
WORKDIR /app

COPY package.json bun.lock ./
# Scripts are skipped here because `nuxt prepare` needs the source; the build prepares itself.
RUN bun install --frozen-lockfile --ignore-scripts

COPY . .
RUN bun run build

# --- Runtime -----------------------------------------------------------------
# Only the built server is copied: it bundles its dependencies, including MuPDF's WebAssembly.
FROM oven/bun:1.3-slim AS runtime
WORKDIR /app

ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=3000 \
    NUXT_UPLOADS_DIR=/data/uploads

COPY --from=build --chown=bun:bun /app/.output ./.output
RUN mkdir -p /data/uploads && chown -R bun:bun /data

USER bun
VOLUME ["/data"]
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD ["bun", "-e", "fetch('http://127.0.0.1:' + (process.env.PORT || 3000) + '/').then(r => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"]

CMD ["bun", ".output/server/index.mjs"]
