import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { parseIdList, serializeIdList } from "../domain/types.js";
import { buildProwlarrSearchQuery, ProwlarrClient } from "./prowlarr.js";

describe("prowlarr search filters", () => {
  it("parseIdList accepts comma, space, JSON", () => {
    assert.deepEqual(parseIdList("3030, 1;2"), [1, 2, 3030]);
    assert.deepEqual(parseIdList("[1, 3, 3]"), [1, 3]);
    assert.deepEqual(parseIdList(""), []);
    assert.deepEqual(serializeIdList([3, 1, 1]), "1,3");
  });

  it("buildProwlarrSearchQuery omits empty filters", () => {
    const qs = buildProwlarrSearchQuery("Mistborn");
    assert.equal(qs, "query=Mistborn&type=search");
  });

  it("buildProwlarrSearchQuery includes indexerIds and categories when set", () => {
    const qs = buildProwlarrSearchQuery("Stormlight", {
      indexerIds: [1, 4],
      categories: [3030],
    });
    const params = new URLSearchParams(qs);
    assert.equal(params.get("query"), "Stormlight");
    assert.deepEqual(params.getAll("indexerIds"), ["1", "4"]);
    assert.deepEqual(params.getAll("categories"), ["3030"]);
  });

  it("mock search respects indexer filter alone", async () => {
    const client = new ProwlarrClient("", "");
    const results = await client.search("Mistborn", { indexerIds: [1] });
    assert.ok(results.every((r) => r.indexerId === 1));
    assert.ok(results.length >= 1);
  });

  it("mock search respects category audiobook filter alone", async () => {
    const client = new ProwlarrClient("", "");
    const results = await client.search("Mistborn", { categories: [3030] });
    assert.ok(results.every((r) => r.indexerId === 1 || r.indexerId === 2));
    assert.ok(!results.some((r) => r.indexerId === 3));
  });

  it("mock search applies both filters when set", async () => {
    const client = new ProwlarrClient("", "");
    const results = await client.search("Mistborn", {
      indexerIds: [1, 3],
      categories: [3030],
    });
    assert.deepEqual(
      results.map((r) => r.indexerId),
      [1]
    );
  });
});
