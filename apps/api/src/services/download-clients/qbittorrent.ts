import type { AddDownloadResult, RemoteDownloadStatus } from "../../domain/types.js";
import type { AddDownloadInput, DownloadClientAdapter } from "./types.js";

export interface QBittorrentConfig {
  url: string;
  username: string;
  password: string;
  category: string;
}

/**
 * qBittorrent WebUI API v2 adapter.
 * @see https://github.com/qbittorrent/qBittorrent/wiki/WebUI-API-(qBittorrent-4.1)
 */
export class QBittorrentClient implements DownloadClientAdapter {
  readonly kind = "qbittorrent" as const;
  readonly protocol = "torrent" as const;
  private cookie: string | null = null;

  constructor(private config: QBittorrentConfig) {}

  updateConfig(config: QBittorrentConfig): void {
    this.config = config;
    this.cookie = null;
  }

  get configured(): boolean {
    return Boolean(this.config.url);
  }

  async health() {
    if (!this.configured) {
      return { ok: false, mode: "mock" as const, detail: "qBittorrent URL not set." };
    }
    try {
      await this.ensureLogin();
      const res = await this.request("/api/v2/app/version");
      if (!res.ok) {
        return {
          ok: false,
          mode: "live" as const,
          detail: `qBittorrent HTTP ${res.status}`,
        };
      }
      const version = await res.text();
      return { ok: true, mode: "live" as const, detail: `qBittorrent ${version}` };
    } catch (err) {
      return {
        ok: false,
        mode: "live" as const,
        detail: `qBittorrent unreachable (${(err as Error).message})`,
      };
    }
  }

  async add(input: AddDownloadInput): Promise<AddDownloadResult> {
    const url = input.magnetUrl || input.downloadUrl;
    if (!url) {
      return { accepted: false, externalId: "", detail: "No torrent/magnet URL on release." };
    }
    await this.ensureLogin();
    const body = new URLSearchParams();
    body.set("urls", url);
    if (this.config.category) body.set("category", this.config.category);
    body.set("rename", input.title);

    const res = await this.request("/api/v2/torrents/add", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
    });
    if (!res.ok) {
      const text = await res.text();
      return {
        accepted: false,
        externalId: "",
        detail: `qBittorrent add failed: HTTP ${res.status} ${text}`,
      };
    }

    // Resolve hash from torrent list by name match (best-effort)
    const externalId = await this.findHashByName(input.title);
    return {
      accepted: true,
      externalId: externalId || `qbit:${hashHint(url)}`,
      detail: "Added to qBittorrent.",
    };
  }

  async status(externalId: string): Promise<RemoteDownloadStatus> {
    if (externalId.startsWith("qbit:")) {
      // Fallback id — scan category
      return this.statusByCategoryScan(externalId);
    }
    await this.ensureLogin();
    const res = await this.request(`/api/v2/torrents/info?hashes=${encodeURIComponent(externalId)}`);
    if (!res.ok) {
      return {
        state: "failed",
        progress: 0,
        outputPath: null,
        error: `qBittorrent info HTTP ${res.status}`,
      };
    }
    const list = (await res.json()) as Array<Record<string, unknown>>;
    const t = list[0];
    if (!t) {
      return { state: "failed", progress: 0, outputPath: null, error: "Torrent not found" };
    }
    return mapTorrent(t);
  }

  private async statusByCategoryScan(externalId: string): Promise<RemoteDownloadStatus> {
    await this.ensureLogin();
    const res = await this.request("/api/v2/torrents/info");
    if (!res.ok) {
      return { state: "downloading", progress: 0, outputPath: null };
    }
    const list = (await res.json()) as Array<Record<string, unknown>>;
    const hint = externalId.slice("qbit:".length);
    const t =
      list.find((x) => String(x.hash ?? "").startsWith(hint)) ||
      list.find((x) => this.config.category && String(x.category ?? "") === this.config.category);
    if (!t) return { state: "downloading", progress: 0, outputPath: null };
    return mapTorrent(t);
  }

  private async findHashByName(title: string): Promise<string | null> {
    try {
      const res = await this.request("/api/v2/torrents/info");
      if (!res.ok) return null;
      const list = (await res.json()) as Array<Record<string, unknown>>;
      const match = list.find((t) => String(t.name ?? "").includes(title.slice(0, 40)));
      return match ? String(match.hash) : null;
    } catch {
      return null;
    }
  }

  private async ensureLogin(): Promise<void> {
    if (this.cookie) return;
    const body = new URLSearchParams({
      username: this.config.username || "admin",
      password: this.config.password || "",
    });
    const res = await fetch(`${this.base()}/api/v2/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) throw new Error(`login HTTP ${res.status}`);
    const setCookie = res.headers.getSetCookie?.() ?? [];
    const cookieHeader = setCookie.map((c) => c.split(";")[0]).join("; ");
    const legacy = res.headers.get("set-cookie");
    this.cookie = cookieHeader || (legacy ? legacy.split(";")[0] : "SID=1");
    const text = await res.text();
    if (text.trim() === "Fails.") throw new Error("invalid qBittorrent credentials");
  }

  private async request(path: string, init: RequestInit = {}): Promise<Response> {
    const headers = new Headers(init.headers);
    if (this.cookie) headers.set("Cookie", this.cookie);
    return fetch(`${this.base()}${path}`, {
      ...init,
      headers,
      signal: AbortSignal.timeout(8000),
    });
  }

  private base(): string {
    return this.config.url.replace(/\/$/, "");
  }
}

function mapTorrent(t: Record<string, unknown>): RemoteDownloadStatus {
  const progress = Math.round(Number(t.progress ?? 0) * 100);
  const state = String(t.state ?? "");
  const contentPath = t.content_path ? String(t.content_path) : t.save_path ? String(t.save_path) : null;
  if (["error", "missingFiles"].includes(state)) {
    return {
      state: "failed",
      progress,
      outputPath: contentPath,
      error: `qBittorrent state: ${state}`,
    };
  }
  if (progress >= 100 || ["uploading", "pausedUP", "queuedUP", "stalledUP", "forcedUP", "checkingUP"].includes(state)) {
    return { state: "completed", progress: 100, outputPath: contentPath };
  }
  return { state: "downloading", progress, outputPath: contentPath };
}

function hashHint(url: string): string {
  let h = 0;
  for (let i = 0; i < url.length; i++) h = (h * 31 + url.charCodeAt(i)) >>> 0;
  return h.toString(16);
}
