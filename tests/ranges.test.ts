import { describe, expect, it } from "vitest";
import { expandPageRanges, parsePageRanges } from "../src/lib/ranges";

describe("page ranges", () => {
  it("parses single pages and ranges", () => {
    expect(parsePageRanges("1-3, 5, 7-8", 10)).toEqual([
      { start: 1, end: 3 },
      { start: 5, end: 5 },
      { start: 7, end: 8 }
    ]);
  });

  it("expands to zero-based page indexes", () => {
    expect(expandPageRanges([{ start: 2, end: 4 }])).toEqual([1, 2, 3]);
  });

  it("rejects invalid ranges", () => {
    expect(() => parsePageRanges("3-1", 5)).toThrow();
    expect(() => parsePageRanges("9", 5)).toThrow();
    expect(() => parsePageRanges("hello", 5)).toThrow();
  });
});
