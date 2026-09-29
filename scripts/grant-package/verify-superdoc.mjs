// Opens the package's government DOCX in SuperDoc (headless Chromium, telemetry off) and
// checks that every form-map anchor resolves with SuperDoc's own blocks.findText to a block
// whose text is the anchor text, at the recorded position. Also fails if the page makes any
// request outside localhost.
//
// SuperDoc is WP-3's dependency, so it isn't installed here. To run:
//   npm i --no-save superdoc@2.18.0
//   node scripts/grant-package/verify-superdoc.mjs
// Env: CHROMIUM_PATH (default /opt/pw-browsers/chromium, else Playwright's own browser).
import { cpSync, existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import http from 'node:http';
import { tmpdir } from 'node:os';
import { dirname, extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import { chromium } from 'playwright';
/* global window */

const here = dirname(fileURLToPath(import.meta.url));
const ROOT = join(here, '..', '..');
const PKG = join(ROOT, 'grants', 'crcp-r19');

const superdocDir = join(ROOT, 'node_modules', 'superdoc');
if (!existsSync(join(superdocDir, 'package.json'))) {
  console.error('superdoc is not installed. Run: npm i --no-save superdoc@2.18.0');
  process.exit(2);
}
const version = JSON.parse(readFileSync(join(superdocDir, 'package.json'), 'utf8')).version;

const work = mkdtempSync(join(tmpdir(), 'gw-superdoc-'));
writeFileSync(join(work, 'entry.js'), "import { SuperDoc } from 'superdoc';\nimport 'superdoc/style.css';\nwindow.SuperDoc = SuperDoc;\n");
await build({
  entryPoints: [join(work, 'entry.js')], bundle: true, format: 'esm', outdir: join(work, 'bundle'), logLevel: 'error',
  nodePaths: [join(ROOT, 'node_modules')],
  loader: { '.woff': 'file', '.woff2': 'file', '.ttf': 'file', '.png': 'file', '.svg': 'file', '.docx': 'file' },
});
// SuperDoc starts its document worker from assets/ next to the bundle.
const engineAssets = join(ROOT, 'node_modules', '@superdoc', 'docx-engine', 'dist', 'assets');
if (existsSync(engineAssets)) cpSync(engineAssets, join(work, 'bundle', 'assets'), { recursive: true });
writeFileSync(join(work, 'index.html'), `<!doctype html><html><head><meta charset="utf-8"><link rel="stylesheet" href="/bundle/entry.css"></head>
<body><div id="ed" style="width:900px;height:800px"></div><script type="module">
import '/bundle/entry.js';
const buf = await (await fetch('/doc.docx')).arrayBuffer();
const file = new File([buf], 'application-form.docx', { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' });
window.__sd = new window.SuperDoc({ selector: '#ed', document: file, documentMode: 'viewing', telemetry: { enabled: false }, onReady: () => { window.__ready = true; } });
</script></body></html>`);

const types = { '.js': 'text/javascript', '.css': 'text/css', '.html': 'text/html', '.wasm': 'application/wasm' };
const server = http.createServer((req, res) => {
  const p = decodeURIComponent(req.url.split('?')[0]);
  const file = p === '/' ? join(work, 'index.html') : p === '/doc.docx' ? join(PKG, 'documents', 'application-form.docx') : join(work, p);
  if (!file.startsWith(work) && p !== '/doc.docx') { res.writeHead(404); return res.end(); }
  try { const body = readFileSync(file); res.writeHead(200, { 'content-type': types[extname(file)] ?? 'application/octet-stream' }); res.end(body); }
  catch { res.writeHead(404); res.end(); }
}).listen(0);
const port = server.address().port;

const executablePath = process.env.CHROMIUM_PATH ?? (existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined);
const browser = await chromium.launch(executablePath ? { executablePath } : {});
const page = await browser.newPage();
const outside = [];
page.on('request', (r) => { const u = new URL(r.url()); if (/^https?:$/.test(u.protocol) && u.hostname !== 'localhost') outside.push(u.origin); });
await page.goto(`http://localhost:${port}/`);
await page.waitForFunction(() => window.__ready === true, null, { timeout: 60000 });

const formMap = JSON.parse(readFileSync(join(PKG, 'form-map.json'), 'utf8'));
const probes = formMap.fields.flatMap((f) => [
  { field: f.id, which: 'anchor', ...f.anchor, block: f.position.block },
  { field: f.id, which: 'questionAnchor', ...f.questionAnchor },
]);
const results = await page.evaluate(async (probes) => {
  const doc = window.__sd.activeEditor.doc;
  const out = [];
  for (const p of probes) {
    const found = await doc.blocks.findText({ text: p.text, limit: p.ordinal + 1 });
    const m = found.matches[p.ordinal];
    if (!m) { out.push({ ...p, ok: false, why: `only ${found.total} matches` }); continue; }
    const listed = await doc.blocks.list({ offset: m.ordinal, limit: 1, includeText: true });
    const text = (listed.blocks[0]?.text ?? '').trim();
    const ok = text === p.text && (p.block === undefined || p.block === m.ordinal);
    out.push({ ...p, ok, got: m.ordinal, why: ok ? '' : `block ${m.ordinal}: ${text.slice(0, 80)}` });
  }
  const total = (await doc.blocks.list({ limit: 1 })).total;
  return { out, total };
}, probes);
await browser.close();
server.close();

const failed = results.out.filter((r) => !r.ok);
for (const r of failed) console.error(`${r.field} ${r.which}: ${r.why}`);
const fields = new Set(formMap.fields.map((f) => f.id));
const okFields = [...fields].filter((id) => !failed.some((r) => r.field === id));
console.log(`SuperDoc ${version}: ${results.total} blocks (form map says ${formMap.document.blocks})`);
console.log(`anchors resolved: ${okFields.length}/${fields.size} fields (${results.out.length - failed.length}/${results.out.length} anchors)`);
console.log(`requests outside localhost: ${outside.length ? [...new Set(outside)].join(', ') : 'none'}`);
if (failed.length || outside.length || results.total !== formMap.document.blocks) process.exit(1);
