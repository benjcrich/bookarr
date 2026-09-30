import type Database from "better-sqlite3";
import type {
  AppSettings,
  Audiobook,
  Author,
  BookRequest,
  DownloadJob,
  QualityProfile,
  RequestStatus,
} from "../domain/types.js";
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
    narrator: row.narrator != null ? String(row.narrator) : null,
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
    narrator: row.narrator != null ? String(row.narrator) : null,
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
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

export class LibraryService {
  constructor(
    private db: Database.Database,
    private prowlarr: ProwlarrClient
  ) {}

  listAuthors(): Author[] {
    return this.db.prepare("SELECT * FROM authors ORDER BY name").all().map((r) => mapAuthor(r as Record<string, unknown>));
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
    return this.db.prepare(sql).all(...params).map((r) => mapBook(r as Record<string, unknown>));
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
    narrator?: string | null;
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
            narrator = COALESCE(?, narrator),
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
          input.narrator ?? null,
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
          (title, author_id, overview, asin, narrator, monitored, wanted, status, quality_profile_id)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        input.title.trim(),
        author.id,
        input.overview ?? null,
        input.asin ?? null,
        input.narrator ?? null,
        input.monitored === false ? 0 : 1,
        input.wanted === false ? 0 : 1,
        input.status ?? "wanted",
        qp
      );
    return this.getBook(Number(info.lastInsertRowid))!;
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
    narrator?: string | null;
    requesterName: string;
  }): BookRequest {
    const info = this.db
      .prepare(
        `INSERT INTO requests (title, author_name, overview, asin, narrator, requester_name)
         VALUES (?, ?, ?, ?, ?, ?)`
      )
      .run(
        input.title.trim(),
        input.authorName.trim(),
        input.overview ?? null,
        input.asin ?? null,
        input.narrator ?? null,
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
      narrator: req.narrator,
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
      // Fire-and-forget search enqueue: create download jobs from top release (hook)
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
    const grab = await this.prowlarr.grab({
      guid: input.release.guid,
      indexerId: input.release.indexerId,
    });

    const status = grab.accepted ? "grabbed" : "failed";
    const info = this.db
      .prepare(
        `INSERT INTO download_jobs
          (audiobook_id, title, indexer_id, indexer_name, guid, download_url, status, protocol, size, error)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        input.audiobookId ?? null,
        input.release.title,
        input.release.indexerId,
        input.release.indexer,
        input.release.guid,
        input.release.downloadUrl ?? input.release.magnetUrl ?? null,
        status,
        input.release.protocol,
        input.release.size,
        grab.accepted ? null : grab.detail
      );

    if (input.audiobookId && grab.accepted) {
      this.updateBookFlags(input.audiobookId, { status: "downloading", wanted: true, monitored: true });
    }

    return mapJob(
      this.db.prepare("SELECT * FROM download_jobs WHERE id = ?").get(info.lastInsertRowid) as Record<string, unknown>
    );
  }

  getSettings(): AppSettings {
    const rows = this.db.prepare("SELECT key, value FROM settings").all() as Array<{ key: string; value: string }>;
    const map = Object.fromEntries(rows.map((r) => [r.key, r.value]));
    return {
      prowlarrUrl: process.env.PROWLARR_URL || map.prowlarrUrl || "",
      prowlarrApiKey: process.env.PROWLARR_API_KEY || map.prowlarrApiKey || "",
      libraryRoot: process.env.BOOKARR_LIBRARY_ROOT || map.libraryRoot || "/data/audiobooks",
      qualityProfileId: Number(map.qualityProfileId || 1),
      autoSearchOnApprove: (map.autoSearchOnApprove ?? "true") === "true",
    };
  }

  updateSettings(patch: Partial<AppSettings>): AppSettings {
    const current = this.getSettings();
    const next = { ...current, ...patch };
    const set = this.db.prepare(
      `INSERT INTO settings (key, value) VALUES (?, ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value`
    );
    set.run("prowlarrUrl", next.prowlarrUrl);
    set.run("prowlarrApiKey", next.prowlarrApiKey);
    set.run("libraryRoot", next.libraryRoot);
    set.run("qualityProfileId", String(next.qualityProfileId));
    set.run("autoSearchOnApprove", String(next.autoSearchOnApprove));
    this.prowlarr.updateConfig(next.prowlarrUrl, next.prowlarrApiKey);
    return this.getSettings();
  }

  stats() {
    const books = this.db.prepare("SELECT COUNT(*) AS c FROM audiobooks").get() as { c: number };
    const wanted = this.db.prepare("SELECT COUNT(*) AS c FROM audiobooks WHERE wanted = 1").get() as { c: number };
    const pending = this.db.prepare("SELECT COUNT(*) AS c FROM requests WHERE status = 'pending'").get() as {
      c: number;
    };
    const downloads = this.db.prepare("SELECT COUNT(*) AS c FROM download_jobs").get() as { c: number };
    return {
      books: books.c,
      wanted: wanted.c,
      pendingRequests: pending.c,
      downloads: downloads.c,
    };
  }
}
