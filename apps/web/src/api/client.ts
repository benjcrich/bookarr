export type BookStatus = "wanted" | "monitored" | "downloading" | "available" | "missing";
export type RequestStatus = "pending" | "approved" | "denied";
export type SecretSettingKey =
  | "prowlarrApiKey"
  | "qbittorrentPassword"
  | "sabnzbdApiKey"
  | "hardcoverApiKey";

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
}

export interface MetadataResult {
  provider: string;
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
  seeders?: number;
}

export interface DownloadJob {
  id: number;
  title: string;
  status: string;
  indexerName: string | null;
  protocol: string;
  size: number | null;
  client: string | null;
  externalId: string | null;
  progress: number;
  outputPath: string | null;
  importPath: string | null;
  error: string | null;
  createdAt: string;
}

export interface Stats {
  books: number;
  wanted: number;
  pendingRequests: number;
  downloads: number;
  activeDownloads?: number;
}

export interface DownloadClientsHealth {
  mode: string;
  torrent: { kind: string; ok: boolean; mode: string; detail: string };
  usenet: { kind: string; ok: boolean; mode: string; detail: string };
}

export interface PublicSettings {
  prowlarrUrl: string;
  prowlarrApiKeySet: boolean;
  libraryRoot: string;
  qualityProfileId: number;
  autoSearchOnApprove: boolean;
  downloadClientMode: "mock" | "auto";
  qbittorrentUrl: string;
  qbittorrentUsername: string;
  qbittorrentPasswordSet: boolean;
  qbittorrentCategory: string;
  sabnzbdUrl: string;
  sabnzbdApiKeySet: boolean;
  sabnzbdCategory: string;
  metadataMode: "mock" | "auto";
  hardcoverApiKeySet: boolean;
  metadataCacheTtlHours: number;
  downloadPollMs: number;
  mockDownloadMs: number;
  precedence?: string;
  note?: string;
}

export interface SettingsTestResult {
  prowlarr: { mode: string; detail: string; ok?: boolean };
  downloadClients: DownloadClientsHealth;
  metadata: { mode: string; openLibrary: string; hardcover: string };
}

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || res.statusText);
  }
  return res.json() as Promise<T>;
}

export const bookarrApi = {
  health: () =>
    api<{
      status: string;
      prowlarr: { mode: string; detail: string };
      downloadClients: DownloadClientsHealth;
      metadata: { mode: string; openLibrary: string; hardcover: string };
      stats: Stats;
    }>("/api/health"),
  stats: () => api<Stats>("/api/stats"),
  books: (params?: { wanted?: boolean }) => {
    const qs = new URLSearchParams();
    if (params?.wanted != null) qs.set("wanted", String(params.wanted));
    const q = qs.toString();
    return api<Audiobook[]>(`/api/books${q ? `?${q}` : ""}`);
  },
  addBook: (body: {
    title: string;
    authorName: string;
    overview?: string | null;
    narrator?: string | null;
    asin?: string | null;
    isbn?: string | null;
    coverUrl?: string | null;
    runtimeMinutes?: number | null;
    wanted?: boolean;
    monitored?: boolean;
  }) => api<Audiobook>("/api/books", { method: "POST", body: JSON.stringify(body) }),
  patchBook: (id: number, body: Partial<Pick<Audiobook, "monitored" | "wanted" | "status">>) =>
    api<Audiobook>(`/api/books/${id}`, { method: "PATCH", body: JSON.stringify(body) }),
  enrichBook: (id: number) =>
    api<{ book: Audiobook; match: MetadataResult; providers: string[] }>(`/api/books/${id}/enrich`, {
      method: "POST",
      body: "{}",
    }),
  requests: (status?: string) =>
    api<BookRequest[]>(`/api/requests${status ? `?status=${status}` : ""}`),
  createRequest: (body: {
    title: string;
    authorName: string;
    overview?: string | null;
    narrator?: string | null;
    asin?: string | null;
    isbn?: string | null;
    coverUrl?: string | null;
    requesterName: string;
  }) => api<BookRequest>("/api/requests", { method: "POST", body: JSON.stringify(body) }),
  approveRequest: (id: number) =>
    api<BookRequest>(`/api/requests/${id}/approve`, { method: "POST", body: "{}" }),
  denyRequest: (id: number, reason?: string) =>
    api<BookRequest>(`/api/requests/${id}/deny`, {
      method: "POST",
      body: JSON.stringify({ reason }),
    }),
  search: (q: string) => api<ProwlarrRelease[]>(`/api/search?q=${encodeURIComponent(q)}`),
  metadataSearch: (q: string) =>
    api<{ results: MetadataResult[]; cached: boolean; providers: string[] }>(
      `/api/metadata/search?q=${encodeURIComponent(q)}`
    ),
  grab: (release: ProwlarrRelease, audiobookId?: number) =>
    api<DownloadJob>("/api/grab", {
      method: "POST",
      body: JSON.stringify({ audiobookId, release }),
    }),
  downloads: () => api<DownloadJob[]>("/api/downloads"),
  pollDownloads: () =>
    api<{ polled: number; jobs: DownloadJob[] }>("/api/downloads/poll", {
      method: "POST",
      body: "{}",
    }),
  downloadClients: () => api<DownloadClientsHealth>("/api/download-clients"),
  indexers: () =>
    api<Array<{ id: number; name: string; protocol: string; enable: boolean }>>("/api/indexers"),
  settings: () => api<PublicSettings>("/api/settings"),
  updateSettings: (body: Record<string, unknown>) =>
    api<PublicSettings>("/api/settings", { method: "PUT", body: JSON.stringify(body) }),
  testSettings: () =>
    api<SettingsTestResult>("/api/settings/test", { method: "POST", body: "{}" }),
};
