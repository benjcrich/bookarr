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

**Done:** library/wanted/monitored, request approve→library, Prowlarr search/grab, download clients (qBit/SAB/mock), **metadata providers (Open Library + optional Hardcover + mock/cache)**, admin/request UIs, docker-compose.

**Next:** richer rename/tagging, auth roles, quality cutoffs, notifications. See product plan in Context store `docs/audiobook-arr-plan.md`.

## Quick start (local)

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

### Docker Compose

```bash
cp .env.example .env
docker compose up --build
```

Open http://localhost:8787. With `DOWNLOAD_CLIENT_MODE=mock` (default), grab → mock download → import works without live clients.

## Metadata providers

- **Open Library** — used when `METADATA_MODE=auto` (no API key)
- **Hardcover** — optional when `HARDCOVER_API_KEY` is set
- **Mock** — `METADATA_MODE=mock`, or automatic fallback if live providers fail
- Results cached in SQLite (`METADATA_CACHE_TTL_HOURS`, default 24)

Admin → Library and Request UI both search metadata; **Enrich** backfills covers/ISBN/overview on existing books. Audible is not scraped (fragile); ASIN is filled when providers expose it.

## Configuring download clients

1. Set `DOWNLOAD_CLIENT_MODE=auto` (or Admin → Settings → Client mode = auto).
2. **Torrents:** `QBITTORRENT_URL`, username/password, optional `QBITTORRENT_CATEGORY`.
3. **Usenet:** `SABNZBD_URL`, `SABNZBD_API_KEY`, optional `SABNZBD_CATEGORY`.
4. Save in Admin → Settings, or restart with env vars.

Protocol routing: `torrent` → qBittorrent (or mock); `usenet` → SABnzbd (or mock).

On completion Bookarr runs an import hook under `BOOKARR_LIBRARY_ROOT` as `Author/Title/`. If the client output path is not readable locally, it **stubs** gracefully (creates the folder + `.bookarr-imported` marker).

## Environment variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `8787` | API listen port |
| `HOST` | `0.0.0.0` | Bind address |
| `BOOKARR_DB_PATH` | `./data/bookarr.db` | SQLite path |
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

Settings can also be edited in **Admin → Settings** (env wins on boot when set).

## Key API routes

- `GET /api/health` — Prowlarr + download-client health
- `GET/POST /api/books`, requests, search, grab
- `GET /api/downloads`, `POST /api/downloads/poll`
- `GET /api/download-clients`
- `GET /api/metadata/search?q=`, `POST /api/books/:id/enrich`
- `GET/PUT /api/settings`

## Request → library flow

1. User submits a request in `/request`
2. Admin approves in `/admin/requests`
3. Audiobook marked **wanted/monitored**
4. Search/grab sends release to download client
5. Poller updates progress; on complete → import hook → **available**

## License

MIT (scaffold).
