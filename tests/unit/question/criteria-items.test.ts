import { describe, it, expect } from "vitest";
import { criteriaItemsFromOutput } from "@/lib/question/criteria";

describe("criteriaItemsFromOutput", () => {
  it("achata inclusion/exclusion/searchTerms preservando o kind", () => {
    const items = criteriaItemsFromOutput({
      inclusion: ["A", "B"],
      exclusion: ["C"],
      searchTerms: ["d", "e"],
    });
    expect(items).toEqual([
      { kind: "inclusion", text: "A" },
      { kind: "inclusion", text: "B" },
      { kind: "exclusion", text: "C" },
      { kind: "search_term", text: "d" },
      { kind: "search_term", text: "e" },
    ]);
  });

  it("lida com listas vazias (not_found)", () => {
    expect(
      criteriaItemsFromOutput({
        inclusion: [],
        exclusion: [],
        searchTerms: [],
      }),
    ).toEqual([]);
  });
});
