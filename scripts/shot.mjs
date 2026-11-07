// 헤드리스 크롬으로 장면 스크린샷 찍기 (서브에이전트·CI 확인용)
//   node scripts/shot.mjs "<쿼리>" out.png [port]
//   예) node scripts/shot.mjs "go=209" /tmp/amph.png
//       node scripts/shot.mjs "cam=60,110,80,70,25,0.3" /tmp/a.png
// 콘솔 오류도 같이 출력한다. dev 서버(npm run dev, 기본 5180)가 떠 있어야 함.
import { chromium } from 'playwright-core';
const [q = '', out = 'shot.png', port = '5180'] = process.argv.slice(2);
const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
const errs = [];
page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning' || /^zone /.test(m.text())) errs.push(`[${m.type()}] ${m.text()}`); });
page.on('pageerror', (e) => errs.push('[pageerror] ' + e.message));
await page.goto(`http://localhost:${port}/?${q}`);
await page.waitForFunction(() => window.__ready, null, { timeout: 120000 });
await page.waitForTimeout(1500);
await page.screenshot({ path: out });
console.log(errs.join('\n') || '(콘솔 오류 없음)');
console.log('saved', out);
await browser.close();
