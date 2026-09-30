import type { AddDownloadResult, RemoteDownloadStatus } from "../../domain/types.js";
import type { AddDownloadInput, DownloadClientAdapter } from "./types.js";

export interface SabnzbdConfig {
  url: string;
  apiKey: string;
  category: string;
}

/**
 * SABnzbd HTTP API adapter.
 * @see https://sabnzbd.org/wiki/advanced/api
 */
export class SabnzbdClient implements DownloadClientAdapter {
  readonly kind = "sabnzbd" as const;
  readonly protocol = "usenet" as const;

  constructor(private config: SabnzbdConfig) {}

  updateConfig(config: SabnzbdConfig): void {
    this.config = config;
  }

  get configured(): boolean {
    return Boolean(this.config.url && this.config.apiKey);
  }

  async health() {
    if (!this.configured) {
      return { ok: false, mode: "mock" as const, detail: "SABnzbd URL/API key not set." };
    }
    try {
      const data = await this.api<{ status: boolean; version?: string }>("version");
      return {
        ok: true,
        mode: "live" as const,
        detail: `SABnzbd ${data.version ?? "ok"}`,
      };
    } catch (err) {
      return {
        ok: false,
        mode: "live" as const,
        detail: `SABnzbd unreachable (${(err as Error).message})`,
      };
    }
  }

  async add(input: AddDownloadInput): Promise<AddDownloadResult> {
    const url = input.downloadUrl;
    if (!url) {
      return { accepted: false, externalId: "", detail: "No NZB download URL on release." };
    }
    const extra: Record<string, string> = {
      name: url,
      nzbname: input.title,
    };
    if (this.config.category) extra.cat = this.config.category;
    try {
      const data = await this.api<{ status: boolean; nzo_ids?: string[]; error?: string }>(
        "addurl",
        extra
      );
      if (!data.status) {
        return {
          accepted: false,
          externalId: "",
          detail: data.error || "SABnzbd rejected NZB URL",
        };
      }
      const externalId = data.nzo_ids?.[0] || `sab:${Date.now()}`;
      return { accepted: true, externalId, detail: "Added to SABnzbd." };
    } catch (err) {
      return {
        accepted: false,
        externalId: "",
        detail: `SABnzbd add failed: ${(err as Error).message}`,
      };
    }
  }

  async status(externalId: string): Promise<RemoteDownloadStatus> {
    try {
      const queue = await this.api<{
        queue?: { slots?: Array<Record<string, unknown>> };
      }>("queue");
      const qSlot = queue.queue?.slots?.find((s) => String(s.nzo_id) === externalId);
      if (qSlot) {
        const pct = Number(String(qSlot.percentage ?? 0));
        return {
          state: "downloading",
          progress: Number.isFinite(pct) ? pct : 0,
          outputPath: null,
        };
      }

      const history = await this.api<{
        history?: { slots?: Array<Record<string, unknown>> };
      }>("history", { limit: "50" });
      const hSlot = history.history?.slots?.find((s) => String(s.nzo_id) === externalId);
      if (!hSlot) {
        return { state: "downloading", progress: 0, outputPath: null };
      }
      const status = String(hSlot.status ?? "").toLowerCase();
      const storage = hSlot.storage ? String(hSlot.storage) : hSlot.path ? String(hSlot.path) : null;
      if (status.includes("fail")) {
        return {
          state: "failed",
          progress: 0,
          outputPath: storage,
          error: String(hSlot.fail_message ?? "SABnzbd failed"),
        };
      }
      if (status.includes("complete") || status === "completed") {
        return { state: "completed", progress: 100, outputPath: storage };
      }
      return { state: "downloading", progress: 50, outputPath: storage };
    } catch (err) {
      return {
        state: "failed",
        progress: 0,
        outputPath: null,
        error: (err as Error).message,
      };
    }
  }

  private async api<T>(mode: string, extra: Record<string, string> = {}): Promise<T> {
    const qs = new URLSearchParams({
      mode,
      apikey: this.config.apiKey,
      output: "json",
      ...extra,
    });
    const res = await fetch(`${this.config.url.replace(/\/$/, "")}/api?${qs}`, {
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return (await res.json()) as T;
  }
}
