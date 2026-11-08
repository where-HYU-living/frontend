// 지도 모드(3-3) 흐름을 숫자로 확인 (캡처 없음): 지도에서 검색 → 마커·정보 카드 → [3D로 가기] → 도착 위치·높이,
// 그리고 지도 ↔ 3D 를 오갈 때 고른 곳·필터·위치가 남는지. node scripts/map-check.mjs [port]
import { chromium } from 'playwright-core';

const port = process.argv[2] || '5173';
const CASES = [
  { q: '장한평역', expect: null },             // 장한평역: h5 조각 경계 근처 (안/밖 어느 쪽이든 카드·도착만 확인)
  { q: '한양대학교 본관', expect: 'inside' },   // 캠퍼스 안
  { q: '마장역', expect: null },               // 마장역(h2 한영스테이 근처)
  { q: '서울숲역', expect: 'outside' },         // 서비스 밖 → 가장 가까운 월드 진입점
  { q: '뚝섬역', expect: 'outside' },
];
const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const errs = [];
page.on('pageerror', (e) => errs.push(e.message.slice(0, 140)));
await page.goto(`http://localhost:${port}/?mock=1&solo&q=low`);
const ready = (area) => page.waitForFunction((a) => window.__ready === true && (!a || window.__area === a), area, { timeout: 120000 });
await ready('campus');

const toMap = async () => {
  await page.getByRole('button', { name: '지도로 보기' }).click();
  await page.waitForSelector('.ui-map-legend', { timeout: 30000 });
};
const search = async (q) => {
  const box = page.getByRole('textbox', { name: '검색' });
  await box.fill(''); await box.fill(q);
  // 카카오 장소 결과(지도에서 보기)가 뜰 때까지
  const item = page.locator('.suggest button[title="지도에서 보기"]', { hasText: q.slice(0, 2) }).first();
  await item.waitFor({ timeout: 15000 });
  const label = (await item.textContent()).trim();
  await item.click();
  return label;
};

let fail = 0;
for (const c of CASES) {
  await toMap();
  const label = await search(c.q);
  const card = page.getByRole('dialog', { name: /정보$/ });
  await card.waitFor({ timeout: 10000 });
  await page.waitForTimeout(700);
  const svc = (await card.locator('.ui-map-card-svc').textContent()).trim();
  const near = await card.locator('.ui-map-near li').count();
  // 마커가 화면 가운데 근처인지 (지도 중심을 그 지점으로 옮겼는지)
  const mk = await page.evaluate(() => { const e = document.querySelector('.ui-map-target'); if (!e) return null; const b = e.getBoundingClientRect(); return { dx: Math.round(b.left + b.width / 2 - innerWidth / 2), dy: Math.round(b.bottom - innerHeight / 2) }; });
  await card.locator('.ui-map-go').click();
  const plan = await page.evaluate(() => window.__lastLanding);
  const ok = await ready(plan.area).then(() => true, () => false);
  await page.waitForTimeout(1200);
  const r = await page.evaluate(() => {
    const p = window.__proto, pl = p.player, b = p.world.bounds;
    const ground = pl.heightAt(pl.pos.x, pl.pos.z);
    return { area: window.__area, x: pl.pos.x, y: pl.pos.y, z: pl.pos.z, ground, inBounds: pl.pos.x > b.minX && pl.pos.x < b.maxX && pl.pos.z > b.minZ && pl.pos.z < b.maxZ, inBuilding: pl.collide(pl.pos.x, pl.pos.z), notice: document.querySelector('.ui-land-note')?.textContent ?? '' };
  });
  const d = Math.hypot(r.x - plan.x, r.z - plan.z);
  const pass = ok && (c.expect == null || plan.kind === c.expect) && r.inBounds && !r.inBuilding && Number.isFinite(r.y) && Math.abs(r.y - r.ground) < 0.5 && (plan.kind === 'outside' ? r.notice.includes('3D 지원 지역 밖') : true) && d < (plan.kind === 'outside' && plan.area !== 'campus' ? 70 : 95) && mk && Math.abs(mk.dx) < 40 && Math.abs(mk.dy) < 40;
  if (!pass) fail++;
  console.log(`${pass ? 'PASS' : 'FAIL'} "${c.q}" → ${label.slice(0, 22)} | 카드: ${svc} · 가까운 ${near}개 · 마커 화면중심 오차 (${mk?.dx},${mk?.dy})px | 계획 ${plan.kind} ${plan.area} (${Math.round(plan.x)},${Math.round(plan.z)}) | 도착 ${r.area} (${Math.round(r.x)},${Math.round(r.z)}) 계획점까지 ${Math.round(d)}m · y=${r.y.toFixed(2)} 지면=${r.ground.toFixed(2)} · 범위안 ${r.inBounds} · 건물안 ${r.inBuilding}${r.notice ? ' · 안내 "' + r.notice.slice(0, 40) + '…"' : ''}`);
}

// 상태 유지: 필터 하나 걸고, 지도에서 한 곳 고른 뒤 3D 로 갔다가 다시 지도로
await page.evaluate(() => window.__useArea.getState().goTo('campus', 0, 0));
await ready('campus');
await page.getByRole('tab', { name: '집 찾기' }).click();
await page.getByRole('button', { name: /조건/ }).click();
await page.getByRole('textbox', { name: '월세 상한(만원)' }).fill('60');
await toMap();
await search('왕십리역');
await page.waitForTimeout(800);
const before = await page.evaluate(() => ({ card: document.querySelector('[role="dialog"][aria-label$="정보"] .ui-map-card-title')?.textContent, view: JSON.stringify(window.__mapFocus?.getState?.().view ?? null) }));
const pose0 = await page.evaluate(() => { const p = window.__proto.player.pos; return [p.x, p.z]; });
await page.getByRole('button', { name: '3D로 보기' }).click(); // 카드의 3D로 가기가 아니라 그냥 3D 로 돌아가기 → 위치 그대로여야
await page.waitForTimeout(500);
const pose1 = await page.evaluate(() => { const p = window.__proto.player.pos; return [p.x, p.z]; });
await page.waitForSelector('.ui-v-summary', { timeout: 10000 }).catch(() => {});
const filterKept = (await page.locator('.ui-v-summary').textContent().catch(() => '')).includes('월세 60만 이하') ? '60' : '(사라짐)';
await toMap();
await page.waitForTimeout(800);
const after = await page.evaluate(() => ({ card: document.querySelector('[role="dialog"][aria-label$="정보"] .ui-map-card-title')?.textContent, view: JSON.stringify(window.__mapFocus?.getState?.().view ?? null) }));
const moved = Math.hypot(pose1[0] - pose0[0], pose1[1] - pose0[1]);
const keep = before.card && before.card === after.card && filterKept === '60' && moved < 0.01 && before.view === after.view;
if (!keep) fail++;
console.log(`${keep ? 'PASS' : 'FAIL'} 상태 유지: 고른 곳 "${before.card}" → "${after.card}", 필터 월세 상한 ${filterKept}, 3D 위치 변화 ${moved.toFixed(3)}m, 지도 보기 ${before.view === after.view ? '같음' : '다름'} ${after.view}`);

await browser.close();
console.log(`RESULT fail=${fail} pageerrors=${errs.length}`, errs.slice(0, 3));
process.exit(fail ? 1 : 0);
