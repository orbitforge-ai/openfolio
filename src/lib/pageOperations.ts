import type { PageState } from "../types";

export function createInitialPages(pageCount: number): PageState[] {
  return Array.from({ length: pageCount }, (_, sourceIndex) => ({
    sourceIndex,
    rotation: 0,
    deleted: false
  }));
}

export function visiblePages(pages: PageState[]): PageState[] {
  return pages.filter((page) => !page.deleted);
}

export function movePage(pages: PageState[], fromIndex: number, toIndex: number): PageState[] {
  const next = [...pages];
  const [page] = next.splice(fromIndex, 1);
  if (!page) return pages;
  next.splice(toIndex, 0, page);
  return next;
}

export function rotatePage(pages: PageState[], index: number, delta = 90): PageState[] {
  return pages.map((page, pageIndex) =>
    pageIndex === index ? { ...page, rotation: normalizeRotation(page.rotation + delta) } : page
  );
}

export function deletePage(pages: PageState[], index: number): PageState[] {
  if (visiblePages(pages).length <= 1) return pages;
  return pages.map((page, pageIndex) => (pageIndex === index ? { ...page, deleted: true } : page));
}

export function duplicatePage(pages: PageState[], index: number): PageState[] {
  const page = pages[index];
  if (!page) return pages;
  const next = [...pages];
  next.splice(index + 1, 0, { ...page });
  return next;
}

export function normalizeRotation(rotation: number): number {
  return ((rotation % 360) + 360) % 360;
}
