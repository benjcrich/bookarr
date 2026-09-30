import type { AppSettings, ProwlarrIndexer, ProwlarrRelease } from "../domain/types.js";

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

  async search(query: string, type = "search"): Promise<ProwlarrRelease[]> {
    if (!this.configured) return mockSearch(query);
    try {
      const qs = new URLSearchParams({ query, type });
      const res = await this.request(`/api/v1/search?${qs}`);
      if (!res.ok) return mockSearch(query);
      const data = (await res.json()) as Array<Record<string, unknown>>;
      return data.map(mapRelease);
    } catch {
      return mockSearch(query);
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
        return {
          accepted: false,
          mode: "live",
          detail: `Prowlarr grab failed: HTTP ${res.status} ${text}`,
        };
      }
      return { accepted: true, mode: "live", detail: "Release sent via Prowlarr." };
    } catch (err) {
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
  ];
}

function mockSearch(query: string): ProwlarrRelease[] {
  const q = query.trim() || "audiobook";
  return [
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
  ];
}

function slug(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "title";
}

export function createProwlarrFromSettings(settings: AppSettings): ProwlarrClient {
  return new ProwlarrClient(settings.prowlarrUrl, settings.prowlarrApiKey);
}
