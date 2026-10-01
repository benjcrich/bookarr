import type { AppSettings, ProwlarrIndexer, ProwlarrRelease } from "../domain/types.js";
import { parseIdList } from "../domain/types.js";
import { log } from "../log.js";

export interface ProwlarrSearchOptions {
  type?: string;
  /** When non-empty, restrict search to these Prowlarr indexer IDs */
  indexerIds?: number[];
  /** When non-empty, restrict search to these Newznab/Torznab categories */
  categories?: number[];
}

/** Build Prowlarr GET /api/v1/search query string (exported for tests). */
export function buildProwlarrSearchQuery(query: string, opts: ProwlarrSearchOptions = {}): string {
  const qs = new URLSearchParams();
  qs.set("query", query);
  qs.set("type", opts.type ?? "search");
  const indexerIds = parseIdList(opts.indexerIds);
  const categories = parseIdList(opts.categories);
  for (const id of indexerIds) qs.append("indexerIds", String(id));
  for (const id of categories) qs.append("categories", String(id));
  return qs.toString();
}

export class ProwlarrClient {
  constructor(
    private baseUrl: string,
    private apiKey: string
  ) {}

  updateConfig(url: string, apiKey: string): void {
    this.baseUrl = url.replace(/\/$/, "");
    this.apiKey = apiKey;
  }

  get configured(): boolean {
    return Boolean(this.baseUrl && this.apiKey);
  }

  async health(): Promise<{ ok: boolean; mode: "live" | "mock"; detail: string }> {
    if (!this.configured) {
      return { ok: true, mode: "mock", detail: "Prowlarr not configured; using mock indexers." };
    }
    try {
      const res = await this.request("/api/v1/health");
      if (!res.ok) {
        return {
          ok: false,
          mode: "mock",
          detail: `Prowlarr health HTTP ${res.status}; falling back to mock.`,
        };
      }
      return { ok: true, mode: "live", detail: "Prowlarr reachable." };
    } catch (err) {
      return {
        ok: false,
        mode: "mock",
        detail: `Prowlarr unreachable (${(err as Error).message}); using mock.`,
      };
    }
  }

  async listIndexers(): Promise<ProwlarrIndexer[]> {
    if (!this.configured) return mockIndexers();
    try {
      const res = await this.request("/api/v1/indexer");
      if (!res.ok) return mockIndexers();
      const data = (await res.json()) as Array<Record<string, unknown>>;
      return data.map((i) => ({
        id: Number(i.id),
        name: String(i.name ?? "Indexer"),
        protocol: String(i.protocol ?? "torrent"),
        enable: Boolean(i.enable),
        priority: Number(i.priority ?? 25),
      }));
    } catch {
      return mockIndexers();
    }
  }

  async search(query: string, opts: ProwlarrSearchOptions = {}): Promise<ProwlarrRelease[]> {
    const indexerIds = parseIdList(opts.indexerIds);
    const categories = parseIdList(opts.categories);
    const filters = {
      indexerIds: indexerIds.length ? indexerIds : "all",
      categories: categories.length ? categories : "none",
    };
    if (!this.configured) {
      const results = mockSearch(query, { indexerIds, categories });
      log.info("prowlarr.search", {
        mode: "mock",
        query,
        ...filters,
        results: results.length,
      });
      return results;
    }
    try {
      const qs = buildProwlarrSearchQuery(query, {
        type: opts.type ?? "search",
        indexerIds,
        categories,
      });
      const res = await this.request(`/api/v1/search?${qs}`);
      if (!res.ok) {
        log.warn("prowlarr.search.http_error", {
          query,
          ...filters,
          status: res.status,
        });
        const results = mockSearch(query, { indexerIds, categories });
        log.info("prowlarr.search", {
          mode: "mock-fallback",
          query,
          ...filters,
          results: results.length,
        });
        return results;
      }
      const data = (await res.json()) as Array<Record<string, unknown>>;
      const results = data.map(mapRelease);
      log.info("prowlarr.search", {
        mode: "live",
        query,
        ...filters,
        results: results.length,
      });
      return results;
    } catch (err) {
      log.warn("prowlarr.search.error", {
        query,
        ...filters,
        error: (err as Error).message,
      });
      const results = mockSearch(query, { indexerIds, categories });
      log.info("prowlarr.search", {
        mode: "mock-fallback",
        query,
        ...filters,
        results: results.length,
      });
      return results;
    }
  }

  /**
   * Grab path: POST release to Prowlarr download endpoint when live;
   * otherwise return a synthetic success for the pipeline to enqueue locally.
   */
  async grab(release: Pick<ProwlarrRelease, "guid" | "indexerId">): Promise<{
    accepted: boolean;
    mode: "live" | "mock";
    detail: string;
  }> {
    if (!this.configured) {
      log.info("prowlarr.grab", {
        mode: "mock",
        indexerId: release.indexerId,
        guid: release.guid,
      });
      return {
        accepted: true,
        mode: "mock",
        detail: "Mock grab accepted (Prowlarr not configured).",
      };
    }
    try {
      const res = await this.request("/api/v1/search", {
        method: "POST",
        body: JSON.stringify({ guid: release.guid, indexerId: release.indexerId }),
      });
      if (!res.ok) {
        const text = await res.text();
        log.warn("prowlarr.grab.failed", {
          indexerId: release.indexerId,
          status: res.status,
          detail: text.slice(0, 200),
        });
        return {
          accepted: false,
          mode: "live",
          detail: `Prowlarr grab failed: HTTP ${res.status} ${text}`,
        };
      }
      log.info("prowlarr.grab", {
        mode: "live",
        indexerId: release.indexerId,
        guid: release.guid,
      });
      return { accepted: true, mode: "live", detail: "Release sent via Prowlarr." };
    } catch (err) {
      log.warn("prowlarr.grab.unreachable", {
        indexerId: release.indexerId,
        error: (err as Error).message,
      });
      return {
        accepted: true,
        mode: "mock",
        detail: `Prowlarr grab unreachable; queued locally (${(err as Error).message}).`,
      };
    }
  }

  private async request(path: string, init: RequestInit = {}): Promise<Response> {
    const url = `${this.baseUrl.replace(/\/$/, "")}${path}`;
    const headers = new Headers(init.headers);
    headers.set("X-Api-Key", this.apiKey);
    if (init.body && !headers.has("Content-Type")) {
      headers.set("Content-Type", "application/json");
    }
    return fetch(url, { ...init, headers, signal: AbortSignal.timeout(8000) });
  }
}

function mapRelease(r: Record<string, unknown>): ProwlarrRelease {
  return {
    guid: String(r.guid ?? r.infoUrl ?? crypto.randomUUID()),
    title: String(r.title ?? "Unknown"),
    size: Number(r.size ?? 0),
    indexerId: Number(r.indexerId ?? 0),
    indexer: String(r.indexer ?? r.indexerName ?? "unknown"),
    protocol: String(r.protocol ?? "torrent"),
    publishDate: String(r.publishDate ?? new Date().toISOString()),
    downloadUrl: r.downloadUrl ? String(r.downloadUrl) : undefined,
    magnetUrl: r.magnetUrl ? String(r.magnetUrl) : undefined,
    infoUrl: r.infoUrl ? String(r.infoUrl) : undefined,
    seeders: r.seeders != null ? Number(r.seeders) : undefined,
    leechers: r.leechers != null ? Number(r.leechers) : undefined,
  };
}

function mockIndexers(): ProwlarrIndexer[] {
  return [
    { id: 1, name: "Mock Audiobook Tracker", protocol: "torrent", enable: true, priority: 10 },
    { id: 2, name: "Mock Usenet Books", protocol: "usenet", enable: true, priority: 20 },
    { id: 3, name: "Mock General Indexer", protocol: "torrent", enable: true, priority: 30 },
  ];
}

function mockSearch(
  query: string,
  filters: { indexerIds: number[]; categories: number[] }
): ProwlarrRelease[] {
  const q = query.trim() || "audiobook";
  let results: ProwlarrRelease[] = [
    {
      guid: `mock-m4b-${slug(q)}`,
      title: `${q} [M4B] [64kbps] [Mock]`,
      size: 420_000_000,
      indexerId: 1,
      indexer: "Mock Audiobook Tracker",
      protocol: "torrent",
      publishDate: new Date().toISOString(),
      downloadUrl: `https://example.invalid/download/${encodeURIComponent(q)}.torrent`,
      seeders: 12,
      leechers: 1,
    },
    {
      guid: `mock-mp3-${slug(q)}`,
      title: `${q} MP3 128kbps Mock`,
      size: 510_000_000,
      indexerId: 2,
      indexer: "Mock Usenet Books",
      protocol: "usenet",
      publishDate: new Date().toISOString(),
      downloadUrl: `https://example.invalid/nzb/${encodeURIComponent(q)}.nzb`,
    },
    {
      guid: `mock-ebook-${slug(q)}`,
      title: `${q} EPUB Mock (not audiobook)`,
      size: 2_000_000,
      indexerId: 3,
      indexer: "Mock General Indexer",
      protocol: "torrent",
      publishDate: new Date().toISOString(),
      downloadUrl: `https://example.invalid/download/${encodeURIComponent(q)}.epub.torrent`,
      seeders: 50,
      leechers: 2,
    },
  ];
  if (filters.indexerIds.length > 0) {
    const allow = new Set(filters.indexerIds);
    results = results.filter((r) => allow.has(r.indexerId));
  }
  // Categories are applied server-side by live Prowlarr; for mock, treat 3030 as audiobook-only
  if (filters.categories.length > 0) {
    const audiobookCats = new Set([3030, 7020]);
    const wantsAudiobook = filters.categories.some((c) => audiobookCats.has(c));
    if (wantsAudiobook) {
      results = results.filter((r) => r.indexerId === 1 || r.indexerId === 2);
    }
  }
  return results;
}

function slug(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "title";
}

export function createProwlarrFromSettings(settings: AppSettings): ProwlarrClient {
  return new ProwlarrClient(settings.prowlarrUrl, settings.prowlarrApiKey);
}
