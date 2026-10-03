#!/usr/bin/env node
/**
 * scripts/check-broker-voice.mjs
 *
 * Lint that scans client-facing copy for language that would cross a
 * broker's voice-tone contract. Reads the contracts from
 * `lib/brokers/contracts.ts` and scans `components/` and `app/` for
 * any string that would have matched a forbidden phrase.
 *
 * Plain Node, no tsx/tsc — the patterns are small and the contracts
 * are mirrored here as a static block. If a desk adds a new
 * forbidden phrase, the mirror must be updated.
 *
 * Exit 0 = clean. Exit 1 = violations. Exit 2 = internal.
 */

import { readdir, stat, createReadStream } from 'node:fs';
import { join, relative } from 'node:path';
import { createInterface } from 'node:readline';

const ROOT = process.cwd();
const SCAN_DIRS = ['components', 'app', 'lib'];
const SKIP_FILES = new Set([
  'lib/brokers/contracts.ts',
  'scripts/check-broker-voice.mjs',
]);
const SKIP_DIRS = new Set([
  'node_modules', '.next', 'dist', 'build', 'coverage', 'test-results', 'docs',
]);

/** Mirror of lib/brokers/contracts.ts — keep in sync. */
const COMMON_FORBIDDEN = [
  { category: 'recommendation', pattern: /\b(?:you should|you must|I'd recommend|we recommend|I recommend)\b/i },
  { category: 'prediction', pattern: /\b(?:the price will|I think (?:it|NVDA|AAPL|[A-Z]{1,5}) will|it will (?:go up|go down|moon|tank|soar|crash)|guaranteed|to the moon)\b/i },
  { category: 'portfolio advice', pattern: /\b(?:put all your (?:money|funds|portfolio)|you can'?t lose|risk-free|free money)\b/i },
  { category: 'pretend authority', pattern: /\b(?:I (?:am a|have a) (?:licensed|registered|chartered) (?:financial|investment) (?:advisor|adviser|analyst|broker|planner))\b/i },
  { category: 'compare to its own past', pattern: /\b(?:I called (?:it|this) when|as I (?:said|warned) (?:before|earlier|last (?:week|month)))\b/i },
];

const PER_DESK = {
  hetty: [
    { category: 'overconfidence', pattern: /\b(?:this is a sure thing|cannot lose|will definitely)\b/i },
  ],
  jesse: [
    { category: 'fomo', pattern: /\b(?:don’?t miss (?:out|this)|last chance|get in before (?:it|everyone))\b/i },
  ],
  isabel: [],
  halley: [
    { category: 'fake provenance', pattern: /\b(?:this token is backed by|fully collateralized|audited and safe)\b/i },
  ],
  arbitrum: [],
};

/**
 * Build the merged per-desk forbidden list. Each desk carries the
 * common list and its own extras.
 */
function forbiddenFor(deskId) {
  return [...COMMON_FORBIDDEN, ...(PER_DESK[deskId] ?? [])];
}

async function* walk(dir) {
  let entries;
  try { entries = await readdir(dir, { withFileTypes: true }); } catch { return; }
  for (const entry of entries) {
    if (SKIP_DIRS.has(entry.name)) continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      yield* walk(full);
    } else if (entry.isFile() && /\.(t|j)sx?$/.test(entry.name)) {
      yield full;
    }
  }
}

async function scanFile(file) {
  const rel = relative(ROOT, file);
  const out = [];
  // We lint the *whole* file once per desk, since copy may live in a
  // component that renders for a specific desk. To keep the noise
  // down, we still record which desk the violation belongs to.
  const stream = createInterface({ input: createReadStream(file), crlfDelay: Infinity });
  let lineNo = 0;
  for await (const line of stream) {
    lineNo += 1;
    if (/^\s*(\/\/|\*|\/\*)/.test(line)) continue;
    for (const deskId of Object.keys(forbiddenFor)) {
      for (const { category, pattern } of forbiddenFor(deskId)) {
        const re = new RegExp(pattern.source, pattern.flags);
        const m = re.exec(line);
        if (m) {
          out.push({ file: rel, line: lineNo, match: m[0], category, deskId });
        }
      }
    }
    if (out.length > 50) return out; // safety cap
  }
  return out;
}

async function main() {
  const violations = [];
  for (const top of SCAN_DIRS) {
    const dir = join(ROOT, top);
    try {
      const s = await stat(dir);
      if (!s.isDirectory()) continue;
    } catch {
      continue;
    }
    for await (const file of walk(dir)) {
      if (SKIP_FILES.has(relative(ROOT, file))) continue;
      const found = await scanFile(file);
      for (const v of found) violations.push(v);
    }
  }
  if (violations.length === 0) {
    process.stdout.write('check-broker-voice: clean — no client copy matches a forbidden phrase.\n');
    return;
  }
  process.stderr.write(`check-broker-voice: ${violations.length} violation(s)\n\n`);
  for (const v of violations) {
    process.stderr.write(`  ${v.file}:${v.line}  (${v.deskId} · ${v.category})\n`);
    process.stderr.write(`    found:    ${JSON.stringify(v.match)}\n\n`);
  }
  process.exit(1);
}

main().catch(err => {
  process.stderr.write(`check-broker-voice: ${err instanceof Error ? err.message : String(err)}\n`);
  process.exit(2);
});