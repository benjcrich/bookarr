# Bookarr

Radarr/Sonarr-style **audiobook** automation: track wanted titles, search/grab via **Prowlarr**, send to **qBittorrent / SABnzbd**, import into a library, and expose an Overseerr-style **request UI**.

## Architecture

| Piece | Stack | Role |
|-------|--------|------|
| `apps/api` | TypeScript, Fastify, SQLite | Domain, REST, Prowlarr, download clients, metadata |
| `apps/web` | React, Vite, React Router | Admin UI (`/admin`) + Request UI (`/request`) |
| Compose | Node image | Single process serves API + built SPA |

```
Request UI ──┐
             ├──► Bookarr API ──► Prowlarr (indexers)
Admin UI ────┘         │
                       ├──► qBittorrent / SABnzbd / mock → import
                       ├──► Open Library / Hardcover / mock metadata
                       └── SQLite
```

**Done:** library/wanted/monitored, request approve→library, Prowlarr search/grab, download clients (qBit/SAB/mock), metadata providers, **published GHCR image + pull-only compose**, **Admin Settings UI** (DB-persisted, hot-reload), admin/request UIs.

**Next:** richer rename/tagging, auth roles, quality cutoffs, notifications. See product plan in Context store `docs/audiobook-arr-plan.md`.

## Run without cloning (recommended)

Published image: **`ghcr.io/benjcrich/bookarr`** (tags: `latest` on `main`, semver on `v*` tags, `sha-*`).

```bash
# fetch compose + env template only (no git clone)
curl -fsSL https://raw.githubusercontent.com/benjcrich/bookarr/main/deploy/docker-compose.yml -o docker-compose.yml
curl -fsSL https://raw.githubusercontent.com/benjcrich/bookarr/main/deploy/.env.example -o .env

# edit .env for compose-level knobs + optional first-boot bootstrap secrets
docker compose up -d
```

Open http://localhost:8787 — configure Prowlarr, download clients, and metadata in **Admin → Settings** (no restart needed for typical changes).

| Path / setting | Purpose |
|----------------|---------|
| Volume `bookarr-data` → `/data` | SQLite at `/data/bookarr.db`, library at `/data/audiobooks` |
| `BOOKARR_TAG` | Image tag (default `latest`) — compose-only |
| `BOOKARR_PORT` | Host port (default `8787`) — compose-only |
| Optional `PROWLARR_*`, `QBITTORRENT_*`, `SABNZBD_*`, `METADATA_*` | First-boot bootstrap into SQLite; UI saves win afterward |

Compose file lives at [`deploy/docker-compose.yml`](deploy/docker-compose.yml) (pull-only — no `build:`).

### GHCR visibility (one-time)

After the first successful publish workflow on `main`:

1. Open https://github.com/benjcrich/bookarr/pkgs/container/bookarr  
2. **Package settings → Change visibility → Public** (or grant pull access to your servers)  
3. Private pulls need `docker login ghcr.io` with a PAT that has `read:packages`

Until the package is public, unauthenticated `docker pull` may fail with 403.

## Quick start (local from source)

```bash
cp .env.example .env
npm install
npm test                 # mock download pipeline tests
npm run dev:api          # http://127.0.0.1:8787
npm run dev:web          # http://127.0.0.1:5173 (proxies /api)
```

Or production-style (API serves built UI):

```bash
npm install
npm run build
npm start                # http://127.0.0.1:8787
```

### Docker Compose (build from this repo)

```bash
cp .env.example .env
docker compose up --build
```

Root `docker-compose.yml` builds locally. Prefer [Run without cloning](#run-without-cloning-recommended) on servers.

## Metadata providers

- **Open Library** — used when `METADATA_MODE=auto` (no API key)
- **Hardcover** — optional when `HARDCOVER_API_KEY` is set
- **Mock** — `METADATA_MODE=mock`, or automatic fallback if live providers fail
- Results cached in SQLite (`METADATA_CACHE_TTL_HOURS`, default 24)

Admin → Library and Request UI both search metadata; **Enrich** backfills covers/ISBN/overview on existing books. Audible is not scraped (fragile); ASIN is filled when providers expose it.

## Settings precedence (UI wins)

Runtime settings are stored in SQLite and edited in **Admin → Settings**. Process env is used only to **bootstrap missing keys** on first boot (`INSERT OR IGNORE`). Saving in the UI hot-reloads Prowlarr, download clients, metadata, and poll interval — no container restart for typical changes.

**Precedence:** UI/DB value → env (only if key absent from DB) → built-in default.

Secrets in `GET /api/settings` are masked (`••••••••` + `*Set` flags). Leave secret fields blank on save to keep the current value, or use **Clear** / `clearSecrets` to wipe them. Rotate by pasting a new value and saving.

### Editable in Admin → Settings (persisted)

Prowlarr URL/API key · download client mode · qBittorrent · SABnzbd · library root · quality profile id · auto-search on approve · metadata mode · Hardcover key · metadata cache TTL · download poll ms · mock download ms.

### Env-only / compose-level (must stay outside the UI)

| Variable | Why env/compose |
|----------|-----------------|
| `PORT` / `HOST` | Process bind — set before listen |
| `BOOKARR_DB_PATH` | SQLite file path / volume layout |
| `BOOKARR_PORT` / `BOOKARR_TAG` | Host publish port and image tag in compose |
| Volume mounts | Host paths for `/data` (and optional download shares) |

Optional bootstrap env (`PROWLARR_*`, `QBITTORRENT_*`, `SABNZBD_*`, `METADATA_*`, `BOOKARR_LIBRARY_ROOT`, poll/mock ms) seeds the DB when empty — useful for compose secrets on first deploy.

## Configuring download clients

1. Admin → Settings → Client mode = **auto** (or bootstrap `DOWNLOAD_CLIENT_MODE=auto`).
2. **Torrents:** qBittorrent URL, username/password, optional category.
3. **Usenet:** SABnzbd URL, API key, optional category.
4. **Save** — clients hot-reload. Use **Test connections** to verify.

Protocol routing: `torrent` → qBittorrent (or mock); `usenet` → SABnzbd (or mock).

On completion Bookarr runs an import hook under the configured library root as `Author/Title/`. If the client output path is not readable locally, it **stubs** gracefully (creates the folder + `.bookarr-imported` marker).

## Environment variables

### Compose / process (not overwritten by UI)

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `8787` | API listen port |
| `HOST` | `0.0.0.0` | Bind address |
| `BOOKARR_DB_PATH` | `./data/bookarr.db` | SQLite path |
| `BOOKARR_PORT` / `BOOKARR_TAG` | `8787` / `latest` | Deploy compose only |

### Bootstrap into SQLite (UI wins after save)

| Variable | Default | Description |
|----------|---------|-------------|
| `BOOKARR_LIBRARY_ROOT` | `/data/audiobooks` | Import root |
| `BOOKARR_DOWNLOAD_POLL_MS` | `3000` | Background poll interval |
| `BOOKARR_MOCK_DOWNLOAD_MS` | `1500` | Mock client completion delay |
| `PROWLARR_URL` / `PROWLARR_API_KEY` | _(empty)_ | Indexer manager |
| `DOWNLOAD_CLIENT_MODE` | `mock` | `mock` or `auto` |
| `QBITTORRENT_*` | _(empty)_ | URL, user, password, category |
| `SABNZBD_*` | _(empty)_ | URL, API key, category |
| `METADATA_MODE` | `auto` | `auto` or `mock` |
| `HARDCOVER_API_KEY` | _(empty)_ | Optional Hardcover token |
| `METADATA_CACHE_TTL_HOURS` | `24` | Metadata cache TTL |

## Key API routes

- `GET /api/health` — Prowlarr + download-client health
- `GET/POST /api/books`, requests, search, grab
- `GET /api/downloads`, `POST /api/downloads/poll`
- `GET /api/download-clients`
- `GET /api/metadata/search?q=`, `POST /api/books/:id/enrich`
- `GET/PUT /api/settings` — masked secrets; `clearSecrets` to wipe; hot-reload on save
- `POST /api/settings/test` — probe Prowlarr, clients, metadata

## Request → library flow

1. User submits a request in `/request`
2. Admin approves in `/admin/requests`
3. Audiobook marked **wanted/monitored**
4. Search/grab sends release to download client
5. Poller updates progress; on complete → import hook → **available**

## License

MIT (scaffold).
