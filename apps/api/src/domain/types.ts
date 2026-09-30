export type BookStatus = "wanted" | "monitored" | "downloading" | "available" | "missing";
export type RequestStatus = "pending" | "approved" | "denied";
export type DownloadStatus = "queued" | "grabbed" | "failed" | "completed";

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
  narrator: string | null;
  monitored: boolean;
  wanted: boolean;
  status: BookStatus;
  qualityProfileId: number;
  path: string | null;
  createdAt: string;
  updatedAt: string;
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
  narrator: string | null;
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
  createdAt: string;
  updatedAt: string;
}

export interface AppSettings {
  prowlarrUrl: string;
  prowlarrApiKey: string;
  libraryRoot: string;
  qualityProfileId: number;
  autoSearchOnApprove: boolean;
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
