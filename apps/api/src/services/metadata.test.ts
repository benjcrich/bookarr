import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { after, before, describe, it } from "node:test";
import { openDatabase } from "../db/database.js";
import { MetadataService } from "./metadata/index.js";
import type { AppSettings } from "../domain/types.js";

function settings(tmp: string, mode: "mock" | "auto" = "mock"): AppSettings {
  return {
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
    metadataMode: mode,
    hardcoverApiKey: "",
    metadataCacheTtlHours: 24,
    downloadPollMs: 3000,
    mockDownloadMs: 1500,
  };
}

describe("metadata providers (mock)", () => {
  let tmp: string;
  let metadata: MetadataService;
  let s: AppSettings;

  before(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), "bookarr-meta-"));
    const db = openDatabase(path.join(tmp, "meta.db"));
    s = settings(tmp, "mock");
    metadata = new MetadataService(db, s);
  });

  after(() => {
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  it("returns mock catalog hits for known titles", async () => {
    const { results, providers, cached } = await metadata.search("Mistborn", s, {
      bypassCache: true,
    });
    assert.equal(cached, false);
    assert.ok(providers.includes("mock"));
    assert.ok(results.length >= 1);
    assert.equal(results[0].title.includes("Mistborn") || results[0].authorName.includes("Sanderson"), true);
    assert.ok(results[0].coverUrl || results[0].isbn || results[0].asin);
  });

  it("caches subsequent searches", async () => {
    await metadata.search("Project Hail Mary", s, { bypassCache: true });
    const second = await metadata.search("Project Hail Mary", s);
    assert.equal(second.cached, true);
    assert.deepEqual(second.providers, ["cache"]);
    assert.ok(second.results.some((r) => r.title.includes("Hail Mary")));
  });

  it("falls back to synthetic mock when query unknown", async () => {
    const { results } = await metadata.search("Completely Unknown Book XYZ", s, {
      bypassCache: true,
    });
    assert.equal(results.length, 1);
    assert.equal(results[0].provider, "mock");
    assert.equal(results[0].title, "Completely Unknown Book XYZ");
  });
});
