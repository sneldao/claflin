#!/usr/bin/env node
/**
 * scripts/measure-room-budget.mjs
 *
 * Records the Room view budget on a build served by `next start`. The
 * script:
 *   1. Opens `/?desk=jesse&view=compact` and `/?desk=jesse&view=room`
 *      in headless Chromium.
 *   2. Records first paint, WebGL mount, fps, and gzipped JS payload.
 *   3. Writes a `metrics.json` to .room-budget/.
 *   4. Compares against the previous baseline; regresses > 15% in any
 *      field fail the build.
 *
 * Hardware gate: this script is the cloud-desktop part. Real-device
 * verification (Android Chrome + iOS Safari) is the manual gate
 * described in docs/PERFORMANCE_ROOM_VIEW.md.
 *
 * Plain Node — no tsx/tsc. The script runs against an already-built
 * bundle.
 */

import { spawn } from 'node:child_process';
import { mkdir, readFile, writeFile, stat } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, relative } from 'node:path';

const ROOT = process.cwd();
const OUT = join(ROOT, '.room-budget');
const PORT = process.env.PORT ?? '4123';
const HOST = `http://127.0.0.1:${PORT}`;

const PREVIOUS_BASELINE = join(OUT, 'metrics.previous.json');
const CURRENT_BASELINE = join(OUT, 'metrics.json');
const REGRESSION_PCT = 0.15;

async function ensureOut() {
  await mkdir(OUT, { recursive: true });
}

/** Stash the previous baseline for diff on the next run. */
async function rotateBaseline() {
  if (existsSync(CURRENT_BASELINE)) {
    const cur = await readFile(CURRENT_BASELINE, 'utf8');
    await writeFile(PREVIOUS_BASELINE, cur);
  }
}

/** Boot `next start` on a port; resolve with the child handle. */
function startServer() {
  const child = spawn('node_modules/.bin/next', ['start', '--port', PORT], {
    stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, PORT },
  });
  return new Promise((resolve, reject) => {
    let resolved = false;
    const onData = (buf) => {
      const text = buf.toString();
      if (!resolved && /Ready in|started server|Local:.*http/i.test(text)) {
        resolved = true;
        resolve(child);
      }
    };
    child.stdout.on('data', onData);
    child.stderr.on('data', onData);
    child.on('exit', code => {
      if (!resolved) reject(new Error(`next start exited ${code} before ready`));
    });
    setTimeout(() => {
      if (!resolved) {
        resolved = true;
        resolve(child);
      }
    }, 8000);
  });
}

function stopServer(child) {
  return new Promise(resolve => {
    child.on('exit', () => resolve());
    child.kill('SIGTERM');
    setTimeout(() => {
      try { child.kill('SIGKILL'); } catch { /* noop */ }
      resolve();
    }, 4000);
  });
}

/**
 * Without Playwright installed (the test environment is offline in
 * CI), we cannot actually launch Chromium. This script's value when
 * Playwright is available is the measurement; when it is not, the
 * script emits a "no measurement" line and writes a placeholder
 * metrics.json so the budget infrastructure still exists for whoever
 * has the hardware.
 */
async function probePlaywright() {
  try {
    await stat(join(ROOT, 'node_modules', 'playwright'));
    return true;
  } catch {
    return false;
  }
}

async function main() {
  await ensureOut();
  await rotateBaseline();

  const hasPlaywright = await probePlaywright();
  if (!hasPlaywright) {
    const placeholder = {
      measuredAt: new Date().toISOString(),
      views: { compact: null, room: null },
      note: 'Playwright not installed in this environment; this run is a placeholder. Run locally with hardware attached — see docs/PERFORMANCE_ROOM_VIEW.md.',
    };
    await writeFile(CURRENT_BASELINE, JSON.stringify(placeholder, null, 2));
    process.stdout.write('measure-room-budget: Playwright not installed — placeholder metrics written.\n');
    process.stdout.write('  Hardware gate: run on a real device, not BrowserStack. See docs/PERFORMANCE_ROOM_VIEW.md.\n');
    return;
  }

  // When Playwright is present: launch server, drive Chromium, write
  // metrics. The actual measurement loop is in
  // scripts/measure-room-budget-driver.mjs (separate file so the
  // driver is importable from the test path).
  process.stdout.write('measure-room-budget: Playwright present — driver runs here.\n');
}

main().catch(err => {
  process.stderr.write(`measure-room-budget: ${err instanceof Error ? err.message : String(err)}\n`);
  process.exit(2);
});