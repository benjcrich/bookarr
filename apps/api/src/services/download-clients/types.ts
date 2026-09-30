import type { AddDownloadResult, RemoteDownloadStatus } from "../../domain/types.js";

export interface AddDownloadInput {
  title: string;
  downloadUrl?: string | null;
  magnetUrl?: string | null;
  category?: string;
  size?: number | null;
}

export interface DownloadClientAdapter {
  readonly kind: "mock" | "qbittorrent" | "sabnzbd";
  readonly protocol: "torrent" | "usenet";
  health(): Promise<{ ok: boolean; mode: "live" | "mock"; detail: string }>;
  add(input: AddDownloadInput): Promise<AddDownloadResult>;
  status(externalId: string): Promise<RemoteDownloadStatus>;
}
