// 3D 라벨·말풍선이 가까운 것만 보이는지 숫자로 확인 (캡처 없음).
// node scripts/labels-check.mjs [port]  — dev 서버가 떠 있어야 한다. ?mock=1 로 매물·단지·기숙사 말풍선을 채운다.
// 출력: 위치별 보이는 라벨 수, 그중 가장 먼 거리(m), 화면에서 서로 겹치는 쌍 수.
import { chromium } from 'playwright-core';

const port = process.argv[2] || '5173';
const SPOTS = [
  { name: '사자상 앞', x: -13, z: 1.5 },
  { name: '본관·공학관 사이', x: 120, z: -120 },
  { name: '캠퍼스 동쪽(기숙사)', x: 380, z: -200 },
  { name: '말풍선 25m 앞(가장 많은 곳)', near: true },
];
const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
await page.goto(`http://localhost:${port}/?mock=1&solo&q=low`);
await page.waitForFunction(() => window.__ready === true, null, { timeout: 120000 });
await page.waitForTimeout(2500); // 목 데이터 → setMarkers
let worst = 0;
for (const s of SPOTS) {
  const r = await page.evaluate(async ({ x, z, near }) => {
    const p = window.__proto;
    if (near) { // 반경 60m 안에 말풍선이 가장 많은 말풍선 옆으로
      const ms = []; p.scene.traverse((o) => { if (o.isCSS2DObject && o.parent === p.scene) ms.push(o.position); });
      const best = ms.map((m) => ({ m, n: ms.filter((q) => Math.hypot(q.x - m.x, q.z - m.z) < 60).length })).sort((a, b) => b.n - a.n)[0].m;
      x = best.x + 25; z = best.z; p.player.teleport(x, z, best.x, best.z);
    } else p.player.teleport(x, z);
    await new Promise((res) => { let n = 0; const f = () => (++n > 20 ? res() : requestAnimationFrame(f)); requestAnimationFrame(f); });
    const px = p.player.pos.x, pz = p.player.pos.z;
    const shown = [];
    p.scene.traverse((o) => {
      if (!o.isCSS2DObject || !o.element.isConnected) return;
      const el = o.element;
      if (el.style.display === 'none' || el.offsetParent === null) return;
      const b = el.getBoundingClientRect();
      if (b.width === 0 || b.right < 0 || b.left > innerWidth || b.bottom < 0 || b.top > innerHeight) return;
      const w = o.getWorldPosition(o.position.clone());
      shown.push({ d: Math.hypot(w.x - px, w.z - pz), b: [b.left, b.top, b.right, b.bottom], t: (el.textContent || '').slice(0, 14) });
    });
    let overlaps = 0;
    for (let i = 0; i < shown.length; i++) for (let j = i + 1; j < shown.length; j++) {
      const a = shown[i].b, c = shown[j].b;
      if (a[0] < c[2] && a[2] > c[0] && a[1] < c[3] && a[3] > c[1]) overlaps++;
    }
    const all = [];
    p.scene.traverse((o) => { if (o.isCSS2DObject) all.push(o); });
    return { total: all.length, visible: shown.length, maxD: Math.round(Math.max(0, ...shown.map((v) => v.d))), overlaps, far: shown.filter((v) => v.d > 120).map((v) => `${v.t}@${Math.round(v.d)}`).slice(0, 6) };
  }, s);
  worst = Math.max(worst, r.maxD);
  console.log(`${s.name} (${s.x ?? '자동'},${s.z ?? ''}) 전체 ${r.total} · 보임 ${r.visible} · 최대거리 ${r.maxD}m · 겹침 ${r.overlaps}쌍`, r.far.length ? `먼 것: ${r.far.join(', ')}` : '');
}
await browser.close();
console.log(`WORST_MAX_DISTANCE ${worst}`);
