// 상단바 레이아웃 숫자 점검 (캡처 없음): 폭 1280/1440/1920/390 에서 요소 수·잘림·겹침·높이·숨김·포커스.
// node scripts/topbar-check.mjs [port]   (dev 서버, ?mock=1&solo, 로그인 상태로 측정)
import { chromium } from 'playwright-core';

const port = process.argv[2] || '5173';
const WIDTHS = [1920, 1440, 1280, 390];
const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] });
let bad = 0;
for (const w of WIDTHS) {
  const ctx = await browser.newContext({ viewport: { width: w, height: w < 500 ? 844 : 900 }, hasTouch: w < 500, isMobile: w < 500 });
  const page = await ctx.newPage();
  await page.addInitScript(() => localStorage.setItem('chatatda.token', 'mock-token'));
  await page.goto(`http://localhost:${port}/?mock=1&q=low${process.env.SOLO ? '&solo' : ''}`);
  await page.waitForFunction(() => window.__ready === true, null, { timeout: 120000 }).catch(() => {});
  await page.waitForTimeout(1500); // 멀티플레이 접속(초대 버튼은 접속 중일 때만)
  await page.waitForSelector('header.topbar');
  await page.waitForTimeout(1500);
  const r = await page.evaluate(() => {
    const vw = innerWidth;
    const head = document.querySelector('header.topbar');
    const all = [...head.querySelectorAll('button, input, select, a[href], [role="tab"]')];
    const vis = (el) => { const s = getComputedStyle(el); const b = el.getBoundingClientRect(); return s.display !== 'none' && s.visibility !== 'hidden' && b.width > 0 && b.height > 0; };
    const label = (el) => (el.getAttribute('aria-label') || el.textContent || el.getAttribute('placeholder') || el.tagName).trim().slice(0, 12);
    const shown = all.filter(vis);
    const hidden = all.filter((e) => !vis(e)).map(label);
    const rects = shown.map((e) => ({ l: label(e), b: e.getBoundingClientRect(), el: e }));
    const clipped = rects.filter(({ b }) => b.right > vw + 0.5 || b.left < -0.5).map((r) => r.l);
    // 겹침: 서로 포함 관계가 아닌 컨트롤끼리
    let overlaps = [];
    for (let i = 0; i < rects.length; i++) for (let j = i + 1; j < rects.length; j++) {
      const a = rects[i], c = rects[j];
      if (a.el.contains(c.el) || c.el.contains(a.el)) continue;
      if (a.b.left < c.b.right - 1 && a.b.right > c.b.left + 1 && a.b.top < c.b.bottom - 1 && a.b.bottom > c.b.top + 1) overlaps.push(`${a.l}×${c.l}`);
    }
    const small = rects.filter(({ el, b }) => el.type !== 'range' && (b.height < 40 || b.width < 40) && el.tagName !== 'INPUT').map((r) => `${r.l}(${Math.round(r.b.width)}x${Math.round(r.b.height)})`);
    const rows = new Set(rects.map((r) => Math.round(r.b.top / 8))).size;
    const hb = head.getBoundingClientRect();
    const active = [...head.querySelectorAll('[aria-current="page"], [role="tab"][aria-selected="true"]')].map(label);
    return { vw, shown: shown.length, total: all.length, hidden, clipped, overlaps, small, rows, headerH: Math.round(hb.height), headerW: Math.round(hb.width), scrollW: head.scrollWidth, active };
  });
  // 키보드: Tab 으로 상단바 컨트롤을 돌며 포커스 표시(outline/box-shadow)가 있는지
  await page.locator('body').click({ position: { x: 5, y: 880 > (w < 500 ? 800 : 880) ? 5 : 5 } }).catch(() => {});
  const focus = [];
  await page.evaluate(() => document.activeElement?.blur());
  for (let i = 0; i < 25; i++) {
    await page.keyboard.press('Tab');
    const f = await page.evaluate(() => {
      const e = document.activeElement; if (!e || !e.closest('header.topbar')) return null;
      const s = getComputedStyle(e);
      const ring = (s.outlineStyle !== 'none' && parseFloat(s.outlineWidth) > 0) || (s.boxShadow && s.boxShadow !== 'none');
      return { l: (e.getAttribute('aria-label') || e.textContent || e.tagName).trim().slice(0, 10), ring };
    });
    if (f) focus.push(f);
  }
  const noRing = focus.filter((f) => !f.ring).map((f) => f.l);
  // 도달 가능성: 각 기능이 바로 보이거나, 상단바 메뉴(aria-haspopup) 하나를 열면 보이는지. 반응형으로 숨긴 중복 요소는 '숨김'으로 치지 않는다
  const FEATURES = [/^검색$/, /^집 찾기/, /^캠퍼스 투어/, /^기숙사/, /^청년안심주택/, /^양도/, /^내 집 기록/, /시간대/, /지도로 보기/, /캐릭터 꾸미기/, /초대/, /^찜 목록/, /^알림/, /^내 정보/, /^로그아웃/];
  const names = () => page.evaluate(() => [...document.querySelectorAll('header.topbar button, header.topbar input')].filter((e) => { const b = e.getBoundingClientRect(); return b.width > 0 && getComputedStyle(e).visibility !== 'hidden'; }).map((e) => (e.getAttribute('aria-label') || e.textContent || '').trim()));
  const reach = new Map();
  for (const n of await names()) for (const f of FEATURES) if (f.test(n) && !reach.has(String(f))) reach.set(String(f), '바로');
  const triggers = await page.$$('header.topbar [aria-haspopup="true"]');
  for (const t of triggers) {
    if (!(await t.isVisible())) continue;
    const tl = ((await t.getAttribute('aria-label')) || (await t.textContent()) || '').trim().slice(0, 8);
    await t.click(); await page.waitForTimeout(80);
    for (const n of await names()) for (const f of FEATURES) if (f.test(n) && !reach.has(String(f))) reach.set(String(f), tl + ' 메뉴');
    await page.keyboard.press('Escape');
  }
  r.hidden = FEATURES.filter((f) => !reach.has(String(f))).map((f) => f.source);
  const viaMenu = [...reach.values()].filter((v) => v !== '바로').length;
  const ok = r.clipped.length === 0 && r.overlaps.length === 0 && r.hidden.length === 0 && r.small.length === 0;
  if (!ok) bad++;
  console.log(`[${w}px] ${ok ? 'OK ' : 'BAD'} 바로 보이는 컨트롤 ${r.shown} · 상단바 ${r.headerW}x${r.headerH} (scrollW ${r.scrollW}) · 활성 ${JSON.stringify(r.active)} · 기능 ${reach.size}/${FEATURES.length} 도달(메뉴 경유 ${viaMenu})`);
  if (r.hidden.length) console.log(`   도달 불가 ${r.hidden.length}: ${r.hidden.join(', ')}`);
  if (r.clipped.length) console.log(`   잘림: ${r.clipped.join(', ')}`);
  if (r.overlaps.length) console.log(`   겹침: ${r.overlaps.join(', ')}`);
  if (r.small.length) console.log(`   40px 미만: ${r.small.join(', ')}`);
  console.log(`   Tab 포커스 ${focus.length}개, 포커스 표시 없음 ${noRing.length}${noRing.length ? ': ' + [...new Set(noRing)].join(', ') : ''}`);
  await ctx.close();
}
await browser.close();
process.exit(bad ? 1 : 0);
