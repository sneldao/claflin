#!/usr/bin/env node
/**
 * scripts/check-broker-voice.mjs
 *
 * Lint that scans client-facing copy for language that would cross a
 * broker's voice-tone contract. Reads the contracts from
 * `lib/brokers/contracts.ts` and scans `components/` and `app/` for
 * any string that would have matched a forbidden phrase.
 *
 * Node 24 strips the contracts' types; no duplicate regex registry.
 *
 * Exit 0 = clean. Exit 1 = violations. Exit 2 = internal.
 */

import { createReadStream } from 'node:fs';
import { readdir, stat } from 'node:fs/promises';
import { BROKER_CONTRACTS } from '../lib/brokers/contracts.ts';
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
  // We lint the *whole* file once per desk, since copy may live in a
  // component that renders for a specific desk. To keep the noise
  // down, we still record which desk the violation belongs to.
  const stream = createInterface({ input: createReadStream(file), crlfDelay: Infinity });
  let lineNo = 0;
  for await (const line of stream) {
    lineNo += 1;
    if (/^\s*(\/\/|\*|\/\*)/.test(line)) continue;
    for (const [deskId, contract] of Object.entries(BROKER_CONTRACTS)) {
      for (const { category, pattern } of contract.forbiddenPhrases) {
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
    process.stdout.write(`check-broker-voice: clean — scanned ${scanned} source files against the broker contracts.\n`);
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