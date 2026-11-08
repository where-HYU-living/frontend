// 캠퍼스 → 동네 → 캠퍼스 전환을 숫자로 확인 (캡처 없음): node scripts/neighborhood-flow.mjs [site=l6] [port]
import { chromium } from 'playwright-core';
const site = process.argv[2] || 'l6', port = process.argv[3] || '5173';
const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
const errs = [];
page.on('console', (m) => { if (m.type() === 'error' && !/favicon|status of 404/.test(m.text())) errs.push(m.text().slice(0, 160)); });
page.on('pageerror', (e) => errs.push('pageerror ' + e.message.slice(0, 160)));
await page.goto(`http://localhost:${port}/?mock=1&solo&q=med`);
const ready = () => page.waitForFunction(() => window.__ready === true, null, { timeout: 90000 });
await ready();
const snap = () => page.evaluate(() => { const p = window.__proto, r = p.renderer.info; return { area: window.__area, pos: [+p.player.pos.x.toFixed(1), +p.player.pos.z.toFixed(1)], geos: r.memory.geometries, tex: r.memory.textures, children: p.scene.children.length }; });
const a = await snap(); console.log('campus', JSON.stringify(a));
const walk = [];
for (let i = 0; i < 3; i++) {
  await page.evaluate(async (s) => { window.__useArea.getState().enter(s, { x: 50, z: 60 }); }, site);
  await page.waitForFunction(() => window.__ready === true && window.__area !== 'campus', null, { timeout: 90000 });
  walk.push(await snap());
  await page.evaluate(async () => { window.__useArea.getState().leave(); });
  await page.waitForFunction(() => window.__ready === true && window.__area === 'campus', null, { timeout: 90000 });
  await page.waitForTimeout(800);
  walk.push(await snap());
}
console.log(JSON.stringify(walk));
const back = walk[walk.length - 1];
console.log('복귀 위치', back.pos, '(요청 [50,60] 근처)', '장면 자원 증가', back.geos - a.geos, back.tex - a.tex);
console.log(errs.length ? 'ERR ' + JSON.stringify(errs.slice(0, 4)) : 'no-errors');
await browser.close();
