// 숫자만 뽑는 측정 (화면 캡처 없음): node scripts/perf.mjs "q=med" [port]
import { chromium } from 'playwright-core';
const [q = '', port = '5173'] = process.argv.slice(2);
const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
let requests = 0; const external = [];
page.on('response', (r) => { requests++; if (!r.url().startsWith(`http://localhost:${port}`)) external.push(r.url()); });
const t0 = Date.now();
await page.goto(`http://localhost:${port}/?${q}`);
await page.waitForFunction(() => window.__ready, null, { timeout: 180000 });
const loadMs = Date.now() - t0;
await page.waitForTimeout(2500);
const r = await page.evaluate(async () => {
  const { renderer, scene } = window.__proto;
  const info = renderer.info;
  info.autoReset = false; info.reset();
  await new Promise((res) => requestAnimationFrame(() => requestAnimationFrame(res)));
  const frames = 2;
  const out = { callsPerFrame: Math.round(info.render.calls / frames), trisPerFrame: Math.round(info.render.triangles / frames) };
  info.autoReset = true;
  const fr = []; let last = performance.now();
  await new Promise((res) => { let n = 0; const f = () => { const t = performance.now(); fr.push(t - last); last = t; if (++n < 90) requestAnimationFrame(f); else res(); }; requestAnimationFrame(f); });
  fr.sort((a, b) => a - b);
  const p50 = fr[45], p95 = fr[85];
  let meshes = 0; scene.traverse((o) => { if (o.isMesh) meshes++; });
  return { ...out, p50: +p50.toFixed(1), p95: +p95.toFixed(1), fps: +(1000 / p50).toFixed(1), textures: info.memory.textures, geometries: info.memory.geometries, meshes };
});
console.log(JSON.stringify({ query: q, loadMs, ...r, requests, external: [...new Set(external)] }, null, 1));
await browser.close();
