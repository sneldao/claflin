#!/usr/bin/env node
import { spawn } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';
import { chromium } from '@playwright/test';
import { budgetRegressions, percentile } from './room-budget-lib.mjs';

const ROOT = process.cwd();
const OUT = join(ROOT, '.room-budget');
const PORT = process.env.PORT ?? '4123';
const suppliedUrl = process.argv.find(arg => arg.startsWith('--url='))?.slice(6);
const HOST = suppliedUrl ?? `http://127.0.0.1:${PORT}`;

async function readPrevious() {
  try { return JSON.parse(await readFile(join(OUT, 'metrics.json'), 'utf8')); }
  catch (error) { if (error.code === 'ENOENT') return null; throw error; }
}

async function waitForServer(child) {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    if (child.exitCode !== null) throw new Error('Production server exited before it was ready.');
    try {
      const response = await fetch(HOST, { signal: AbortSignal.timeout(1000) });
      await response.body?.cancel();
      if (response.ok) return;
    } catch { /* wait for the local build to start */ }
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  throw new Error('Production server did not become ready.');
}

async function stopServer(child) {
  if (!child || child.exitCode !== null) return;
  await new Promise(resolve => {
    const timer = setTimeout(() => child.kill('SIGKILL'), 4000);
    child.once('exit', () => { clearTimeout(timer); resolve(); });
    child.kill('SIGTERM');
  });
}

async function measureView(browser, view) {
  console.log(`measure-room-budget: measuring ${view}…`);
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 }, reducedMotion: 'no-preference' });
  try {
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    // Provider availability and accounts must not determine rendering measurements.
    await page.route(url => url.origin === new URL(HOST).origin && url.pathname.startsWith('/api/'), route => route.fulfill({
      contentType: 'application/json', body: JSON.stringify({ asOf: Date.now(), marks: [], enabled: false }),
    }));
    await page.addInitScript(() => {
      const stats = { webglMountMs: null, renderer: null, drawCalls: 0, triangles: 0, shaderCompileCpuMs: 0 };
      window.__roomBudget = stats;
      const original = HTMLCanvasElement.prototype.getContext;
      const seen = new WeakSet();
      HTMLCanvasElement.prototype.getContext = function (...args) {
        const gl = original.apply(this, args);
        if (!gl || !String(args[0]).startsWith('webgl') || seen.has(gl)) return gl;
        seen.add(gl);
        stats.webglMountMs ??= performance.now();
        const debug = gl.getExtension('WEBGL_debug_renderer_info');
        stats.renderer ??= debug ? gl.getParameter(debug.UNMASKED_RENDERER_WEBGL) : 'WebGL renderer unavailable';
        for (const method of ['drawArrays', 'drawElements']) {
          const draw = gl[method];
          gl[method] = function (...drawArgs) {
            stats.drawCalls += 1;
            const count = method === 'drawArrays' ? drawArgs[2] : drawArgs[1];
            if (drawArgs[0] === gl.TRIANGLES) stats.triangles += Math.floor(count / 3);
            else if (drawArgs[0] === gl.TRIANGLE_STRIP || drawArgs[0] === gl.TRIANGLE_FAN) stats.triangles += Math.max(0, count - 2);
            return draw.apply(this, drawArgs);
          };
        }
        const compile = gl.compileShader;
        gl.compileShader = function (...shaderArgs) {
          const start = performance.now();
          try { return compile.apply(this, shaderArgs); }
          finally { stats.shaderCompileCpuMs += performance.now() - start; }
        };
        return gl;
      };
    });
    const scripts = new Map();
    const reads = [];
    const readErrors = [];
    page.on('response', response => {
      if (response.request().resourceType() !== 'script' || new URL(response.url()).origin !== new URL(HOST).origin) return;
      reads.push(response.body().then(body => scripts.set(response.url(), gzipSync(body).length))
        .catch(() => readErrors.push('A script response could not be measured.')));
    });
    await page.goto(`${HOST}/?desk=jesse&view=${view}`, { waitUntil: 'networkidle' });
    // Room arrival may keep the blank slip visually folded until the line is used.
    try {
      await page.locator('#instruction').waitFor({ state: 'attached' });
    } catch (error) {
      throw new Error(`${view} did not mount: ${errors.join('; ') || error.message}`);
    }
    await page.locator('[role="group"][aria-label="Desk presentation"], [role="group"][aria-label="Desk view"]')
      .getByRole('button', { name: view === 'room' ? 'Room' : 'Compact', exact: true, includeHidden: true })
      .waitFor({ state: 'attached' });
    await page.waitForFunction(() => performance.getEntriesByName('first-contentful-paint').length > 0, undefined, { timeout: 60_000 });
    const sample = await page.evaluate(async () => {
      const intervals = [];
      const stats = window.__roomBudget;
      const startDraws = stats.drawCalls;
      const startTriangles = stats.triangles;
      const start = performance.now();
      let last = start;
      await new Promise(resolve => {
        const frame = time => {
          intervals.push(time - last);
          last = time;
          const progress = Math.min(1, (time - start) / 5000);
          window.scrollTo(0, progress * Math.max(0, document.documentElement.scrollHeight - innerHeight));
          if (progress < 1) requestAnimationFrame(frame);
          else resolve();
        };
        requestAnimationFrame(frame);
      });
      return {
        firstPaintMs: performance.getEntriesByName('first-contentful-paint')[0]?.startTime ?? null,
        webglMountMs: stats.webglMountMs,
        renderer: stats.renderer,
        intervals,
        drawCallsPerFrame: (stats.drawCalls - startDraws) / intervals.length,
        trianglesPerFrame: (stats.triangles - startTriangles) / intervals.length,
        shaderCompileCpuMs: stats.shaderCompileCpuMs,
      };
    });
    await Promise.all(reads);
    if (readErrors.length) throw new Error(`${view}: ${readErrors[0]}`);
    const median = percentile(sample.intervals, 0.5);
    return {
      firstPaintMs: sample.firstPaintMs,
      webglMountMs: sample.webglMountMs,
      renderer: sample.renderer,
      fpsMedian: median > 0 ? 1000 / median : null,
      frameIntervalP95Ms: percentile(sample.intervals, 0.95),
      jsGzipBytes: [...scripts.values()].reduce((total, size) => total + size, 0),
      scripts: [...scripts.entries()]
        .map(([url, gzipBytes]) => ({ path: new URL(url).pathname, gzipBytes }))
        .sort((a, b) => b.gzipBytes - a.gzipBytes),
      drawCallsPerFrame: sample.drawCallsPerFrame,
      trianglesPerFrame: sample.trianglesPerFrame,
      shaderCompileCpuMs: sample.shaderCompileCpuMs,
    };
  } finally {
    await context.close();
  }
}

async function main() {
  const url = new URL(HOST);
  if (url.protocol !== 'http:' || !['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname)) {
    throw new Error('Measure only a local production build.');
  }
  const previous = await readPrevious();
  let server;
  let browser;
  try {
    if (!suppliedUrl) {
      const args = existsSync(join(ROOT, '.next/server'))
        ? [join(ROOT, 'node_modules/next/dist/bin/next'), 'start', '--hostname', '127.0.0.1', '--port', PORT]
        : [join(ROOT, '.next/standalone/server.js')];
      server = spawn(process.execPath, args, {
        cwd: ROOT, stdio: ['ignore', 'ignore', 'ignore'], env: { ...process.env, PORT, HOSTNAME: '127.0.0.1' },
      });
      await waitForServer(server);
    }
    browser = await chromium.launch({ args: ['--enable-unsafe-swiftshader'] });
    const current = {
      measuredAt: new Date().toISOString(),
      profile: 'Local headless Chromium, 1280×800, renderer recorded per view; not real-device certification.',
      views: { compact: await measureView(browser, 'compact'), room: await measureView(browser, 'room') },
    };
    const failures = budgetRegressions(previous, current);
    await mkdir(OUT, { recursive: true });
    await writeFile(join(OUT, 'metrics.latest.json'), JSON.stringify(current, null, 2));
    if (failures.length) throw new Error(`Room budget failed:\n${failures.join('\n')}`);
    if (previous) await writeFile(join(OUT, 'metrics.previous.json'), JSON.stringify(previous, null, 2));
    await writeFile(join(OUT, 'metrics.json'), JSON.stringify(current, null, 2));
    console.log(`measure-room-budget: measured both views${previous ? '; no regression over 15%' : '; first baseline recorded'}.`);
  } finally {
    await browser?.close();
    await stopServer(server);
  }
}

main().catch(error => {
  console.error(`measure-room-budget: ${error.message}`);
  process.exitCode = 1;
});
