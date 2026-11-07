// 첫 로딩 시간 (빌드 결과를 vite preview 로 띄운 뒤): node scripts/load-check.mjs [port=4173]
// 네트워크 20Mbps·지연 40ms 로 묶고, 처음 방문(캐시 없음)과 다시 방문(캐시)에서 __ready 까지 ms 와 내려받은 JS KB.
import { chromium } from 'playwright-core';
const port = process.argv[2] || '4173';
const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] });
const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
const page = await ctx.newPage();
const cdp = await ctx.newCDPSession(page);
await cdp.send('Network.enable');
await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: 40, downloadThroughput: (20 * 1024 * 1024) / 8, uploadThroughput: (5 * 1024 * 1024) / 8 });
const run = async () => {
  let js = 0;
  const on = (r) => { if (/\.js(\?|$)/.test(r.url()) && r.url().includes(`:${port}`)) r.body().then((b) => { js += b.length; }).catch(() => {}); };
  page.on('response', on);
  const t0 = Date.now();
  await page.goto(`http://localhost:${port}/?mock=1&solo&q=med`);
  await page.waitForFunction(() => window.__ready === true, null, { timeout: 180000 });
  const ms = Date.now() - t0;
  const fromCache = await page.evaluate(() => performance.getEntriesByType('resource').filter((r) => /\.js/.test(r.name) && r.transferSize === 0).length);
  page.off('response', on);
  return { ms, jsKB: Math.round(js / 1024), jsFromCache: fromCache };
};
const cold = await run();
const warm = await run();
console.log(JSON.stringify({ cold, warm }));
await browser.close();
