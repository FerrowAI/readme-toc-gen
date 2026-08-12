/**
 * readme-toc-gen
 * Generate a GitHub-style table of contents for markdown, with idempotent
 * marker-based insertion into an existing document. Zero runtime deps.
 */

export interface Heading {
  depth: number; // 1..6
  text: string;
  slug: string;
  line: number; // 0-based line index in the source
}

export interface GenerateOptions {
  /** Inclusive min heading depth to include. Default 2 (skip H1 title). */
  minDepth?: number;
  /** Inclusive max heading depth to include. Default 3. */
  maxDepth?: number;
  /** "bullet" (default) or "numbered". */
  style?: "bullet" | "numbered";
}

export interface InsertOptions extends GenerateOptions {
  /** Marker pair to insert/replace between. Default "<!-- toc -->" / "<!-- tocstop -->". */
  startMarker?: string;
  endMarker?: string;
}

const DEFAULT_START = "<!-- toc -->";
const DEFAULT_END = "<!-- tocstop -->";

const FENCE_RE = /^(\s*)(```|~~~)/;
const ATX_HEADING_RE = /^(#{1,6})\s+(.+?)\s*#*\s*$/;

/**
 * Parse ATX (`#`) headings out of markdown text, correctly skipping
 * headings that appear inside fenced code blocks.
 */
export function parseHeadings(markdown: string): Heading[] {
  const lines = markdown.split(/\r?\n/);
  const headings: Heading[] = [];
  const slugCounts = new Map<string, number>();

  let inFence = false;
  let fenceMarker = "";

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const fenceMatch = FENCE_RE.exec(line);
    if (fenceMatch) {
      const marker = fenceMatch[2];
      if (!inFence) {
        inFence = true;
        fenceMarker = marker;
      } else if (marker === fenceMarker) {
        inFence = false;
        fenceMarker = "";
      }
      continue;
    }
    if (inFence) continue;

    const headingMatch = ATX_HEADING_RE.exec(line);
    if (!headingMatch) continue;

    const depth = headingMatch[1].length;
    const text = headingMatch[2].trim();
    const slug = githubSlug(text, slugCounts);

    headings.push({ depth, text, slug, line: i });
  }

  return headings;
}

/**
 * GitHub-style slugify: lowercase, strip characters that aren't word
 * chars/spaces/hyphens, spaces -> hyphens, dedup collisions with -1, -2, ...
 */
export function githubSlug(text: string, seen?: Map<string, number>): string {
  let base = text
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, "")
    .replace(/\s+/g, "-");

  if (!seen) return base;

  const count = seen.get(base) ?? 0;
  seen.set(base, count + 1);
  return count === 0 ? base : `${base}-${count}`;
}

function renderLine(heading: Heading, minDepth: number, style: "bullet" | "numbered", counters: number[]): string {
  const indentLevel = heading.depth - minDepth;
  const indent = "  ".repeat(Math.max(indentLevel, 0));
  const link = `[${heading.text}](#${heading.slug})`;

  if (style === "numbered") {
    while (counters.length <= indentLevel) counters.push(0);
    counters[indentLevel] += 1;
    for (let i = indentLevel + 1; i < counters.length; i++) counters[i] = 0;
    return `${indent}${counters[indentLevel]}. ${link}`;
  }
  return `${indent}- ${link}`;
}

/** Render a table of contents markdown block from parsed headings. */
export function generateToc(markdown: string, options: GenerateOptions = {}): string {
  const minDepth = options.minDepth ?? 2;
  const maxDepth = options.maxDepth ?? 3;
  const style = options.style ?? "bullet";

  const headings = parseHeadings(markdown).filter(
    (h) => h.depth >= minDepth && h.depth <= maxDepth
  );

  const counters: number[] = [];
  const lines = headings.map((h) => renderLine(h, minDepth, style, counters));
  return lines.join("\n");
}

interface MarkerSpan {
  startLine: number;
  endLine: number;
}

function findMarkerSpan(
  lines: string[],
  startMarker: string,
  endMarker: string
): MarkerSpan | null {
  const startLine = lines.findIndex((l) => l.trim() === startMarker);
  if (startLine === -1) return null;
  const endLine = lines.findIndex(
    (l, i) => i > startLine && l.trim() === endMarker
  );
  if (endLine === -1) return null;
  return { startLine, endLine };
}

/**
 * Insert or replace a TOC block between marker comments. Idempotent: running
 * this twice on its own output produces no further diff.
 */
export function insertToc(markdown: string, options: InsertOptions = {}): string {
  const startMarker = options.startMarker ?? DEFAULT_START;
  const endMarker = options.endMarker ?? DEFAULT_END;
  const toc = generateToc(markdown, options);

  const lines = markdown.split(/\r?\n/);
  const span = findMarkerSpan(lines, startMarker, endMarker);

  const block = [startMarker, "", toc, "", endMarker];

  if (span) {
    const before = lines.slice(0, span.startLine);
    const after = lines.slice(span.endLine + 1);
    return [...before, ...block, ...after].join("\n");
  }

  // No markers yet: insert after the first H1, or at the top of the doc.
  const firstH1 = lines.findIndex((l) => /^#\s+.+/.test(l));
  const insertAt = firstH1 === -1 ? 0 : firstH1 + 1;
  const before = lines.slice(0, insertAt);
  const after = lines.slice(insertAt);
  const separatorBefore = before.length > 0 ? [""] : [];
  const separatorAfter = after.length > 0 && after[0].trim() !== "" ? [""] : [];
  return [...before, ...separatorBefore, ...block, ...separatorAfter, ...after].join("\n");
}

export interface DiffLine {
  type: "add" | "remove" | "context";
  text: string;
}

/** Produce a simple line-based dry-run diff between two markdown strings. */
export function diffToc(original: string, updated: string): DiffLine[] {
  const originalLines = original.split(/\r?\n/);
  const updatedLines = updated.split(/\r?\n/);

  // Simple LCS-based diff, adequate for TOC-block-sized changes.
  const m = originalLines.length;
  const n = updatedLines.length;
  const lcs: number[][] = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));

  for (let i = m - 1; i >= 0; i--) {
    for (let j = n - 1; j >= 0; j--) {
      lcs[i][j] =
        originalLines[i] === updatedLines[j]
          ? lcs[i + 1][j + 1] + 1
          : Math.max(lcs[i + 1][j], lcs[i][j + 1]);
    }
  }

  const result: DiffLine[] = [];
  let i = 0;
  let j = 0;
  while (i < m && j < n) {
    if (originalLines[i] === updatedLines[j]) {
      result.push({ type: "context", text: originalLines[i] });
      i += 1;
      j += 1;
    } else if (lcs[i + 1][j] >= lcs[i][j + 1]) {
      result.push({ type: "remove", text: originalLines[i] });
      i += 1;
    } else {
      result.push({ type: "add", text: updatedLines[j] });
      j += 1;
    }
  }
  while (i < m) {
    result.push({ type: "remove", text: originalLines[i] });
    i += 1;
  }
  while (j < n) {
    result.push({ type: "add", text: updatedLines[j] });
    j += 1;
  }
  return result;
}

/** Render a DiffLine[] as unified-style +/- text, context lines omitted when unchanged runs are long is not applied (kept simple/honest). */
export function formatDiff(diff: DiffLine[]): string {
  return diff
    .filter((d) => d.type !== "context")
    .map((d) => (d.type === "add" ? `+ ${d.text}` : `- ${d.text}`))
    .join("\n");
}
