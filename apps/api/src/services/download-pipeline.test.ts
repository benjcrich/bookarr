import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { after, before, describe, it } from "node:test";
import { openDatabase } from "../db/database.js";
import { DownloadClientRegistry } from "../services/download-clients/index.js";
import { importCompletedDownload } from "../services/importer.js";
import { LibraryService } from "../services/library.js";
import { ProwlarrClient } from "../services/prowlarr.js";

describe("download pipeline (mock clients)", () => {
  let tmp: string;
  let library: LibraryService;
  let clients: DownloadClientRegistry;

  before(() => {
    process.env.DOWNLOAD_CLIENT_MODE = "mock";
    process.env.BOOKARR_MOCK_DOWNLOAD_MS = "50";
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), "bookarr-test-"));
    const db = openDatabase(path.join(tmp, "test.db"));
    const prowlarr = new ProwlarrClient("", "");
    clients = new DownloadClientRegistry({
      prowlarrUrl: "",
      prowlarrApiKey: "",
      libraryRoot: path.join(tmp, "library"),
      qualityProfileId: 1,
      autoSearchOnApprove: false,
      downloadClientMode: "mock",
      qbittorrentUrl: "",
      qbittorrentUsername: "admin",
      qbittorrentPassword: "",
      qbittorrentCategory: "bookarr",
      sabnzbdUrl: "",
      sabnzbdApiKey: "",
      sabnzbdCategory: "bookarr",
      metadataMode: "mock",
      hardcoverApiKey: "",
      metadataCacheTtlHours: 24,
      downloadPollMs: 3000,
      mockDownloadMs: 50,
    });
    library = new LibraryService(db, prowlarr, clients);
    library.updateSettings({
      libraryRoot: path.join(tmp, "library"),
      downloadClientMode: "mock",
      mockDownloadMs: 50,
    });
  });

  after(() => {
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  it("sends grab to mock torrent client and imports on completion", async () => {
    const book = library.upsertAudiobook({
      title: "Pipeline Test",
      authorName: "Test Author",
      wanted: true,
      monitored: true,
    });

    const job = await library.enqueueGrab({
      audiobookId: book.id,
      release: {
        guid: "test-guid-1",
        title: "Pipeline Test [M4B]",
        indexerId: 1,
        indexer: "Mock",
        protocol: "torrent",
        size: 1000,
        downloadUrl: "https://example.invalid/t.torrent",
      },
    });

    assert.equal(job.status, "downloading");
    assert.equal(job.client, "mock");
    assert.ok(job.externalId);

    // Force mock completion
    clients.getMockTorrent().completeNow(job.externalId!);

    const polled = await library.pollDownloads();
    assert.ok(polled.some((j) => j.id === job.id));

    const done = library.getDownload(job.id)!;
    assert.equal(done.status, "imported");
    assert.ok(done.importPath);
    assert.ok(fs.existsSync(path.join(done.importPath!, ".bookarr-imported")));

    const updatedBook = library.getBook(book.id)!;
    assert.equal(updatedBook.status, "available");
    assert.equal(updatedBook.path, done.importPath);
  });

  it("routes usenet protocol to mock usenet client", async () => {
    const job = await library.enqueueGrab({
      release: {
        guid: "test-guid-nzb",
        title: "Usenet Book",
        indexerId: 2,
        indexer: "Mock Usenet",
        protocol: "usenet",
        size: 2000,
        downloadUrl: "https://example.invalid/x.nzb",
      },
    });
    assert.equal(job.client, "mock");
    assert.equal(job.status, "downloading");
    assert.match(job.externalId!, /^mock-usenet-/);
  });

  it("import stub reserves library path when source missing", () => {
    const root = path.join(tmp, "lib2");
    const result = importCompletedDownload({
      libraryRoot: root,
      book: null,
      title: "Stub Title",
      authorName: "Stub Author",
      outputPath: "/nonexistent/path",
    });
    assert.equal(result.ok, true);
    assert.equal(result.stub, true);
    assert.ok(result.importPath);
    assert.ok(fs.existsSync(path.join(result.importPath!, ".bookarr-imported")));
  });
});
