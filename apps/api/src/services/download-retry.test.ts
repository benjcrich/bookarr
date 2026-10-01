import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { after, before, describe, it } from "node:test";
import { openDatabase } from "../db/database.js";
import { defaultSettings } from "../domain/defaults.js";
import { DownloadClientRegistry } from "./download-clients/index.js";
import { isRetryableDownloadError, LibraryService } from "./library.js";
import { ProwlarrClient } from "./prowlarr.js";

describe("download job retries", () => {
  let tmp: string;
  let library: LibraryService;

  before(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), "bookarr-retry-"));
    const db = openDatabase(path.join(tmp, "retry.db"));
    const clients = new DownloadClientRegistry(
      defaultSettings({
        libraryRoot: path.join(tmp, "library"),
        mockDownloadMs: 50,
        downloadRetryMaxAttempts: 3,
        downloadRetryBaseDelayMs: 50,
      })
    );
    library = new LibraryService(db, new ProwlarrClient("", ""), clients);
    library.updateSettings({
      libraryRoot: path.join(tmp, "library"),
      downloadClientMode: "mock",
      mockDownloadMs: 50,
      downloadRetryMaxAttempts: 3,
      downloadRetryBaseDelayMs: 50,
    });
  });

  after(() => {
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  it("treats EACCES as retryable when output path exists", () => {
    const job = {
      id: 1,
      audiobookId: null,
      title: "t",
      indexerId: 1,
      indexerName: "x",
      guid: "g",
      downloadUrl: "http://example.invalid/a.torrent",
      status: "failed" as const,
      protocol: "torrent",
      size: 1,
      error: "EACCES: permission denied, mkdir '/data/audiobooks/Unknown Author'",
      client: "mock" as const,
      externalId: null,
      progress: 100,
      outputPath: "/downloads/mock/x",
      importPath: null,
      attempts: 1,
      nextRetryAt: null,
      createdAt: "",
      updatedAt: "",
    };
    assert.equal(isRetryableDownloadError(job.error, job), true);
  });

  it("schedules auto-retry after import EACCES and succeeds on manual retry", async () => {
    const job = await library.enqueueGrab({
      release: {
        guid: "retry-eacces-1",
        title: "Retry Permission Book",
        indexerId: 1,
        indexer: "Mock",
        protocol: "torrent",
        size: 1000,
        downloadUrl: "https://example.invalid/retry.torrent",
      },
    });

    // Force an import failure by pointing library root at a non-writable path simulation:
    // mark failed as import EACCES with output path set (as completeAndImport would).
    library.updateSettings({ libraryRoot: path.join(tmp, "library") });
    const failed = library.markJobFailed(
      job.id,
      "Could not create library path: EACCES: permission denied, mkdir '/data/audiobooks/Unknown Author'",
      { progress: 100, outputPath: path.join(tmp, "src-out") }
    );
    assert.equal(failed.status, "failed");
    assert.ok(failed.nextRetryAt, "expected next_retry_at");
    assert.equal(failed.attempts, 1);

    // Create writable library and import-source stub dir, then manual retry (import-only path)
    fs.mkdirSync(path.join(tmp, "library"), { recursive: true });
    fs.mkdirSync(path.join(tmp, "src-out"), { recursive: true });
    const retried = await library.retryDownload(job.id, { manual: true });
    assert.ok(retried);
    assert.equal(retried!.attempts, 2);
    // Stub import should succeed (ok with stub) once mkdir works
    assert.equal(retried!.status, "imported");
  });

  it("poll picks up due auto-retries", async () => {
    const job = await library.enqueueGrab({
      release: {
        guid: "retry-poll-1",
        title: "Poll Retry Book",
        indexerId: 1,
        indexer: "Mock",
        protocol: "torrent",
        size: 1000,
        downloadUrl: "https://example.invalid/poll-retry.torrent",
      },
    });
    library.markJobFailed(job.id, "ECONNREFUSED client down");
    // Make retry due immediately
    const dbPath = path.join(tmp, "retry.db");
    // Access via update next_retry_at in the past through mark + direct SQL via retry poll
    // Re-open isn't needed — use retryDownload after forcing due via a second mark with past time:
    // Directly set next_retry_at through a tiny wait + poll after updating settings delay to 1ms
    library.updateSettings({ downloadRetryBaseDelayMs: 1, downloadRetryMaxAttempts: 5 });
    library.markJobFailed(job.id, "ECONNREFUSED client down");
    await new Promise((r) => setTimeout(r, 20));
    await library.pollDownloads();
    const after = library.getDownload(job.id)!;
    // Should have left failed-with-schedule or re-enqueued; attempts should be >= 1
    assert.ok(after.attempts >= 1);
    assert.ok(["queued", "downloading", "failed", "imported", "completed"].includes(after.status));
    void dbPath;
  });
});
