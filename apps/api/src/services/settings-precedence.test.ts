import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { after, before, describe, it } from "node:test";
import { openDatabase } from "../db/database.js";
import { DownloadClientRegistry } from "./download-clients/index.js";
import { LibraryService } from "./library.js";
import { ProwlarrClient } from "./prowlarr.js";

describe("settings precedence (UI/DB over env)", () => {
  let tmp: string;
  let library: LibraryService;
  let prevUrl: string | undefined;
  let prevKey: string | undefined;

  before(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), "bookarr-settings-"));
    prevUrl = process.env.PROWLARR_URL;
    prevKey = process.env.PROWLARR_API_KEY;
    process.env.PROWLARR_URL = "http://env-prowlarr:9696";
    process.env.PROWLARR_API_KEY = "env-secret";
    const db = openDatabase(path.join(tmp, "settings.db"));
    const clients = new DownloadClientRegistry({
      prowlarrUrl: "",
      prowlarrApiKey: "",
      libraryRoot: "/data/audiobooks",
      qualityProfileId: 1,
      autoSearchOnApprove: true,
      downloadClientMode: "mock",
      qbittorrentUrl: "",
      qbittorrentUsername: "admin",
      qbittorrentPassword: "",
      qbittorrentCategory: "bookarr",
      sabnzbdUrl: "",
      sabnzbdApiKey: "",
      sabnzbdCategory: "bookarr",
      metadataMode: "auto",
      hardcoverApiKey: "",
      metadataCacheTtlHours: 24,
      downloadPollMs: 3000,
      mockDownloadMs: 1500,
    });
    library = new LibraryService(db, new ProwlarrClient("", ""), clients);
    library.bootstrapEnvIntoDb();
  });

  after(() => {
    if (prevUrl === undefined) delete process.env.PROWLARR_URL;
    else process.env.PROWLARR_URL = prevUrl;
    if (prevKey === undefined) delete process.env.PROWLARR_API_KEY;
    else process.env.PROWLARR_API_KEY = prevKey;
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  it("bootstraps env into empty DB", () => {
    const s = library.getSettings();
    assert.equal(s.prowlarrUrl, "http://env-prowlarr:9696");
    assert.equal(s.prowlarrApiKey, "env-secret");
  });

  it("UI save wins over env on subsequent reads and re-bootstrap", () => {
    library.updateSettings({
      prowlarrUrl: "http://ui-prowlarr:9696",
      prowlarrApiKey: "ui-secret",
    });
    process.env.PROWLARR_URL = "http://env-should-not-win:9696";
    process.env.PROWLARR_API_KEY = "env-should-not-win";
    library.bootstrapEnvIntoDb();
    const s = library.getSettings();
    assert.equal(s.prowlarrUrl, "http://ui-prowlarr:9696");
    assert.equal(s.prowlarrApiKey, "ui-secret");
  });

  it("clearSecrets removes stored secrets", () => {
    library.updateSettings({}, { clearSecrets: ["prowlarrApiKey"] });
    const s = library.getSettings();
    assert.equal(s.prowlarrApiKey, "");
    const pub = library.publicSettings();
    assert.equal(pub.prowlarrApiKeySet, false);
  });

  it("masks secrets in publicSettings", () => {
    library.updateSettings({ sabnzbdApiKey: "super-secret" });
    const pub = library.publicSettings();
    assert.equal(pub.sabnzbdApiKey, "••••••••");
    assert.equal(pub.sabnzbdApiKeySet, true);
  });
});
