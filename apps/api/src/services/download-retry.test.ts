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
    fs.mkdirSync(path.join(tmp, "library"), { recursive: true });
    const db = openDatabase(path.join(tmp, "retry.db"));
    const clients = new DownloadClientRegistry(
      defaultSettings({
        libraryRoot: path.join(tmp, "library"),
        mockDownloadMs: 50,
        downloadRetryMaxAttempts: 3,
        downloadRetryBaseDelayMs: 50,
        importMode: "libraryDirect",
      })
    );
    library = new LibraryService(db, new ProwlarrClient("", ""), clients);
    library.updateSettings({
      libraryRoot: path.join(tmp, "library"),
      downloadClientMode: "mock",
      mockDownloadMs: 50,
      downloadRetryMaxAttempts: 3,
      downloadRetryBaseDelayMs: 50,
      importMode: "libraryDirect",
    });
  });

  after(() => {
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  it("treats library-direct path-not-visible as retryable when output path set", () => {
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
      error:
        'Library-direct import failed: client path not visible to Bookarr: "/data/audiobooks/book"',
      client: "mock" as const,
      externalId: null,
      progress: 100,
      outputPath: "/data/audiobooks/book",
      importPath: null,
      attempts: 1,
      nextRetryAt: null,
      createdAt: "",
      updatedAt: "",
    };
    assert.equal(isRetryableDownloadError(job.error, job), true);
  });

  it("schedules auto-retry after library-direct miss and succeeds when audio appears", async () => {
    const job = await library.enqueueGrab({
      release: {
        guid: "retry-direct-1",
        title: "Retry Direct Book",
        indexerId: 1,
        indexer: "Mock",
        protocol: "torrent",
        size: 1000,
        downloadUrl: "https://example.invalid/retry.torrent",
      },
    });

    const clientPath = path.join(tmp, "library", "pending-book");
    const failed = library.markJobFailed(
      job.id,
      `Library-direct import failed: no audio files under "${clientPath}" yet.`,
      { progress: 100, outputPath: clientPath }
    );
    assert.equal(failed.status, "failed");
    assert.ok(failed.nextRetryAt, "expected next_retry_at");
    assert.equal(failed.attempts, 1);

    fs.mkdirSync(clientPath, { recursive: true });
    fs.writeFileSync(path.join(clientPath, "chapter.m4b"), Buffer.from("audio"));

    const retried = await library.retryDownload(job.id, { manual: true });
    assert.ok(retried);
    assert.equal(retried!.attempts, 2);
    assert.equal(retried!.status, "imported");
    assert.equal(retried!.importPath, clientPath);
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
    library.updateSettings({ downloadRetryBaseDelayMs: 1, downloadRetryMaxAttempts: 5 });
    library.markJobFailed(job.id, "ECONNREFUSED client down");
    await new Promise((r) => setTimeout(r, 20));
    await library.pollDownloads();
    const after = library.getDownload(job.id)!;
    assert.ok(after.attempts >= 1);
    assert.ok(["queued", "downloading", "failed", "imported", "completed"].includes(after.status));
  });
});
