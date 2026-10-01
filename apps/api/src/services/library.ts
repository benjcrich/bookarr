import type Database from "better-sqlite3";
import type {
  AppSettings,
  Audiobook,
  Author,
  BookRequest,
  DownloadJob,
  QualityProfile,
  RequestStatus,
  SecretSettingKey,
} from "../domain/types.js";
import type { DownloadClientRegistry } from "./download-clients/index.js";
import { importCompletedDownload } from "./importer.js";
import type { MetadataService } from "./metadata/index.js";
import type { ProwlarrClient } from "./prowlarr.js";

function mapAuthor(row: Record<string, unknown>): Author {
  return {
    id: Number(row.id),
    name: String(row.name),
    overview: row.overview != null ? String(row.overview) : null,
    createdAt: String(row.created_at),
  };
}

function mapBook(row: Record<string, unknown>): Audiobook {
  return {
    id: Number(row.id),
    title: String(row.title),
    authorId: Number(row.author_id),
    authorName: row.author_name != null ? String(row.author_name) : undefined,
    overview: row.overview != null ? String(row.overview) : null,
    asin: row.asin != null ? String(row.asin) : null,
    isbn: row.isbn != null ? String(row.isbn) : null,
    narrator: row.narrator != null ? String(row.narrator) : null,
    coverUrl: row.cover_url != null ? String(row.cover_url) : null,
    runtimeMinutes: row.runtime_minutes != null ? Number(row.runtime_minutes) : null,
    monitored: Boolean(row.monitored),
    wanted: Boolean(row.wanted),
    status: row.status as Audiobook["status"],
    qualityProfileId: Number(row.quality_profile_id),
    path: row.path != null ? String(row.path) : null,
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

function mapRequest(row: Record<string, unknown>): BookRequest {
  return {
    id: Number(row.id),
    title: String(row.title),
    authorName: String(row.author_name),
    overview: row.overview != null ? String(row.overview) : null,
    asin: row.asin != null ? String(row.asin) : null,
    isbn: row.isbn != null ? String(row.isbn) : null,
    narrator: row.narrator != null ? String(row.narrator) : null,
    coverUrl: row.cover_url != null ? String(row.cover_url) : null,
    requesterName: String(row.requester_name),
    status: row.status as RequestStatus,
    audiobookId: row.audiobook_id != null ? Number(row.audiobook_id) : null,
    denyReason: row.deny_reason != null ? String(row.deny_reason) : null,
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

function mapJob(row: Record<string, unknown>): DownloadJob {
  return {
    id: Number(row.id),
    audiobookId: row.audiobook_id != null ? Number(row.audiobook_id) : null,
    title: String(row.title),
    indexerId: row.indexer_id != null ? Number(row.indexer_id) : null,
    indexerName: row.indexer_name != null ? String(row.indexer_name) : null,
    guid: String(row.guid),
    downloadUrl: row.download_url != null ? String(row.download_url) : null,
    status: row.status as DownloadJob["status"],
    protocol: String(row.protocol),
    size: row.size != null ? Number(row.size) : null,
    error: row.error != null ? String(row.error) : null,
    client: row.client != null ? (String(row.client) as DownloadJob["client"]) : null,
    externalId: row.external_id != null ? String(row.external_id) : null,
    progress: Number(row.progress ?? 0),
    outputPath: row.output_path != null ? String(row.output_path) : null,
    importPath: row.import_path != null ? String(row.import_path) : null,
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

/**
 * Settings precedence for reads:
 * 1) Value persisted in SQLite (Admin UI / prior bootstrap) — wins
 * 2) Process env — only when the key is absent from the DB
 * 3) Built-in default
 *
 * Env is applied at boot via bootstrapEnvIntoDb() with INSERT OR IGNORE,
 * so UI saves are not overwritten on container restart.
 */
function setting(
  map: Record<string, string>,
  key: string,
  envName: string | null,
  fallback = ""
): string {
  if (Object.prototype.hasOwnProperty.call(map, key)) return map[key] ?? "";
  if (envName) {
    const fromEnv = process.env[envName];
    if (fromEnv != null && fromEnv !== "") return fromEnv;
  }
  return fallback;
}

export class LibraryService {
  private metadata: MetadataService | null = null;

  constructor(
    private db: Database.Database,
    private prowlarr: ProwlarrClient,
    private clients: DownloadClientRegistry
  ) {}

  setMetadataService(metadata: MetadataService): void {
    this.metadata = metadata;
  }

  listAuthors(): Author[] {
    return this.db
      .prepare("SELECT * FROM authors ORDER BY name")
      .all()
      .map((r) => mapAuthor(r as Record<string, unknown>));
  }

  listBooks(filter?: { wanted?: boolean; monitored?: boolean }): Audiobook[] {
    let sql = `
      SELECT b.*, a.name AS author_name
      FROM audiobooks b
      JOIN authors a ON a.id = b.author_id
      WHERE 1=1
    `;
    const params: unknown[] = [];
    if (filter?.wanted != null) {
      sql += " AND b.wanted = ?";
      params.push(filter.wanted ? 1 : 0);
    }
    if (filter?.monitored != null) {
      sql += " AND b.monitored = ?";
      params.push(filter.monitored ? 1 : 0);
    }
    sql += " ORDER BY a.name, b.title";
    return this.db
      .prepare(sql)
      .all(...params)
      .map((r) => mapBook(r as Record<string, unknown>));
  }

  getBook(id: number): Audiobook | null {
    const row = this.db
      .prepare(
        `SELECT b.*, a.name AS author_name FROM audiobooks b
         JOIN authors a ON a.id = b.author_id WHERE b.id = ?`
      )
      .get(id);
    return row ? mapBook(row as Record<string, unknown>) : null;
  }

  ensureAuthor(name: string, overview?: string | null): Author {
    const existing = this.db.prepare("SELECT * FROM authors WHERE name = ? COLLATE NOCASE").get(name);
    if (existing) return mapAuthor(existing as Record<string, unknown>);
    const info = this.db
      .prepare("INSERT INTO authors (name, overview) VALUES (?, ?)")
      .run(name.trim(), overview ?? null);
    return mapAuthor(
      this.db.prepare("SELECT * FROM authors WHERE id = ?").get(info.lastInsertRowid) as Record<string, unknown>
    );
  }

  upsertAudiobook(input: {
    title: string;
    authorName: string;
    overview?: string | null;
    asin?: string | null;
    isbn?: string | null;
    narrator?: string | null;
    coverUrl?: string | null;
    runtimeMinutes?: number | null;
    monitored?: boolean;
    wanted?: boolean;
    status?: Audiobook["status"];
    qualityProfileId?: number;
  }): Audiobook {
    const author = this.ensureAuthor(input.authorName, null);
    const settings = this.getSettings();
    const qp = input.qualityProfileId ?? settings.qualityProfileId;

    const existing = this.db
      .prepare("SELECT id FROM audiobooks WHERE title = ? COLLATE NOCASE AND author_id = ?")
      .get(input.title, author.id) as { id: number } | undefined;

    if (existing) {
      this.db
        .prepare(
          `UPDATE audiobooks SET
            overview = COALESCE(?, overview),
            asin = COALESCE(?, asin),
            isbn = COALESCE(?, isbn),
            narrator = COALESCE(?, narrator),
            cover_url = COALESCE(?, cover_url),
            runtime_minutes = COALESCE(?, runtime_minutes),
            monitored = ?,
            wanted = ?,
            status = COALESCE(?, status),
            quality_profile_id = ?,
            updated_at = datetime('now')
           WHERE id = ?`
        )
        .run(
          input.overview ?? null,
          input.asin ?? null,
          input.isbn ?? null,
          input.narrator ?? null,
          input.coverUrl ?? null,
          input.runtimeMinutes ?? null,
          input.monitored === false ? 0 : 1,
          input.wanted === false ? 0 : 1,
          input.status ?? null,
          qp,
          existing.id
        );
      return this.getBook(existing.id)!;
    }

    const info = this.db
      .prepare(
        `INSERT INTO audiobooks
          (title, author_id, overview, asin, isbn, narrator, cover_url, runtime_minutes,
           monitored, wanted, status, quality_profile_id)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        input.title.trim(),
        author.id,
        input.overview ?? null,
        input.asin ?? null,
        input.isbn ?? null,
        input.narrator ?? null,
        input.coverUrl ?? null,
        input.runtimeMinutes ?? null,
        input.monitored === false ? 0 : 1,
        input.wanted === false ? 0 : 1,
        input.status ?? "wanted",
        qp
      );
    return this.getBook(Number(info.lastInsertRowid))!;
  }

  applyMetadata(
    id: number,
    meta: {
      overview?: string | null;
      asin?: string | null;
      isbn?: string | null;
      narrator?: string | null;
      coverUrl?: string | null;
      runtimeMinutes?: number | null;
    }
  ): Audiobook | null {
    const book = this.getBook(id);
    if (!book) return null;
    this.db
      .prepare(
        `UPDATE audiobooks SET
          overview = COALESCE(?, overview),
          asin = COALESCE(?, asin),
          isbn = COALESCE(?, isbn),
          narrator = COALESCE(?, narrator),
          cover_url = COALESCE(?, cover_url),
          runtime_minutes = COALESCE(?, runtime_minutes),
          updated_at = datetime('now')
         WHERE id = ?`
      )
      .run(
        meta.overview ?? null,
        meta.asin ?? null,
        meta.isbn ?? null,
        meta.narrator ?? null,
        meta.coverUrl ?? null,
        meta.runtimeMinutes ?? null,
        id
      );
    return this.getBook(id);
  }

  updateBookFlags(
    id: number,
    patch: Partial<Pick<Audiobook, "monitored" | "wanted" | "status" | "path">>
  ): Audiobook | null {
    const book = this.getBook(id);
    if (!book) return null;
    this.db
      .prepare(
        `UPDATE audiobooks SET
          monitored = ?,
          wanted = ?,
          status = ?,
          path = ?,
          updated_at = datetime('now')
         WHERE id = ?`
      )
      .run(
        (patch.monitored ?? book.monitored) ? 1 : 0,
        (patch.wanted ?? book.wanted) ? 1 : 0,
        patch.status ?? book.status,
        patch.path !== undefined ? patch.path : book.path,
        id
      );
    return this.getBook(id);
  }

  listQualityProfiles(): QualityProfile[] {
    return this.db
      .prepare("SELECT * FROM quality_profiles ORDER BY id")
      .all()
      .map((r) => {
        const row = r as Record<string, unknown>;
        return {
          id: Number(row.id),
          name: String(row.name),
          preferredFormats: String(row.preferred_formats),
          minBitrateKbps: Number(row.min_bitrate_kbps),
        };
      });
  }

  listRequests(status?: RequestStatus): BookRequest[] {
    if (status) {
      return this.db
        .prepare("SELECT * FROM requests WHERE status = ? ORDER BY created_at DESC")
        .all(status)
        .map((r) => mapRequest(r as Record<string, unknown>));
    }
    return this.db
      .prepare("SELECT * FROM requests ORDER BY created_at DESC")
      .all()
      .map((r) => mapRequest(r as Record<string, unknown>));
  }

  createRequest(input: {
    title: string;
    authorName: string;
    overview?: string | null;
    asin?: string | null;
    isbn?: string | null;
    narrator?: string | null;
    coverUrl?: string | null;
    requesterName: string;
  }): BookRequest {
    const info = this.db
      .prepare(
        `INSERT INTO requests
          (title, author_name, overview, asin, isbn, narrator, cover_url, requester_name)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        input.title.trim(),
        input.authorName.trim(),
        input.overview ?? null,
        input.asin ?? null,
        input.isbn ?? null,
        input.narrator ?? null,
        input.coverUrl ?? null,
        input.requesterName.trim() || "anonymous"
      );
    return mapRequest(
      this.db.prepare("SELECT * FROM requests WHERE id = ?").get(info.lastInsertRowid) as Record<string, unknown>
    );
  }

  async approveRequest(id: number): Promise<BookRequest | null> {
    const row = this.db.prepare("SELECT * FROM requests WHERE id = ?").get(id);
    if (!row) return null;
    const req = mapRequest(row as Record<string, unknown>);
    if (req.status !== "pending") return req;

    const book = this.upsertAudiobook({
      title: req.title,
      authorName: req.authorName,
      overview: req.overview,
      asin: req.asin,
      isbn: req.isbn,
      narrator: req.narrator,
      coverUrl: req.coverUrl,
      monitored: true,
      wanted: true,
      status: "wanted",
    });

    this.db
      .prepare(
        `UPDATE requests SET status = 'approved', audiobook_id = ?, updated_at = datetime('now') WHERE id = ?`
      )
      .run(book.id, id);

    const settings = this.getSettings();
    if (settings.autoSearchOnApprove) {
      const releases = await this.prowlarr.search(`${req.title} ${req.authorName}`);
      if (releases[0]) {
        await this.enqueueGrab({
          audiobookId: book.id,
          release: releases[0],
        });
      }
    }

    return mapRequest(this.db.prepare("SELECT * FROM requests WHERE id = ?").get(id) as Record<string, unknown>);
  }

  denyRequest(id: number, reason?: string): BookRequest | null {
    const row = this.db.prepare("SELECT * FROM requests WHERE id = ?").get(id);
    if (!row) return null;
    this.db
      .prepare(
        `UPDATE requests SET status = 'denied', deny_reason = ?, updated_at = datetime('now') WHERE id = ?`
      )
      .run(reason ?? null, id);
    return mapRequest(this.db.prepare("SELECT * FROM requests WHERE id = ?").get(id) as Record<string, unknown>);
  }

  listDownloads(): DownloadJob[] {
    return this.db
      .prepare("SELECT * FROM download_jobs ORDER BY created_at DESC")
      .all()
      .map((r) => mapJob(r as Record<string, unknown>));
  }

  getDownload(id: number): DownloadJob | null {
    const row = this.db.prepare("SELECT * FROM download_jobs WHERE id = ?").get(id);
    return row ? mapJob(row as Record<string, unknown>) : null;
  }

  /**
   * Grab → download-client pipeline:
   * 1) record job
   * 2) optionally notify Prowlarr
   * 3) send torrent/nzb URL to configured (or mock) client
   */
  async enqueueGrab(input: {
    audiobookId?: number | null;
    release: {
      guid: string;
      title: string;
      indexerId: number;
      indexer: string;
      protocol: string;
      size: number;
      downloadUrl?: string;
      magnetUrl?: string;
    };
  }): Promise<DownloadJob> {
    const settings = this.getSettings();
    const downloadUrl = input.release.downloadUrl ?? input.release.magnetUrl ?? null;

    const info = this.db
      .prepare(
        `INSERT INTO download_jobs
          (audiobook_id, title, indexer_id, indexer_name, guid, download_url, status, protocol, size, progress)
         VALUES (?, ?, ?, ?, ?, ?, 'queued', ?, ?, 0)`
      )
      .run(
        input.audiobookId ?? null,
        input.release.title,
        input.release.indexerId,
        input.release.indexer,
        input.release.guid,
        downloadUrl,
        input.release.protocol,
        input.release.size
      );
    const jobId = Number(info.lastInsertRowid);

    // Best-effort Prowlarr notify (does not block client send)
    if (this.prowlarr.configured) {
      try {
        await this.prowlarr.grab({
          guid: input.release.guid,
          indexerId: input.release.indexerId,
        });
      } catch {
        /* ignore — we send to our own client */
      }
    }

    const client = this.clients.forProtocol(input.release.protocol, settings.downloadClientMode);
    const added = await client.add({
      title: input.release.title,
      downloadUrl: input.release.downloadUrl,
      magnetUrl: input.release.magnetUrl,
      category:
        client.protocol === "usenet" ? settings.sabnzbdCategory : settings.qbittorrentCategory,
      size: input.release.size,
    });

    if (!added.accepted) {
      this.db
        .prepare(
          `UPDATE download_jobs SET
            status = 'failed', client = ?, error = ?, updated_at = datetime('now')
           WHERE id = ?`
        )
        .run(client.kind, added.detail, jobId);
      return this.getDownload(jobId)!;
    }

    this.db
      .prepare(
        `UPDATE download_jobs SET
          status = 'downloading',
          client = ?,
          external_id = ?,
          progress = 0,
          error = NULL,
          updated_at = datetime('now')
         WHERE id = ?`
      )
      .run(client.kind, added.externalId, jobId);

    if (input.audiobookId) {
      this.updateBookFlags(input.audiobookId, { status: "downloading", wanted: true, monitored: true });
    }

    return this.getDownload(jobId)!;
  }

  /** Poll active jobs against download clients; import when complete. */
  async pollDownloads(): Promise<DownloadJob[]> {
    const active = this.db
      .prepare(
        `SELECT * FROM download_jobs
         WHERE status IN ('queued', 'grabbed', 'downloading')
         ORDER BY id ASC`
      )
      .all()
      .map((r) => mapJob(r as Record<string, unknown>));

    const settings = this.getSettings();
    const updated: DownloadJob[] = [];

    for (const job of active) {
      if (!job.externalId || !job.client) continue;
      const client = this.clients.forProtocol(job.protocol, settings.downloadClientMode);
      // Prefer the adapter that matches stored kind when possible
      const adapter =
        job.client === "qbittorrent" && settings.downloadClientMode === "auto"
          ? this.clients.forProtocol("torrent", "auto")
          : job.client === "sabnzbd" && settings.downloadClientMode === "auto"
            ? this.clients.forProtocol("usenet", "auto")
            : client;

      let remote;
      try {
        remote = await adapter.status(job.externalId);
      } catch (err) {
        this.db
          .prepare(
            `UPDATE download_jobs SET error = ?, updated_at = datetime('now') WHERE id = ?`
          )
          .run((err as Error).message, job.id);
        updated.push(this.getDownload(job.id)!);
        continue;
      }

      if (remote.state === "failed") {
        this.db
          .prepare(
            `UPDATE download_jobs SET
              status = 'failed', progress = ?, output_path = ?, error = ?, updated_at = datetime('now')
             WHERE id = ?`
          )
          .run(remote.progress, remote.outputPath, remote.error ?? "Download failed", job.id);
        updated.push(this.getDownload(job.id)!);
        continue;
      }

      if (remote.state === "completed") {
        await this.completeAndImport(job, remote.outputPath, remote.progress);
        updated.push(this.getDownload(job.id)!);
        continue;
      }

      this.db
        .prepare(
          `UPDATE download_jobs SET
            status = 'downloading', progress = ?, output_path = COALESCE(?, output_path),
            updated_at = datetime('now')
           WHERE id = ?`
        )
        .run(remote.progress, remote.outputPath, job.id);
      updated.push(this.getDownload(job.id)!);
    }

    return updated;
  }

  private async completeAndImport(
    job: DownloadJob,
    outputPath: string | null,
    progress: number
  ): Promise<void> {
    const settings = this.getSettings();
    const book = job.audiobookId ? this.getBook(job.audiobookId) : null;
    const authorName = book?.authorName ?? null;

    this.db
      .prepare(
        `UPDATE download_jobs SET
          status = 'completed', progress = ?, output_path = ?, updated_at = datetime('now')
         WHERE id = ?`
      )
      .run(progress || 100, outputPath, job.id);

    const imported = importCompletedDownload({
      libraryRoot: settings.libraryRoot,
      book,
      title: job.title,
      authorName,
      outputPath,
    });

    this.db
      .prepare(
        `UPDATE download_jobs SET
          status = ?, import_path = ?, error = ?, updated_at = datetime('now')
         WHERE id = ?`
      )
      .run(
        imported.ok ? "imported" : "failed",
        imported.importPath,
        imported.ok ? (imported.stub ? imported.detail : null) : imported.detail,
        job.id
      );

    if (imported.ok && job.audiobookId) {
      this.updateBookFlags(job.audiobookId, {
        status: "available",
        wanted: false,
        monitored: true,
        path: imported.importPath,
      });
    }
  }

  /**
   * Seed missing settings keys from process env (INSERT OR IGNORE).
   * Never overwrites values already saved in the DB / Admin UI.
   */
  bootstrapEnvIntoDb(): void {
    const insert = this.db.prepare(`INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)`);
    const pairs: Array<[string, string | undefined]> = [
      ["prowlarrUrl", process.env.PROWLARR_URL],
      ["prowlarrApiKey", process.env.PROWLARR_API_KEY],
      ["libraryRoot", process.env.BOOKARR_LIBRARY_ROOT],
      ["downloadClientMode", process.env.DOWNLOAD_CLIENT_MODE],
      ["qbittorrentUrl", process.env.QBITTORRENT_URL],
      ["qbittorrentUsername", process.env.QBITTORRENT_USERNAME],
      ["qbittorrentPassword", process.env.QBITTORRENT_PASSWORD],
      ["qbittorrentCategory", process.env.QBITTORRENT_CATEGORY],
      ["sabnzbdUrl", process.env.SABNZBD_URL],
      ["sabnzbdApiKey", process.env.SABNZBD_API_KEY],
      ["sabnzbdCategory", process.env.SABNZBD_CATEGORY],
      ["metadataMode", process.env.METADATA_MODE],
      ["hardcoverApiKey", process.env.HARDCOVER_API_KEY],
      ["metadataCacheTtlHours", process.env.METADATA_CACHE_TTL_HOURS],
      ["downloadPollMs", process.env.BOOKARR_DOWNLOAD_POLL_MS],
      ["mockDownloadMs", process.env.BOOKARR_MOCK_DOWNLOAD_MS],
    ];
    for (const [key, value] of pairs) {
      if (value != null && String(value).trim() !== "") insert.run(key, String(value));
    }
    // Sensible defaults when neither env nor prior UI value exists
    insert.run("libraryRoot", "/data/audiobooks");
    insert.run("downloadClientMode", "mock");
    insert.run("qbittorrentUsername", "admin");
    insert.run("qbittorrentCategory", "bookarr");
    insert.run("sabnzbdCategory", "bookarr");
    insert.run("metadataMode", "auto");
    insert.run("metadataCacheTtlHours", "24");
    insert.run("qualityProfileId", "2");
    insert.run("autoSearchOnApprove", "true");
    insert.run("downloadPollMs", "3000");
    insert.run("mockDownloadMs", "1500");
  }

  getSettings(): AppSettings {
    const rows = this.db.prepare("SELECT key, value FROM settings").all() as Array<{ key: string; value: string }>;
    const map = Object.fromEntries(rows.map((r) => [r.key, r.value]));
    const modeRaw = setting(map, "downloadClientMode", "DOWNLOAD_CLIENT_MODE", "mock");
    const metaRaw = setting(map, "metadataMode", "METADATA_MODE", "auto");
    return {
      prowlarrUrl: setting(map, "prowlarrUrl", "PROWLARR_URL"),
      prowlarrApiKey: setting(map, "prowlarrApiKey", "PROWLARR_API_KEY"),
      libraryRoot: setting(map, "libraryRoot", "BOOKARR_LIBRARY_ROOT", "/data/audiobooks"),
      qualityProfileId: Number(setting(map, "qualityProfileId", null, "1") || 1),
      autoSearchOnApprove: setting(map, "autoSearchOnApprove", null, "true") === "true",
      downloadClientMode: modeRaw === "auto" ? "auto" : "mock",
      qbittorrentUrl: setting(map, "qbittorrentUrl", "QBITTORRENT_URL"),
      qbittorrentUsername: setting(map, "qbittorrentUsername", "QBITTORRENT_USERNAME", "admin"),
      qbittorrentPassword: setting(map, "qbittorrentPassword", "QBITTORRENT_PASSWORD"),
      qbittorrentCategory: setting(map, "qbittorrentCategory", "QBITTORRENT_CATEGORY", "bookarr"),
      sabnzbdUrl: setting(map, "sabnzbdUrl", "SABNZBD_URL"),
      sabnzbdApiKey: setting(map, "sabnzbdApiKey", "SABNZBD_API_KEY"),
      sabnzbdCategory: setting(map, "sabnzbdCategory", "SABNZBD_CATEGORY", "bookarr"),
      metadataMode: metaRaw === "mock" ? "mock" : "auto",
      hardcoverApiKey: setting(map, "hardcoverApiKey", "HARDCOVER_API_KEY"),
      metadataCacheTtlHours: Number(
        setting(map, "metadataCacheTtlHours", "METADATA_CACHE_TTL_HOURS", "24") || 24
      ),
      downloadPollMs: Number(setting(map, "downloadPollMs", "BOOKARR_DOWNLOAD_POLL_MS", "3000") || 3000),
      mockDownloadMs: Number(setting(map, "mockDownloadMs", "BOOKARR_MOCK_DOWNLOAD_MS", "1500") || 1500),
    };
  }

  updateSettings(
    patch: Partial<AppSettings>,
    opts?: { clearSecrets?: SecretSettingKey[] }
  ): AppSettings {
    const current = this.getSettings();
    const next: AppSettings = { ...current, ...patch };
    for (const secret of opts?.clearSecrets ?? []) {
      next[secret] = "";
    }
    const set = this.db.prepare(
      `INSERT INTO settings (key, value) VALUES (?, ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value`
    );
    const pairs: Array<[string, string]> = [
      ["prowlarrUrl", next.prowlarrUrl],
      ["prowlarrApiKey", next.prowlarrApiKey],
      ["libraryRoot", next.libraryRoot],
      ["qualityProfileId", String(next.qualityProfileId)],
      ["autoSearchOnApprove", String(next.autoSearchOnApprove)],
      ["downloadClientMode", next.downloadClientMode],
      ["qbittorrentUrl", next.qbittorrentUrl],
      ["qbittorrentUsername", next.qbittorrentUsername],
      ["qbittorrentPassword", next.qbittorrentPassword],
      ["qbittorrentCategory", next.qbittorrentCategory],
      ["sabnzbdUrl", next.sabnzbdUrl],
      ["sabnzbdApiKey", next.sabnzbdApiKey],
      ["sabnzbdCategory", next.sabnzbdCategory],
      ["metadataMode", next.metadataMode],
      ["hardcoverApiKey", next.hardcoverApiKey],
      ["metadataCacheTtlHours", String(next.metadataCacheTtlHours)],
      ["downloadPollMs", String(next.downloadPollMs)],
      ["mockDownloadMs", String(next.mockDownloadMs)],
    ];
    for (const [k, v] of pairs) set.run(k, v);

    // Hot-reload in-process clients — no container restart required
    this.prowlarr.updateConfig(next.prowlarrUrl, next.prowlarrApiKey);
    this.clients.updateFromSettings(next);
    this.metadata?.updateFromSettings(next);
    return this.getSettings();
  }

  publicSettings() {
    const s = this.getSettings();
    return {
      ...s,
      prowlarrApiKey: s.prowlarrApiKey ? "••••••••" : "",
      prowlarrApiKeySet: Boolean(s.prowlarrApiKey),
      qbittorrentPassword: s.qbittorrentPassword ? "••••••••" : "",
      qbittorrentPasswordSet: Boolean(s.qbittorrentPassword),
      sabnzbdApiKey: s.sabnzbdApiKey ? "••••••••" : "",
      sabnzbdApiKeySet: Boolean(s.sabnzbdApiKey),
      hardcoverApiKey: s.hardcoverApiKey ? "••••••••" : "",
      hardcoverApiKeySet: Boolean(s.hardcoverApiKey),
      precedence: "ui-db-over-env",
      note: "Saved settings persist in SQLite and win over env after first boot. Env only bootstraps missing keys.",
    };
  }

  stats() {
    const books = this.db.prepare("SELECT COUNT(*) AS c FROM audiobooks").get() as { c: number };
    const wanted = this.db.prepare("SELECT COUNT(*) AS c FROM audiobooks WHERE wanted = 1").get() as { c: number };
    const pending = this.db.prepare("SELECT COUNT(*) AS c FROM requests WHERE status = 'pending'").get() as {
      c: number;
    };
    const downloads = this.db.prepare("SELECT COUNT(*) AS c FROM download_jobs").get() as { c: number };
    const active = this.db
      .prepare(
        `SELECT COUNT(*) AS c FROM download_jobs WHERE status IN ('queued', 'grabbed', 'downloading')`
      )
      .get() as { c: number };
    return {
      books: books.c,
      wanted: wanted.c,
      pendingRequests: pending.c,
      downloads: downloads.c,
      activeDownloads: active.c,
    };
  }
}
