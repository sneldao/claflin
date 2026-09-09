import { createServer } from 'node:http';
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const root = new URL('../', import.meta.url);
const origin = 'http://127.0.0.1:4178';
const output = new URL('public/desk-receiver.webp', root);
const three = new URL('node_modules/three/', root);
const roomEnv = new URL('RoomEnvironment.js', new URL('examples/jsm/environments/', three));
const roomImport = ['three', 'examples', 'jsm', 'environments', 'RoomEnvironment.js'].join('/');
const files = new Map([
  ['/three.module.js', new URL('build/three.module.js', three)],
  ['/three.core.js', new URL('build/three.core.js', three)],
  ['/RoomEnvironment.js', roomEnv],
]);
const moduleSource = ts.transpileModule(await readFile(new URL('lib/desk-instrument.ts', root), 'utf8'), {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 },
}).outputText;
const html = `<!doctype html><html><head><meta charset="utf-8"><title>Claflin Receiver Asset Render</title>
<style>html,body{margin:0;background:transparent}#host{width:960px;height:520px}canvas{width:100%;height:100%}</style>
<script type="importmap">{"imports":{"three":"/three.module.js","${roomImport}":"/RoomEnvironment.js"}}</script>
</head><body><div id="host"><canvas id="canvas"></canvas></div><output id="status">Rendering receiver…</output>
<script type="module">
import { createDeskInstrument } from '/desk-instrument.js';
const status = document.getElementById('status');
const canvas = document.getElementById('canvas');
let controller;
controller = createDeskInstrument(canvas, document.getElementById('host'), 'arrival', () => { status.textContent = 'Render unavailable'; }, 'PAPER TRADING / NO LIVE ORDERS', async () => {
  try {
    const image = canvas.toDataURL('image/webp', 0.92);
    const response = await fetch('/capture', { method: 'POST', headers: { 'Content-Type': 'text/plain' }, body: image });
    status.textContent = await response.text();
  } finally { controller?.dispose(); }
});
</script></body></html>`;
const server = createServer(async (request, response) => {
  try {
    if (request.url === '/capture' && request.method === 'POST') {
      if (request.headers.origin !== origin) { response.writeHead(403).end(); return; }
      let body = '';
      for await (const chunk of request) {
        body += chunk.toString();
        if (body.length > 2_000_000) { response.writeHead(413).end(); return; }
      }
      if (!body.startsWith('data:image/webp;base64,')) { response.writeHead(400).end('Expected WebP'); return; }
      const image = Buffer.from(body.slice('data:image/webp;base64,'.length), 'base64');
      if (image.toString('ascii', 8, 12) !== 'WEBP') { response.writeHead(400).end('Invalid WebP'); return; }
      await writeFile(output, image);
      response.end('Receiver saved');
      console.log(`Saved ${fileURLToPath(output)} (${image.length} bytes)`);
      clearTimeout(timeout);
      server.close();
    } else if (request.method !== 'GET') {
      response.writeHead(405).end();
    } else if (request.url === '/') {
      response.writeHead(200, { 'Content-Type': 'text/html' }).end(html);
    } else if (request.url === '/desk-instrument.js') {
      response.writeHead(200, { 'Content-Type': 'text/javascript' }).end(moduleSource);
    } else if (files.has(request.url)) {
      response.writeHead(200, { 'Content-Type': 'text/javascript' }).end(await readFile(files.get(request.url)));
    } else {
      response.writeHead(404).end();
    }
  } catch (error) {
    console.error(error);
    response.writeHead(500).end('Render failed');
  }
});
const timeout = setTimeout(() => { server.close(); process.exitCode = 1; }, 180_000);
server.listen(4178, '127.0.0.1', () => console.log(`Open ${origin} once to render the receiver asset.`));
