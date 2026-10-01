import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { after, before, describe, it } from "node:test";
import { openDatabase } from "../db/database.js";
import { defaultSettings } from "../domain/defaults.js";
import { DownloadClientRegistry } from "../services/download-clients/index.js";
import { importCompletedDownload } from "../services/importer.js";
import { LibraryService } from "../services/library.js";
import { ProwlarrClient } from "../services/prowlarr.js";

describe("download pipeline (mock clients)", () => {
  let tmp: string;
  let library: LibraryService;
  let clients: DownloadClientRegistry;
  let libraryRoot: string;

  before(() => {
    process.env.DOWNLOAD_CLIENT_MODE = "mock";
    process.env.BOOKARR_MOCK_DOWNLOAD_MS = "50";
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), "bookarr-test-"));
    libraryRoot = path.join(tmp, "library");
    fs.mkdirSync(libraryRoot, { recursive: true });
    const db = openDatabase(path.join(tmp, "test.db"));
    const prowlarr = new ProwlarrClient("", "");
    clients = new DownloadClientRegistry(
      defaultSettings({
        libraryRoot,
        autoSearchOnApprove: false,
        metadataMode: "mock",
        mockDownloadMs: 50,
        importMode: "libraryDirect",
      })
    );
    library = new LibraryService(db, prowlarr, clients);
    library.updateSettings({
      libraryRoot,
      downloadClientMode: "mock",
      mockDownloadMs: 50,
      importMode: "libraryDirect",
    });
  });

  after(() => {
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  it("sends grab to mock torrent client and marks available library-direct", async () => {
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

    clients.getMockTorrent().completeNow(job.externalId!);

    const polled = await library.pollDownloads();
    assert.ok(polled.some((j) => j.id === job.id));

    const done = library.getDownload(job.id)!;
    assert.equal(done.status, "imported");
    assert.ok(done.importPath);
    assert.ok(fs.existsSync(path.join(done.importPath!, "chapter-01.mp3")));
    assert.equal(fs.existsSync(path.join(done.importPath!, ".bookarr-imported")), false);

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

  it("library-direct fails when client path is missing (no stub folder)", () => {
    const root = path.join(tmp, "lib2");
    fs.mkdirSync(root, { recursive: true });
    const result = importCompletedDownload({
      libraryRoot: root,
      book: null,
      title: "Missing Title",
      authorName: "Missing Author",
      outputPath: "/nonexistent/path",
      importMode: "libraryDirect",
    });
    assert.equal(result.ok, false);
    assert.equal(result.stub, false);
    assert.equal(result.importPath, null);
    assert.match(result.detail, /not visible|Library-direct/i);
    assert.equal(fs.existsSync(path.join(root, "Missing Author")), false);
  });

  it("library-direct succeeds when audio already in place", () => {
    const root = path.join(tmp, "lib3");
    const dest = path.join(root, "Author", "Title");
    fs.mkdirSync(dest, { recursive: true });
    fs.writeFileSync(path.join(dest, "book.m4b"), Buffer.from("audio"));
    const result = importCompletedDownload({
      libraryRoot: root,
      book: null,
      title: "Title",
      authorName: "Author",
      outputPath: dest,
      importMode: "libraryDirect",
    });
    assert.equal(result.ok, true);
    assert.equal(result.importPath, dest);
    assert.equal(result.stub, false);
    assert.ok(result.files?.includes("book.m4b"));
  });
});
