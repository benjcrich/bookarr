export type BookStatus = "wanted" | "monitored" | "downloading" | "available" | "missing";
export type RequestStatus = "pending" | "approved" | "denied";
export type DownloadStatus =
  | "queued"
  | "grabbed"
  | "downloading"
  | "completed"
  | "imported"
  | "failed";
export type DownloadClientKind = "mock" | "qbittorrent" | "sabnzbd";

export interface Author {
  id: number;
  name: string;
  overview: string | null;
  createdAt: string;
}

export interface Audiobook {
  id: number;
  title: string;
  authorId: number;
  authorName?: string;
  overview: string | null;
  asin: string | null;
  isbn: string | null;
  narrator: string | null;
  coverUrl: string | null;
  runtimeMinutes: number | null;
  monitored: boolean;
  wanted: boolean;
  status: BookStatus;
  qualityProfileId: number;
  path: string | null;
  createdAt: string;
  updatedAt: string;
}

export type MetadataProvider = "openlibrary" | "hardcover" | "mock";

export interface MetadataResult {
  provider: MetadataProvider;
  providerId: string;
  title: string;
  authorName: string;
  overview: string | null;
  coverUrl: string | null;
  narrator: string | null;
  runtimeMinutes: number | null;
  asin: string | null;
  isbn: string | null;
  publishedYear: number | null;
}

export interface QualityProfile {
  id: number;
  name: string;
  preferredFormats: string;
  minBitrateKbps: number;
}

export interface BookRequest {
  id: number;
  title: string;
  authorName: string;
  overview: string | null;
  asin: string | null;
  isbn: string | null;
  narrator: string | null;
  coverUrl: string | null;
  requesterName: string;
  status: RequestStatus;
  audiobookId: number | null;
  denyReason: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface DownloadJob {
  id: number;
  audiobookId: number | null;
  title: string;
  indexerId: number | null;
  indexerName: string | null;
  guid: string;
  downloadUrl: string | null;
  status: DownloadStatus;
  protocol: string;
  size: number | null;
  error: string | null;
  client: DownloadClientKind | null;
  externalId: string | null;
  progress: number;
  outputPath: string | null;
  importPath: string | null;
  /** Tries so far (1 on first enqueue; increments on each retry) */
  attempts: number;
  /** ISO timestamp when auto-retry is due; null if not scheduled */
  nextRetryAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export type SecretSettingKey =
  | "prowlarrApiKey"
  | "qbittorrentPassword"
  | "sabnzbdApiKey"
  | "hardcoverApiKey";

export interface AppSettings {
  prowlarrUrl: string;
  prowlarrApiKey: string;
  /**
   * Optional Prowlarr indexer IDs to search. Empty = all indexers.
   * Passed as `indexerIds` to GET /api/v1/search when non-empty.
   */
  prowlarrIndexerIds: number[];
  /**
   * Optional Newznab/Torznab category IDs (e.g. 3030 = Books/Audiobook).
   * Empty = no category filter. Passed as `categories` when non-empty.
   */
  prowlarrCategories: number[];
  libraryRoot: string;
  qualityProfileId: number;
  autoSearchOnApprove: boolean;
  /** mock = always mock clients; auto = live when credentials set */
  downloadClientMode: "mock" | "auto";
  qbittorrentUrl: string;
  qbittorrentUsername: string;
  qbittorrentPassword: string;
  qbittorrentCategory: string;
  sabnzbdUrl: string;
  sabnzbdApiKey: string;
  sabnzbdCategory: string;
  /** mock = canned results; auto = Open Library (+ Hardcover if keyed) */
  metadataMode: "mock" | "auto";
  hardcoverApiKey: string;
  metadataCacheTtlHours: number;
  /** Background download poll interval (ms) */
  downloadPollMs: number;
  /** Mock download client completion delay (ms) */
  mockDownloadMs: number;
  /** Application log level (also bootstrapped from LOG_LEVEL env) */
  logLevel: "debug" | "info" | "warn" | "error";
  /** Max download/import attempts before giving up (includes first try) */
  downloadRetryMaxAttempts: number;
  /** Base backoff delay for auto-retries (ms); doubles each attempt, capped */
  downloadRetryBaseDelayMs: number;
}

/** Parse comma/space/JSON list of positive ints from settings/env/UI. */
export function parseIdList(value: string | number[] | null | undefined): number[] {
  if (value == null) return [];
  if (Array.isArray(value)) {
    return [...new Set(value.map(Number).filter((n) => Number.isInteger(n) && n > 0))].sort(
      (a, b) => a - b
    );
  }
  const trimmed = String(value).trim();
  if (!trimmed) return [];
  if (trimmed.startsWith("[")) {
    try {
      return parseIdList(JSON.parse(trimmed) as number[]);
    } catch {
      /* fall through */
    }
  }
  return [
    ...new Set(
      trimmed
        .split(/[\s,;]+/)
        .map((p) => Number(p))
        .filter((n) => Number.isInteger(n) && n > 0)
    ),
  ].sort((a, b) => a - b);
}

export function serializeIdList(ids: number[]): string {
  return parseIdList(ids).join(",");
}

export interface ProwlarrIndexer {
  id: number;
  name: string;
  protocol: string;
  enable: boolean;
  priority: number;
}

export interface ProwlarrRelease {
  guid: string;
  title: string;
  size: number;
  indexerId: number;
  indexer: string;
  protocol: string;
  publishDate: string;
  downloadUrl?: string;
  magnetUrl?: string;
  infoUrl?: string;
  seeders?: number;
  leechers?: number;
}

export interface RemoteDownloadStatus {
  state: "queued" | "downloading" | "completed" | "failed";
  progress: number;
  outputPath: string | null;
  error?: string | null;
}

export interface AddDownloadResult {
  accepted: boolean;
  externalId: string;
  detail: string;
}
