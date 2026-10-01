import fs from "node:fs";
import os from "node:os";
import path from "node:path";
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
 * Writes a real audio stub under the output path so import can copy/hardlink it.
 */
export class MockDownloadClient implements DownloadClientAdapter {
  readonly kind = "mock" as const;
  private durationMs = Number(process.env.BOOKARR_MOCK_DOWNLOAD_MS || 1500);
  private outputRoot =
    process.env.BOOKARR_MOCK_DOWNLOAD_ROOT || path.join(os.tmpdir(), "bookarr-mock-downloads");
  private items = new Map<string, MockItem>();

  constructor(readonly protocol: "torrent" | "usenet") {}

  setDurationMs(ms: number): void {
    if (Number.isFinite(ms) && ms > 0) this.durationMs = ms;
  }

  setOutputRoot(root: string): void {
    if (root?.trim()) this.outputRoot = root.trim();
  }

  async health() {
    return { ok: true, mode: "mock" as const, detail: `Mock ${this.protocol} client ready.` };
  }

  async add(input: AddDownloadInput): Promise<AddDownloadResult> {
    const externalId = `mock-${this.protocol}-${crypto.randomUUID().slice(0, 8)}`;
    const safe = input.title.replace(/[^\w.\- ]+/g, "_").trim() || "audiobook";
    const outputPath = path.join(this.outputRoot, safe);
    this.items.set(externalId, {
      title: input.title,
      createdAt: Date.now(),
      durationMs: this.durationMs,
      outputPath,
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
      this.materializeOutput(item);
      return { state: "completed", progress: 100, outputPath: item.outputPath };
    }
    return { state: "downloading", progress, outputPath: null };
  }

  /** Test helper: force completion on next poll. */
  completeNow(externalId: string): void {
    const item = this.items.get(externalId);
    if (item) {
      item.createdAt = Date.now() - item.durationMs - 1;
      this.materializeOutput(item);
    }
  }

  private materializeOutput(item: MockItem): void {
    fs.mkdirSync(item.outputPath, { recursive: true });
    const audio = path.join(item.outputPath, "chapter-01.mp3");
    if (!fs.existsSync(audio)) {
      // Minimal payload so import has a real file to transfer
      fs.writeFileSync(audio, Buffer.from("ID3\x03\x00\x00\x00\x00\x00\x00bookarr-mock-audio"));
    }
  }
}
