const { insertToc, generateToc, formatDiff, diffToc } = require("../dist/index.js");

const doc = `# My Project

Some intro text.

## Installation

Steps here.

\`\`\`md
# This is not a real heading — it's inside a fenced code block
## Neither is this
\`\`\`

## Usage

### Basic Usage

Details.

### Advanced Usage

More details.

## Usage

Duplicate heading text on purpose, to prove slug dedup.
`;

console.log("--- Raw TOC (depth 2-3) ---");
console.log(generateToc(doc));

console.log("\n--- Fenced fake-headings check ---");
const toc = generateToc(doc);
if (toc.includes("This is not a real heading") || toc.includes("Neither is this")) {
  throw new Error("demo assertion failed: fenced fake headings leaked into TOC");
}
console.log("Fenced code-block headings correctly ignored.");

console.log("\n--- Slug dedup check ---");
if (!toc.includes("(#usage)") || !toc.includes("(#usage-1)")) {
  throw new Error("demo assertion failed: expected usage + usage-1 slugs");
}
console.log("Duplicate 'Usage' headings deduped to #usage and #usage-1.");

console.log("\n--- Insert TOC into doc ---");
const withToc = insertToc(doc);
console.log(withToc);

console.log("\n--- Idempotency check: run insertToc twice ---");
const runTwice = insertToc(withToc);
const diff = diffToc(withToc, runTwice);
const changedLines = formatDiff(diff);
console.log(`Diff between run 1 and run 2 output: "${changedLines}" (expected empty)`);
if (changedLines.length !== 0) {
  throw new Error("demo assertion failed: second run was not a no-op");
}

console.log("\nDemo assertions passed.");
