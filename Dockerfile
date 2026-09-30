FROM node:22-bookworm-slim AS deps
WORKDIR /app
RUN apt-get update && apt-get install -y python3 make g++ && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json* ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
RUN npm install

FROM deps AS build
COPY . .
RUN npm run build -w @bookarr/web && npm run build -w @bookarr/api

FROM node:22-bookworm-slim AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=8787
ENV HOST=0.0.0.0
ENV BOOKARR_DB_PATH=/data/bookarr.db
ENV BOOKARR_LIBRARY_ROOT=/data/audiobooks
RUN apt-get update && apt-get install -y python3 make g++ && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json* ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
RUN npm install --omit=dev
COPY --from=build /app/apps/api/dist apps/api/dist
COPY --from=build /app/apps/web/dist apps/web/dist
# Static files are resolved relative to API dist → ../../web/dist
RUN mkdir -p /data
EXPOSE 8787
CMD ["node", "apps/api/dist/index.js"]
