import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { after, before, describe, it } from "node:test";
import {
  applyPathMappings,
  importCompletedDownload,
  parsePathMappings,
} from "./importer.js";

describe("importer + path mappings", () => {
  let tmp: string;

  before(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), "bookarr-import-"));
  });

  after(() => {
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  it("applyPathMappings rewrites longest matching prefix", () => {
    const mapped = applyPathMappings("/data/downloads/book/file", [
      { remote: "/data/downloads", local: "/downloads" },
      { remote: "/data", local: "/mnt/data" },
    ]);
    assert.equal(mapped, "/downloads/book/file");
  });

  it("parsePathMappings accepts JSON and remote=local pairs", () => {
    assert.deepEqual(parsePathMappings('[{"remote":"/a","local":"/b"}]'), [
      { remote: "/a", local: "/b" },
    ]);
    assert.deepEqual(parsePathMappings("/downloads=/mnt/dl;/other=/o"), [
      { remote: "/downloads", local: "/mnt/dl" },
      { remote: "/other", local: "/o" },
    ]);
  });

  it("fails when source missing after mapping (no stub success)", () => {
    const lib = path.join(tmp, "lib-missing");
    const result = importCompletedDownload({
      libraryRoot: lib,
      book: null,
      title: "Missing Source",
      authorName: "Author",
      outputPath: "/client/downloads/Missing",
      pathMappings: [{ remote: "/client/downloads", local: path.join(tmp, "not-there") }],
      importMode: "copy",
    });
    assert.equal(result.ok, false);
    assert.equal(result.stub, false);
    assert.match(result.detail, /source not visible|Remote Path Mapping/i);
    assert.equal(result.importPath, null);
  });

  it("copies audio files into Author/Title", () => {
    const src = path.join(tmp, "src", "Artemis");
    const lib = path.join(tmp, "lib-ok");
    fs.mkdirSync(src, { recursive: true });
    fs.writeFileSync(path.join(src, "01.mp3"), "audio");
    fs.writeFileSync(path.join(src, "readme.txt"), "ignore");

    const result = importCompletedDownload({
      libraryRoot: lib,
      book: null,
      title: "Artemis Fowl",
      authorName: "Eoin Colfer",
      outputPath: "/downloads/Artemis",
      pathMappings: [{ remote: "/downloads", local: path.join(tmp, "src") }],
      importMode: "copy",
    });
    assert.equal(result.ok, true);
    assert.equal(result.stub, false);
    assert.equal(result.mode, "copy");
    assert.ok(result.importPath);
    assert.ok(fs.existsSync(path.join(result.importPath!, "01.mp3")));
    assert.ok(fs.existsSync(path.join(result.importPath!, ".bookarr-imported")));
    assert.ok(!fs.existsSync(path.join(result.importPath!, "readme.txt")));
  });

  it("hardlinks when requested on same filesystem", () => {
    const src = path.join(tmp, "src-hl");
    const lib = path.join(tmp, "lib-hl");
    fs.mkdirSync(src, { recursive: true });
    fs.writeFileSync(path.join(src, "book.m4b"), "m4bdata");
    const result = importCompletedDownload({
      libraryRoot: lib,
      book: null,
      title: "HL Book",
      authorName: "Author",
      outputPath: src,
      importMode: "hardlink",
    });
    assert.equal(result.ok, true);
    assert.ok(result.mode === "hardlink" || result.mode === "copy");
    assert.ok(fs.existsSync(path.join(result.importPath!, "book.m4b")));
  });
});
