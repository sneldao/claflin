#!/usr/bin/env node
/**
 * scripts/check-desk-copy.mjs
 *
 * Hard rule: client-facing product copy must not hard-code desk labels.
 * All desk name / market / venue copy must come from `lib/desktop.canon.ts`.
 *
 * Plain Node (no tsx/tsc) so it runs in any environment without
 * triggering TypeScript project resolution. Logic mirrors the
 * TypeScript original; keeping both would invite drift, so this is the
 * single source and check-desk-copy.ts re-exports through it.
 *
 * Exit code 0 = clean. Exit code 1 = violations. Exit code 2 = internal.
 *
 * Forbidden patterns:
 *   - "the Meteora desk" / "Meteora desk" / "MarieSol"
 *   - "the Solana desk" / "the Base desk" / "the Robinhood Chain desk"
 *     used as identity (rail-as-strategy errors)
 *   - "Meteora DBC desk"
 *
 * Allowed contexts (silenced):
 *   - lib/desktop.canon.ts (the source itself)
 *   - lib/house.ts (legacy desk directory; reconciled below)
 *   - doc comments and JSDoc
 *   - import paths / variable names
 */

import { createReadStream } from 'node:fs';
import { readdir, stat } from 'node:fs/promises';
import { join, relative } from 'node:path';
import { createInterface } from 'node:readline';

const ROOT = process.cwd();
const SCAN_DIRS = ['components', 'app', 'lib'];
const SKIP_FILES = new Set([
  'lib/desktop.canon.ts',
  'lib/house.ts',
  'scripts/check-desk-copy.ts',
  'scripts/check-desk-copy.mjs',
]);
const SKIP_DIRS = new Set([
  'node_modules',
  '.next',
  'dist',
  'build',
  'coverage',
  'test-results',
  'docs',
]);

const RULES = [
  { pattern: /\b(?:the\s+)?Meteora\s+desk\b/i, reason: 'call it "the launch desk" or "Halley" — the venue is Meteora DBC, not the desk\'s identity' },
  { pattern: /\bMarieSol\b/i, reason: 'replaced by Halley — the launch desk identity' },
  { pattern: /\bthe\s+Solana\s+desk\b/i, reason: 'call it "Jesse" or "the Solana tape desk"; "Solana desk" makes the rail the brand' },
  { pattern: /\bthe\s+Base\s+desk\b/i, reason: 'call it "Hetty" or "the Base tape desk"' },
  { pattern: /\bthe\s+Robinhood(?:\s+Chain)?\s+desk\b/i, reason: 'call it "Isabel" or "the Robinhood Chain tape desk"' },
  { pattern: /\bMeteora\s+DBC\s+desk\b/i, reason: 'the venue is a property of Halley, not the desk\'s identity' },
];

async function* walk(dir) {
  let entries;
  entries = await readdir(dir, { withFileTypes: true });
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
  const stream = createInterface({ input: createReadStream(file), crlfDelay: Infinity });
  let lineNo = 0;
  for await (const line of stream) {
    lineNo += 1;
    // Best-effort comment-line skip.
    if (/^\s*(\/\/|\*|\/\*)/.test(line)) continue;
    for (const { pattern, reason } of RULES) {
      const re = new RegExp(pattern.source, `${pattern.flags}g`);
      let m;
      while ((m = re.exec(line)) !== null) {
        const before = line[m.index - 1];
        const after = line[m.index + m[0].length];
        // Skip when surrounded by camelCase identifiers (variable names).
        if (before && /[a-z]/.test(before)) continue;
        if (after && /[a-z]/.test(after)) continue;
        out.push({ file: rel, line: lineNo, column: m.index + 1, match: m[0], reason });
        if (out.length > 200) return out; // safety cap
      }
    }
  }
  return out;
}

async function main() {
  const violations = [];
  let scanned = 0;
  for (const top of SCAN_DIRS) {
    const dir = join(ROOT, top);
    try {
      const s = await stat(dir);
      if (!s.isDirectory()) continue;
    } catch (err) {
      if (err.code === 'ENOENT') continue;
      throw err;
    }
    for await (const file of walk(dir)) {
      if (SKIP_FILES.has(relative(ROOT, file))) continue;
      scanned += 1;
      const found = await scanFile(file);
      for (const v of found) violations.push(v);
    }
  }
  if (scanned === 0) throw new Error('No source files were scanned; run from the repository root.');
  if (violations.length === 0) {
    process.stdout.write(`check-desk-copy: clean — scanned ${scanned} source files for forbidden desk labels.\n`);
    return;
  }
  process.stderr.write(`check-desk-copy: ${violations.length} violation(s)\n\n`);
  for (const v of violations) {
    process.stderr.write(`  ${v.file}:${v.line}:${v.column}\n`);
    process.stderr.write(`    found:    ${JSON.stringify(v.match)}\n`);
    process.stderr.write(`    why:      ${v.reason}\n\n`);
  }
  process.exit(1);
}

main().catch(err => {
  process.stderr.write(`check-desk-copy: ${err instanceof Error ? err.message : String(err)}\n`);
  process.exit(2);
});