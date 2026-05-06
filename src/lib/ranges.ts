export interface PageRange {
  start: number;
  end: number;
}

export function parsePageRanges(input: string, pageCount: number): PageRange[] {
  if (!input.trim()) return [];

  return input
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => parseRangePart(part, pageCount));
}

export function expandPageRanges(ranges: PageRange[]): number[] {
  return ranges.flatMap((range) => {
    const pages: number[] = [];
    for (let page = range.start; page <= range.end; page += 1) {
      pages.push(page - 1);
    }
    return pages;
  });
}

function parseRangePart(part: string, pageCount: number): PageRange {
  const match = part.match(/^(\d+)(?:-(\d+))?$/);
  if (!match) {
    throw new Error(`Invalid page range: ${part}`);
  }

  const start = Number(match[1]);
  const end = Number(match[2] ?? match[1]);
  if (start < 1 || end < 1 || start > pageCount || end > pageCount || start > end) {
    throw new Error(`Page range is outside 1-${pageCount}: ${part}`);
  }

  return { start, end };
}
