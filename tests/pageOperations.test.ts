import { describe, expect, it } from "vitest";
import { createInitialPages, deletePage, duplicatePage, movePage, rotatePage, visiblePages } from "../src/lib/pageOperations";

describe("page operations", () => {
  it("moves pages without mutating the original array", () => {
    const pages = createInitialPages(3);
    const moved = movePage(pages, 0, 2);
    expect(moved.map((page) => page.sourceIndex)).toEqual([1, 2, 0]);
    expect(pages.map((page) => page.sourceIndex)).toEqual([0, 1, 2]);
  });

  it("rotates pages in 90 degree steps", () => {
    expect(rotatePage(createInitialPages(1), 0)[0].rotation).toBe(90);
    expect(rotatePage([{ sourceIndex: 0, rotation: 270, deleted: false }], 0)[0].rotation).toBe(0);
  });

  it("does not delete the last visible page", () => {
    const pages = createInitialPages(1);
    expect(deletePage(pages, 0)).toEqual(pages);
  });

  it("duplicates and hides pages", () => {
    const pages = duplicatePage(createInitialPages(2), 0);
    expect(pages.map((page) => page.sourceIndex)).toEqual([0, 0, 1]);
    expect(visiblePages(deletePage(pages, 1))).toHaveLength(2);
  });
});
