import { describe, expect, it } from "vitest";
import { createMemoryExpenseStore } from "../src/store/memory.js";

describe("Semantic Search In-Memory Stub", () => {
  it("returns empty array for semantic search queries in memory store", async () => {
    const store = createMemoryExpenseStore();
    const results = await store.searchExpensesSemantic("user-one", "restaurants");
    expect(results).toEqual([]);
  });
});
