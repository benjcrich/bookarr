# Bookarr — single-image production build (API serves built SPA)
# Published as ghcr.io/benjcrich/bookarr

FROM node:22-bookworm-slim AS deps
WORKDIR /app
RUN apt-get update \
  && apt-get install -y --no-install-recommends python3 make g++ \
  && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
RUN npm ci

FROM deps AS build
COPY . .
RUN npm run build -w @bookarr/web && npm run build -w @bookarr/api \
  && npm prune --omit=dev

FROM node:22-bookworm-slim AS runner
WORKDIR /app

ENV NODE_ENV=production \
    PORT=8787 \
    HOST=0.0.0.0 \
    BOOKARR_DB_PATH=/data/bookarr.db \
    BOOKARR_LIBRARY_ROOT=/data/audiobooks \
    DOWNLOAD_CLIENT_MODE=mock \
    METADATA_MODE=auto

LABEL org.opencontainers.image.title="Bookarr" \
      org.opencontainers.image.description="Audiobook arr automation (API + admin/request UI)" \
      org.opencontainers.image.source="https://github.com/benjcrich/bookarr" \
      org.opencontainers.image.url="https://github.com/benjcrich/bookarr" \
      org.opencontainers.image.licenses="MIT"

RUN groupadd --gid 1000 bookarr \
  && useradd --uid 1000 --gid bookarr --shell /usr/sbin/nologin --create-home bookarr \
  && mkdir -p /data/audiobooks \
  && chown -R bookarr:bookarr /data

COPY --from=build --chown=bookarr:bookarr /app/package.json ./
COPY --from=build --chown=bookarr:bookarr /app/package-lock.json ./
COPY --from=build --chown=bookarr:bookarr /app/node_modules ./node_modules
COPY --from=build --chown=bookarr:bookarr /app/apps/api/package.json apps/api/
COPY --from=build --chown=bookarr:bookarr /app/apps/web/package.json apps/web/
COPY --from=build --chown=bookarr:bookarr /app/apps/api/dist apps/api/dist
COPY --from=build --chown=bookarr:bookarr /app/apps/web/dist apps/web/dist

USER bookarr
EXPOSE 8787

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||8787)+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "apps/api/dist/index.js"]
