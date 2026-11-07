// 4단계 F6 '집 → 내 과 건물' 경로를 숫자로 확인 (캡처 없음). node scripts/route-check.mjs [port]
// 대표 집 5곳: 상세의 '과 건물까지 도보 N분' 을 눌러 → 경로 길이(m)·표시된 분·시작/끝 좌표, 3D 바닥 경로·'캠퍼스로 이동', 지도 폴리라인 길이.
// 마지막에 학과를 지운 상태에서 누르면 '학과 고르기' 안내가 뜨는지.
import { chromium } from 'playwright-core';

const port = process.argv[2] || '5173';
const HOUSES = [4, 6, 10, 18, 20]; // 목 매물 id (모두 동네 조각이 있는 집)
const BUILDING = 305; // IT/BT관
const R = 6371000, rad = (d) => (d * Math.PI) / 180;
const hav = (a, b) => { const dLat = rad(b[0] - a[0]), dLng = rad(b[1] - a[1]); const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a[0])) * Math.cos(rad(b[0])) * Math.sin(dLng / 2) ** 2; return 2 * R * Math.asin(Math.sqrt(h)); };
const lenOf = (path) => path.slice(1).reduce((s, p, i) => s + hav(path[i], p), 0);

const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const errs = [];
page.on('pageerror', (e) => errs.push(e.message.slice(0, 120)));
await page.addInitScript(() => { localStorage.setItem('chatatda.token', 'mock-token'); sessionStorage.setItem('chatatda.onboarded', '1'); });
await page.goto(`http://localhost:${port}/?mock=1&solo&q=low`);
const ready = (area) => page.waitForFunction((a) => window.__ready === true && (!a || window.__area === a), area, { timeout: 120000 });
await ready('campus');
await page.waitForFunction(() => !!window.__app, null, { timeout: 10000 });
const setDept = (ids) => page.evaluate(async (ids) => { await window.__app.api('/me/profile', { method: 'PUT', body: { buildingIds: ids } }); await window.__app.queryClient.invalidateQueries(); }, ids);
await setDept([BUILDING]);
const bld = await page.evaluate(async (id) => { const bs = await window.__app.api('/buildings'); const b = bs.find((x) => x.id === id); return [b.lat, b.lng, b.name]; }, BUILDING);

let fail = 0;
const row = (ok, s) => { if (!ok) fail++; console.log(`${ok ? 'PASS' : 'FAIL'} ${s}`); };
for (const id of HOUSES) {
  if (await page.evaluate(() => window.__app.useUi.getState().mapMode === '2d')) await page.getByRole('button', { name: '3D로 보기' }).click();
  await page.evaluate(() => window.__route.getState().clear());
  await page.evaluate((id) => { window.__app.useListingsUi.getState().select(id); window.__app.useUi.setState({ tab: 'home', panelOpen: true }); }, id);
  const btn = page.locator('.ui-panel .ui-walk-link');
  await btn.waitFor({ timeout: 15000 });
  await page.waitForFunction(() => /도보 \d+분/.test(document.querySelector('.ui-panel .ui-walk-link')?.textContent ?? ''), null, { timeout: 15000 });
  const shownMin = Number((await btn.textContent()).match(/도보 (\d+)분/)[1]);
  const house = await page.evaluate(async (id) => { const l = await window.__app.api(`/listings/${id}`); return { lat: l.lat, lng: l.lng, title: l.title }; }, id);
  await btn.click();
  await page.waitForFunction(() => !!window.__route.getState().route, null, { timeout: 15000 });
  const r = await page.evaluate(() => window.__route.getState().route);
  // 집이 들어 있는 월드 (목 매물 id 는 실서버 동네 id 와 위치가 다르다 → 착지 계획의 area 로 판단)
  const site = await page.evaluate(() => window.__lastLanding?.area);
  await ready(site).catch(() => {});
  await page.waitForFunction(() => !!window.__routeStats && window.__routeStats.area === window.__area, null, { timeout: 15000 }).catch(() => {});
  await page.waitForTimeout(500);
  const st = await page.evaluate(() => window.__routeStats);
  const hudMin = Number((await page.getByTestId('route-min').textContent()).replace(/\D/g, ''));
  const L = lenOf(r.path);
  const startD = hav(r.path[0], [house.lat, house.lng]), endD = hav(r.path[r.path.length - 1], [bld[0], bld[1]]);
  const housePlayer = await page.evaluate(() => { const p = window.__proto.player.pos; return [p.x, p.z]; });
  const firstD = st?.first ? Math.hypot(st.first.x - housePlayer[0], st.first.z - housePlayer[1]) : NaN;
  const ok3d = st && st.points > 0 && st.arrows > 0 && st.area === site && Math.abs(st.shownM + st.outsideM - L) / L < 0.03;
  row(Math.abs(L - r.distanceM) / r.distanceM < 0.03 && r.minutes === shownMin && hudMin === shownMin && startD < 30 && endD < 30 && ok3d,
    `집 ${id} ${house.title}: 경로 ${r.path.length}점 길이 ${Math.round(L)}m / 응답 ${r.distanceM}m (오차 ${(Math.abs(L - r.distanceM) / r.distanceM * 100).toFixed(1)}%) · 분: 버튼 ${shownMin} = 응답 ${r.minutes} = 길 막대 ${hudMin} · 시작↔집 ${startD.toFixed(1)}m · 끝↔${bld[2]} ${endD.toFixed(1)}m · 3D ${st?.area} 바닥 ${st?.points}점·화살표 ${st?.arrows}·보이는 ${st?.shownM}m+밖 ${st?.outsideM}m · 서 있는 곳↔경로 시작 ${firstD.toFixed(1)}m`);

  // 동네 밖 구간 → '캠퍼스로 이동'
  const toCampus = page.getByRole('button', { name: '캠퍼스로 이동' });
  if (await toCampus.isVisible()) {
    await toCampus.click();
    await ready('campus');
    await page.waitForFunction(() => window.__routeStats?.area === 'campus', null, { timeout: 15000 }).catch(() => {});
    const c = await page.evaluate(() => window.__routeStats);
    const lastLL = c?.last ? await page.evaluate(([x, z]) => { const lat = 37.5561486 - z / 110540, lng = 127.044341 + x / (Math.cos(37.5561486 * Math.PI / 180) * 111320); return [lat, lng]; }, [c.last.x, c.last.z]) : null;
    const lastD = lastLL ? hav(lastLL, [bld[0], bld[1]]) : NaN;
    row(c && c.area === 'campus' && c.shownM > 0 && lastD < 30, `   └ 캠퍼스로 이동: 캠퍼스에서 보이는 길 ${c?.shownM}m, 경로 끝↔${bld[2]} ${lastD.toFixed(1)}m`);
  }
  // 지도 폴리라인
  await page.getByRole('button', { name: '지도에서 보기' }).click();
  await page.waitForFunction(() => !!window.__routeMap, null, { timeout: 20000 }).catch(() => {});
  const mapL = await page.evaluate(() => { const m = window.__routeMap; window.__routeMap = null; return m; });
  row(mapL && Math.abs(mapL.lengthM - r.distanceM) / r.distanceM < 0.03 && mapL.points === r.path.length, `   └ 지도: 폴리라인 ${mapL?.points}점 ${mapL?.lengthM}m (응답 ${r.distanceM}m)`);
}

// 학과 미설정 → 안내
if (await page.evaluate(() => window.__app.useUi.getState().mapMode === '2d')) await page.getByRole('button', { name: '3D로 보기' }).click();
await page.evaluate(() => window.__route.getState().clear());
await setDept([]);
await page.evaluate(() => { window.__app.useListingsUi.getState().select(4); window.__app.useUi.setState({ tab: 'home', panelOpen: true }); });
await page.waitForTimeout(800);
await page.locator('.ui-panel .ui-walk-link').click();
const dlg = await page.getByRole('dialog', { name: '도보 길 안내' }).isVisible().catch(() => false);
const pickBtn = await page.getByRole('button', { name: '학과 고르기' }).isVisible().catch(() => false);
row(dlg && pickBtn, `학과 미설정: 안내 ${dlg}, [학과 고르기] ${pickBtn}`);
await browser.close();
console.log(`RESULT fail=${fail} pageerrors=${errs.length}`, errs.slice(0, 3));
process.exit(fail ? 1 : 0);
