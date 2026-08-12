# readme-toc-gen

Generate a GitHub-style table of contents for markdown files, with idempotent marker-based
insertion and dry-run diffs. Strict TypeScript, zero runtime dependencies.

## Why

TOC generators that regex-match `^#+ ` against raw text pick up fake headings inside fenced code
blocks (documentation-about-markdown is the classic trigger). This one tracks fence state while
scanning, so ```` ``` ```` / `~~~` blocks are correctly skipped, and its marker-based insertion is
provably idempotent — running it twice never produces a diff.

## Quickstart

```ts
import { insertToc, generateToc } from "readme-toc-gen";
import { readFileSync, writeFileSync } from "node:fs";

const doc = readFileSync("README.md", "utf8");
writeFileSync("README.md", insertToc(doc, { minDepth: 2, maxDepth: 3 }));
```

Add markers to your README once (or let `insertToc` add them after the first `# Title` automatically):

```md
<!-- toc -->
<!-- tocstop -->
```

## API

### `parseHeadings(markdown): Heading[]`
Parses ATX headings, skipping fenced code blocks. Each result has `depth`, `text`, `slug`, `line`.

### `githubSlug(text, seen?)`
GitHub-compatible slugify. Pass a shared `Map` as `seen` across headings in a document to get
`-1`, `-2` dedup for repeated heading text.

### `generateToc(markdown, options?)`
Renders a TOC block. `options.minDepth` (default `2`), `options.maxDepth` (default `3`),
`options.style` (`"bullet"` default, or `"numbered"`).

### `insertToc(markdown, options?)`
Inserts or replaces a TOC between `options.startMarker`/`options.endMarker`
(default `<!-- toc -->` / `<!-- tocstop -->`). If markers aren't present, inserts them after the
first `# H1`, or at the top of the document. **Idempotent** — a second call on the output is a no-op.

### `diffToc(original, updated)` / `formatDiff(diff)`
Line-based diff between two markdown strings, for a dry-run preview before writing.

## Limits

- ATX (`#`) headings only — Setext (`===`/`---` underline) headings are not detected.
- Fence detection matches ` ``` ` and `~~~` at line start (optionally indented); it does not handle
  every edge case of nested/mismatched fence markers.
- The diff helper is a simple LCS line diff, sized for TOC-block-scale changes, not a general-purpose
  diff engine.

---
Part of the [ferrow-toolkit](https://github.com/FerrowAI/ferrow-toolkit) collection · Sponsored by [Ferrow](https://ferrow.ai)
