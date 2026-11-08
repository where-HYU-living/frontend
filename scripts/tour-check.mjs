// 동네 월드(12곳)에서 [캠퍼스 투어] 항목을 누르면 캠퍼스로 넘어가 그 건물 앞에 서는지 숫자로 확인 (캡처 없음).
// node scripts/tour-check.mjs [사이트…] [--items=3] [port]
// 각 사이트에서 첫·가운데·마지막 항목을 누른다 (매번 그 동네로 다시 들어간 뒤). 마지막에 캠퍼스 안에서 모든 항목도 확인.
import { chromium } from 'playwright-core';

const argv = process.argv.slice(2);
const port = argv.find((a) => /^\d+$/.test(a)) || '5173';
const per = Number((argv.find((a) => a.startsWith('--items=')) || '--items=3').split('=')[1]);
const ALL_SITES = ['l4', 'l6', 'l10', 'l17', 'l18', 'l19', 'l20', 'h1', 'h2', 'h3', 'h4', 'h5'];
const sites = argv.filter((a) => /^[lh]\d+$/.test(a));
const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const errs = [];
page.on('pageerror', (e) => errs.push(e.message.slice(0, 120)));
await page.goto(`http://localhost:${port}/?mock=1&solo&q=low`);
const ready = (area) => page.waitForFunction((a) => window.__ready === true && window.__area === a, area, { timeout: 120000 });
await ready('campus');

// 투어 탭 열기 → 항목 목록 (이름, 3D 중심)
await page.getByRole('tab', { name: '캠퍼스 투어' }).click();
const items = await page.$$eval('.ui-tour-item:not([disabled])', (bs) => bs.map((b) => b.querySelector('.ui-tour-name').textContent));
const centers = await page.evaluate(async () => (await import('/src/app/data/hiddenBuildings.ts')).visiblePlaces.filter((p) => p.center).map((p) => ({ name: p.name, c: p.center })));
const centerOf = (n) => centers.find((c) => c.name === n)?.c;
console.log(`투어 항목 ${items.length}개`);

let fail = 0;
const clickItem = async (name) => {
  await page.locator('.ui-tour-item', { hasText: name }).first().click();
};
const pose = () => page.evaluate(() => { const p = window.__proto.player.pos; return [p.x, p.y, p.z]; });

for (const site of sites.length ? sites : ALL_SITES) {
  const pick = per >= items.length ? items : [items[0], items[Math.floor(items.length / 2)], items[items.length - 1]].slice(0, per);
  for (const name of pick) {
    await page.evaluate((s) => window.__useArea.getState().enter(s, null), site);
    await ready(site);
    if (!(await page.locator('.ui-tour-item').count())) await page.getByRole('tab', { name: '캠퍼스 투어' }).click();
    const t0 = Date.now();
    await clickItem(name);
    const ok = await ready('campus').then(() => true, () => false);
    await page.waitForTimeout(600);
    const [x, y, z] = ok ? await pose() : [NaN, NaN, NaN];
    const c = centerOf(name);
    const d = c ? Math.hypot(x - c[0], z - c[1]) : NaN;
    const pass = ok && d <= 95 && Number.isFinite(y);
    if (!pass) fail++;
    console.log(`${pass ? 'PASS' : 'FAIL'} ${site} → ${name}: area=${ok ? 'campus' : 'stuck'} 건물까지 ${Math.round(d)}m y=${y?.toFixed?.(1)} ${Date.now() - t0}ms`);
  }
}

// 캠퍼스 안에서 모든 항목
await page.evaluate(() => window.__useArea.getState().goTo('campus', 0, 0));
await ready('campus');
let campusFail = 0;
for (const name of items) {
  await clickItem(name);
  await page.waitForTimeout(80);
  const [x, , z] = await pose();
  const c = centerOf(name);
  if (!(c && Math.hypot(x - c[0], z - c[1]) <= 95)) { campusFail++; console.log(`FAIL campus → ${name}`); }
}
console.log(`캠퍼스 안 ${items.length}개 중 실패 ${campusFail}`);
await browser.close();
console.log(`RESULT fail=${fail + campusFail} pageerrors=${errs.length}`, errs.slice(0, 3));
process.exit(fail + campusFail ? 1 : 0);
