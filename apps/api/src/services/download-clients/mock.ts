import type { AddDownloadResult, RemoteDownloadStatus } from "../../domain/types.js";
import type { AddDownloadInput, DownloadClientAdapter } from "./types.js";

interface MockItem {
  title: string;
  createdAt: number;
  /** ms until complete; default ~1.5s for snappy mock polls */
  durationMs: number;
  outputPath: string;
  failed?: boolean;
}

/**
 * In-process download client for local/dev/tests.
 * Progress advances with wall-clock time so polling demos feel real.
 */
export class MockDownloadClient implements DownloadClientAdapter {
  readonly kind = "mock" as const;
  private durationMs = Number(process.env.BOOKARR_MOCK_DOWNLOAD_MS || 1500);
  private items = new Map<string, MockItem>();

  constructor(readonly protocol: "torrent" | "usenet") {}

  setDurationMs(ms: number): void {
    if (Number.isFinite(ms) && ms > 0) this.durationMs = ms;
  }

  async health() {
    return { ok: true, mode: "mock" as const, detail: `Mock ${this.protocol} client ready.` };
  }

  async add(input: AddDownloadInput): Promise<AddDownloadResult> {
    const externalId = `mock-${this.protocol}-${crypto.randomUUID().slice(0, 8)}`;
    const safe = input.title.replace(/[^\w.\- ]+/g, "_").trim() || "audiobook";
    this.items.set(externalId, {
      title: input.title,
      createdAt: Date.now(),
      durationMs: this.durationMs,
      outputPath: `/downloads/mock/${safe}`,
    });
    return {
      accepted: true,
      externalId,
      detail: `Mock ${this.protocol} accepted “${input.title}”.`,
    };
  }

  async status(externalId: string): Promise<RemoteDownloadStatus> {
    const item = this.items.get(externalId);
    if (!item) {
      return { state: "failed", progress: 0, outputPath: null, error: "Unknown mock download id" };
    }
    if (item.failed) {
      return { state: "failed", progress: 0, outputPath: null, error: "Mock failure" };
    }
    const elapsed = Date.now() - item.createdAt;
    const progress = Math.min(100, Math.round((elapsed / item.durationMs) * 100));
    if (progress >= 100) {
      return { state: "completed", progress: 100, outputPath: item.outputPath };
    }
    return { state: "downloading", progress, outputPath: null };
  }

  /** Test helper: force completion on next poll. */
  completeNow(externalId: string): void {
    const item = this.items.get(externalId);
    if (item) item.createdAt = Date.now() - item.durationMs - 1;
  }
}
