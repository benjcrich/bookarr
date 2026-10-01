import type Database from "better-sqlite3";
import type { AppSettings, MetadataResult } from "../../domain/types.js";
import { log } from "../../log.js";
import { HardcoverProvider } from "./hardcover.js";
import { MockMetadataProvider } from "./mock.js";
import { OpenLibraryProvider } from "./openlibrary.js";

export class MetadataService {
  private mock = new MockMetadataProvider();
  private openLibrary = new OpenLibraryProvider();
  private hardcover: HardcoverProvider;

  constructor(
    private db: Database.Database,
    settings: AppSettings
  ) {
    this.hardcover = new HardcoverProvider(settings.hardcoverApiKey);
  }

  updateFromSettings(settings: AppSettings): void {
    this.hardcover.updateApiKey(settings.hardcoverApiKey);
  }

  async health(settings: AppSettings) {
    return {
      mode: settings.metadataMode,
      openLibrary: settings.metadataMode === "mock" ? "skipped" : "enabled",
      hardcover: this.hardcover.configured
        ? settings.metadataMode === "mock"
          ? "configured-but-mock-mode"
          : "enabled"
        : "not-configured",
      cacheTtlHours: settings.metadataCacheTtlHours,
    };
  }

  async search(
    query: string,
    settings: AppSettings,
    opts?: { limit?: number; bypassCache?: boolean }
  ): Promise<{ results: MetadataResult[]; cached: boolean; providers: string[] }> {
    const q = query.trim();
    const limit = opts?.limit ?? 8;
    if (!q) return { results: [], cached: false, providers: [] };

    const cacheKey = `search:${settings.metadataMode}:${q.toLowerCase()}:${limit}`;
    if (!opts?.bypassCache) {
      const cached = this.readCache(cacheKey);
      if (cached) return { results: cached, cached: true, providers: ["cache"] };
    }

    if (settings.metadataMode === "mock") {
      const results = await this.mock.search(q, limit);
      this.writeCache(cacheKey, results, settings.metadataCacheTtlHours);
      return { results, cached: false, providers: ["mock"] };
    }

    const providers: string[] = [];
    const merged: MetadataResult[] = [];
    const seen = new Set<string>();

    const pushAll = (items: MetadataResult[], name: string) => {
      providers.push(name);
      for (const item of items) {
        const key = `${item.title.toLowerCase()}::${item.authorName.toLowerCase()}`;
        if (seen.has(key)) continue;
        seen.add(key);
        merged.push(item);
      }
    };

    try {
      pushAll(await this.openLibrary.search(q, limit), "openlibrary");
    } catch (err) {
      log.warn("metadata.lookup.failed", {
        provider: "openlibrary",
        query: q,
        error: (err as Error).message,
      });
      providers.push(`openlibrary:error:${(err as Error).message}`);
    }

    if (this.hardcover.configured && merged.length < limit) {
      try {
        pushAll(await this.hardcover.search(q, limit), "hardcover");
      } catch (err) {
        log.warn("metadata.lookup.failed", {
          provider: "hardcover",
          query: q,
          error: (err as Error).message,
        });
        providers.push(`hardcover:error:${(err as Error).message}`);
      }
    }

    if (merged.length === 0) {
      pushAll(await this.mock.search(q, limit), "mock-fallback");
      log.info("metadata.lookup.fallback", { query: q, provider: "mock" });
    }

    const results = merged.slice(0, limit);
    this.writeCache(cacheKey, results, settings.metadataCacheTtlHours);
    log.debug("metadata.search", {
      query: q,
      results: results.length,
      providers: providers.join(","),
    });
    return { results, cached: false, providers };
  }

  private readCache(key: string): MetadataResult[] | null {
    const row = this.db
      .prepare(
        `SELECT payload FROM metadata_cache
         WHERE cache_key = ? AND datetime(expires_at) > datetime('now')`
      )
      .get(key) as { payload: string } | undefined;
    if (!row) return null;
    try {
      return JSON.parse(row.payload) as MetadataResult[];
    } catch {
      return null;
    }
  }

  private writeCache(key: string, results: MetadataResult[], ttlHours: number): void {
    const ttl = Math.max(1, ttlHours || 24);
    this.db
      .prepare(
        `INSERT INTO metadata_cache (cache_key, payload, expires_at)
         VALUES (?, ?, datetime('now', ?))
         ON CONFLICT(cache_key) DO UPDATE SET
           payload = excluded.payload,
           expires_at = excluded.expires_at,
           created_at = datetime('now')`
      )
      .run(key, JSON.stringify(results), `+${ttl} hours`);
  }
}
