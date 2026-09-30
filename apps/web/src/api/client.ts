export type BookStatus = "wanted" | "monitored" | "downloading" | "available" | "missing";
export type RequestStatus = "pending" | "approved" | "denied";

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
  createdAt: string;
}

export interface Stats {
  books: number;
  wanted: number;
  pendingRequests: number;
  downloads: number;
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
  health: () => api<{ status: string; prowlarr: { mode: string; detail: string }; stats: Stats }>("/api/health"),
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
    overview?: string;
    narrator?: string;
    wanted?: boolean;
    monitored?: boolean;
  }) => api<Audiobook>("/api/books", { method: "POST", body: JSON.stringify(body) }),
  patchBook: (id: number, body: Partial<Pick<Audiobook, "monitored" | "wanted" | "status">>) =>
    api<Audiobook>(`/api/books/${id}`, { method: "PATCH", body: JSON.stringify(body) }),
  requests: (status?: string) =>
    api<BookRequest[]>(`/api/requests${status ? `?status=${status}` : ""}`),
  createRequest: (body: {
    title: string;
    authorName: string;
    overview?: string;
    narrator?: string;
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
  grab: (release: ProwlarrRelease, audiobookId?: number) =>
    api<DownloadJob>("/api/grab", {
      method: "POST",
      body: JSON.stringify({ audiobookId, release }),
    }),
  downloads: () => api<DownloadJob[]>("/api/downloads"),
  indexers: () =>
    api<Array<{ id: number; name: string; protocol: string; enable: boolean }>>("/api/indexers"),
  settings: () =>
    api<{
      prowlarrUrl: string;
      prowlarrApiKeySet: boolean;
      libraryRoot: string;
      autoSearchOnApprove: boolean;
    }>("/api/settings"),
  updateSettings: (body: Record<string, unknown>) =>
    api("/api/settings", { method: "PUT", body: JSON.stringify(body) }),
};
