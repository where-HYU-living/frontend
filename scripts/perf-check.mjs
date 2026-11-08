// 3-4 성능 숫자 (캡처 없음): 첫 로딩 시간, 프레임 시간, 월드 전환(캠퍼스↔동네) 왕복마다 geometry/texture 증가.
// node scripts/perf-check.mjs [rounds=5] [port]   — dev 서버 또는 `vite preview`(4173) 에 붙인다.
import { chromium } from 'playwright-core';

const rounds = Number(process.argv[2] || 5);
const port = process.argv[3] || '5173';
const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
const errs = [];
page.on('pageerror', (e) => errs.push(e.message.slice(0, 120)));
const t0 = Date.now();
await page.goto(`http://localhost:${port}/?mock=1&solo&q=med`);
await page.waitForFunction(() => window.__ready === true, null, { timeout: 180000 });
const loadMs = Date.now() - t0;
const nav = await page.evaluate(() => { const n = performance.getEntriesByType('navigation')[0]; return { domContentLoaded: Math.round(n.domContentLoadedEventEnd), jsKB: Math.round(performance.getEntriesByType('resource').filter((r) => r.initiatorType === 'script').reduce((a, r) => a + (r.transferSize || r.encodedBodySize || 0), 0) / 1024) }; });
await page.waitForTimeout(2000);

const frames = () => page.evaluate(async () => {
  const fr = []; let last = performance.now();
  await new Promise((res) => { let n = 0; const f = () => { const t = performance.now(); fr.push(t - last); last = t; if (++n < 120) requestAnimationFrame(f); else res(); }; requestAnimationFrame(f); });
  fr.shift(); fr.sort((a, b) => a - b);
  return { p50: +fr[Math.floor(fr.length * 0.5)].toFixed(1), p95: +fr[Math.floor(fr.length * 0.95)].toFixed(1) };
});
const mem = () => page.evaluate(() => { const m = window.__proto.renderer.info.memory; return { g: m.geometries, t: m.textures, progs: window.__proto.renderer.info.programs?.length ?? 0 }; });
const settle = async (area) => { await page.waitForFunction((a) => window.__ready === true && window.__area === a, area, { timeout: 120000 }); await page.waitForTimeout(1500); };

const f0 = await frames();
const m0 = await mem();
const series = [m0];
for (let i = 0; i < rounds; i++) {
  await page.evaluate(() => window.__useArea.getState().enter('l6', null));
  await settle('l6');
  await page.evaluate(() => window.__useArea.getState().leave());
  await settle('campus');
  series.push(await mem());
}
const f1 = await frames();
const last = series[series.length - 1];
// 첫 왕복은 캐시(공유 텍스처 등)가 처음 채워지는 몫이 섞이므로 2번째 왕복부터의 평균 증가를 '누수'로 본다
const steady = rounds > 1 ? { g: (last.g - series[1].g) / (rounds - 1), t: (last.t - series[1].t) / (rounds - 1) } : { g: last.g - m0.g, t: last.t - m0.t };
console.log(JSON.stringify({ loadMs, ...nav, frame0: f0, frameAfter: f1, memStart: m0, memEnd: last, series: series.map((s) => `${s.g}/${s.t}`), leakPerRoundTrip: { geometries: +steady.g.toFixed(1), textures: +steady.t.toFixed(1) }, pageErrors: errs.length }));
await browser.close();
