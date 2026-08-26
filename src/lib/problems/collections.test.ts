import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { coerceCollection, defaultCollectionName, mergeCollections } from "./collections.ts";

describe("collections", () => {
  it("coerces a named group", () => {
    const item = coerceCollection({ id: "c1", name: "3月月考卷", kind: "exam", createdAt: 1, updatedAt: 2 });
    assert.equal(item?.name, "3月月考卷");
    assert.equal(item?.kind, "exam");
  });

  it("merges groups by updatedAt", () => {
    const merged = mergeCollections(
      [{ id: "c1", name: "新", kind: "unit", createdAt: 1, updatedAt: 5 }],
      [{ id: "c1", name: "旧", kind: "exam", createdAt: 1, updatedAt: 2 }],
    );
    assert.equal(merged[0]?.name, "新");
    assert.equal(merged[0]?.kind, "unit");
  });

  it("builds a default capture group name", () => {
    const name = defaultCollectionName(new Date(2026, 7, 26).getTime());
    assert.equal(name, "8月26日拍题");
  });
});
