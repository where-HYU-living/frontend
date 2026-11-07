// 숫자만 뽑는 동네 월드 확인 (화면 캡처 없음): node scripts/neighborhood-check.mjs l6 h5 [port]
import { chromium } from 'playwright-core';
const args = process.argv.slice(2), port = /^\d+$/.test(args[args.length - 1] || '') ? args.pop() : '5173';
const sites = args.length ? args : ['l6'];
const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] });
let bad = 0;
for (const site of sites) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  const errs = [];
  page.on('console', (m) => { if (m.type() === 'error' && !/favicon|status of 404/.test(m.text())) errs.push(m.text().slice(0, 160)); });
  page.on('response', (r) => { if (r.status() >= 400 && !/favicon/.test(r.url())) errs.push('HTTP ' + r.status() + ' ' + r.url().slice(0, 120)); });
  page.on('pageerror', (e) => errs.push('pageerror ' + e.message.slice(0, 160)));
  const t0 = Date.now();
  await page.goto(`http://localhost:${port}/?mock=1&solo&q=med&area=${site}`);
  const ok = await page.waitForFunction(() => window.__ready === true, null, { timeout: 90000 }).then(() => true, () => false);
  const info = ok ? await page.evaluate(async () => {
    const p = window.__proto, r = p.renderer.info, pl = p.player;
    r.autoReset = false; r.reset();
    const t = performance.now(); let frames = 0;
    await new Promise((res) => { const f = () => { frames++; if (performance.now() - t > 2000) res(); else requestAnimationFrame(f); }; requestAnimationFrame(f); });
    const calls = Math.round(r.render.calls / frames), tris = Math.round(r.render.triangles / frames); r.autoReset = true;
    const w = p.world;
    return { area: window.__area, frames, calls, tris, geos: r.memory.geometries, tex: r.memory.textures,
      pos: [Math.round(pl.pos.x), Math.round(pl.pos.z)], site: w.site?.point, bounds: w.bounds, bld: w.buildings.length };
  }) : null;
  console.log(site, ok ? 'ready' : 'TIMEOUT', Date.now() - t0, 'ms', JSON.stringify(info), errs.length ? 'ERR ' + JSON.stringify(errs.slice(0, 3)) : 'no-errors');
  if (!ok || errs.length) bad++;
  await page.close();
}
await browser.close();
process.exit(bad ? 1 : 0);
