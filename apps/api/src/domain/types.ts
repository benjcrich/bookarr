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
  createdAt: string;
  updatedAt: string;
}

export interface AppSettings {
  prowlarrUrl: string;
  prowlarrApiKey: string;
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
