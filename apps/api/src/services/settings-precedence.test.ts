import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { after, before, describe, it } from "node:test";
import { openDatabase } from "../db/database.js";
import { defaultSettings } from "../domain/defaults.js";
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
    const clients = new DownloadClientRegistry(defaultSettings());
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

  it("persists prowlarr indexer and category filters", async () => {
    library.updateSettings({
      prowlarrIndexerIds: [1, 4],
      prowlarrCategories: [3030],
    });
    const s = library.getSettings();
    assert.deepEqual(s.prowlarrIndexerIds, [1, 4]);
    assert.deepEqual(s.prowlarrCategories, [3030]);
    const releases = await library.searchReleases("Mistborn");
    assert.ok(releases.every((r) => r.indexerId === 1 || r.indexerId === 4));
  });
});
