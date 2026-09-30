# Bookarr

Radarr/Sonarr-style **audiobook** automation: track wanted titles, search/grab via **Prowlarr**, and expose an Overseerr-style **request UI** for non-admins.

## Architecture

| Piece | Stack | Role |
|-------|--------|------|
| `apps/api` | TypeScript, Fastify, SQLite | Domain + REST API + Prowlarr client |
| `apps/web` | React, Vite, React Router | Admin UI (`/admin`) + Request UI (`/request`) |
| Compose | Node image | Single process serves API + built SPA |

```
Request UI ──┐
             ├──► Bookarr API ──► Prowlarr (indexers) ──► download jobs (hooks)
Admin UI ────┘         │
                       └── SQLite (authors, books, requests, downloads, settings)
```

**Done in this slice:** library/wanted/monitored domain, request approve→library pipeline, Prowlarr search/grab (live or mock fallback), admin + request UIs, docker-compose.

**Next:** download-client adapters, metadata providers, auth roles, quality cutoffs, library import/rename. See also the product plan in the agent Context store (`docs/audiobook-arr-plan.md`).

## Quick start (local)

```bash
cp .env.example .env
npm install
npm run dev:api    # http://127.0.0.1:8787
npm run dev:web    # http://127.0.0.1:5173 (proxies /api)
```

Or production-style (API serves built UI):

```bash
npm install
npm run build
npm start          # http://127.0.0.1:8787
```

### Docker Compose

```bash
cp .env.example .env
# optional: set PROWLARR_URL / PROWLARR_API_KEY
docker compose up --build
```

Open http://localhost:8787 — landing page links to **Admin** and **Request**.

Without Prowlarr configured, Bookarr uses **mock indexers** so search/grab still works end-to-end.

## Environment variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `8787` | API listen port |
| `HOST` | `0.0.0.0` | Bind address |
| `BOOKARR_DB_PATH` | `./data/bookarr.db` | SQLite path |
| `BOOKARR_LIBRARY_ROOT` | `/data/audiobooks` | Future import root |
| `PROWLARR_URL` | _(empty)_ | e.g. `http://localhost:9696` |
| `PROWLARR_API_KEY` | _(empty)_ | Prowlarr Settings → General → API Key |

Settings can also be edited in **Admin → Settings** (persisted in SQLite; env wins on boot when set).

## Key API routes

- `GET /api/health` — service + Prowlarr mode
- `GET/POST /api/books` — library
- `GET/POST /api/requests`, `POST /api/requests/:id/approve|deny`
- `GET /api/indexers`, `GET /api/search?q=`, `POST /api/grab`
- `GET /api/downloads`, `GET/PUT /api/settings`

## Request → library flow

1. User submits a request in `/request`
2. Admin approves in `/admin/requests`
3. Audiobook is created as **wanted/monitored**
4. If auto-search is on, Bookarr searches Prowlarr and enqueues a **download job** (grab)

## License

MIT (scaffold).
