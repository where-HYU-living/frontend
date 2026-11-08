// 그래픽 품질 자동 선택·실행 중 낮추기·최저 모드를 숫자로 확인 (캡처 없음). node scripts/gfx-check.mjs [port]
// A GPU 자동: 단계 유지·안내 없음  B 실행 중 바꾸기: 최저↔높음이 장면에 그대로 반영
// C 그래픽 가속 꺼짐(SwiftShader): 처음부터 최저·안내·하늘 HDR 안 받음·FPS(q=low 와 비교)
// D 가속 꺼짐인데 장치 이름을 숨긴 경우: 높음에서 시작 → FPS 보고 최저까지 낮춤 → '많이 느려요' 안내
import { chromium } from 'playwright-core';

const port = process.argv[2] || '5173';
const URL = (q = '') => `http://localhost:${port}/?mock=1&solo${q}`;
const GPU = ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'];
const SOFT = ['--use-angle=swiftshader', '--use-gl=angle', '--enable-unsafe-swiftshader'];
let fail = 0;
const row = (ok, s) => { if (!ok) fail++; console.log(`${ok ? 'PASS' : 'FAIL'} ${s}`); };

async function open(args, q = '', init) {
  const browser = await chromium.launch({ channel: 'chrome', headless: true, args });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const reqs = [];
  page.on('request', (r) => reqs.push(r.url()));
  await page.addInitScript(() => { localStorage.setItem('chatatda.token', 'mock-token'); sessionStorage.setItem('chatatda.onboarded', '1'); });
  if (init) await page.addInitScript(init);
  await page.goto(URL(q));
  await page.waitForFunction(() => window.__ready === true && !!window.__gfx, null, { timeout: 240000 });
  return { browser, page, reqs };
}
const fps = (page, ms = 6000) => page.evaluate((ms) => new Promise((res) => { const ts = []; const s = performance.now(); const f = (t) => { ts.push(t); if (t - s < ms) requestAnimationFrame(f); else res(+(1000 * (ts.length - 1) / (ts.at(-1) - ts[0])).toFixed(2)); }; requestAnimationFrame(f); }), ms);
const state = (page) => page.evaluate(() => {
  const g = window.__gfx.getState(), p = window.__proto;
  const terrain = p.scene.getObjectByName('terrain');
  let sun = null; p.scene.traverse((o) => { if (o.isDirectionalLight) sun = o; });
  return { level: g.level, choice: g.choice, software: g.gpu.software, renderer: g.gpu.renderer.slice(0, 40), slow: g.slow,
    terrainMat: terrain.material.type, terrainTris: Math.round((terrain.geometry.index.count / 3) / 1000) + 'k', env: !!p.scene.environment, far: p.camera.far,
    shadow: sun.castShadow, pr: p.renderer.getPixelRatio(), aa: p.renderer.getContextAttributes().antialias, notice: !!document.querySelector('[data-testid="gfx-notice"]') };
});

// A
{
  const { browser, page } = await open(GPU);
  const s0 = await state(page);
  await page.waitForTimeout(12000);
  const s1 = await state(page);
  const f = await fps(page);
  row(!s0.software && s1.level === s0.level && !s1.notice && f >= 30, `A GPU 자동: ${s0.renderer} → ${s0.level}, 12초 뒤 ${s1.level}, 안내 ${s1.notice}, FPS ${f}`);
  // 지도(2D)를 8초 보다가 3D 로 돌아와도 (멈춰 있던 시간을 느린 프레임으로 오해해) 낮추지 않는다
  await page.evaluate(() => window.__app.useUi.getState().setMapMode('2d'));
  await page.waitForTimeout(8000);
  await page.evaluate(() => window.__app.useUi.getState().setMapMode('3d'));
  await page.waitForTimeout(10000);
  const s2 = await state(page);
  row(s2.level === s0.level, `A 지도 8초 → 3D 복귀 10초 뒤: ${s2.level}`);
  // B
  await page.evaluate(() => { const g = window.__gfx.getState(); for (let i = 0; i < 3; i++) g.autoStepDown(); });
  await page.waitForTimeout(1500);
  const m = await state(page);
  row(m.level === 'min' && m.terrainMat === 'MeshLambertMaterial' && !m.env && m.far === 350 && !m.shadow && m.pr === 0.5,
    `B 실행 중 최저로: 지형 ${m.terrainMat} ${m.terrainTris}·환경광 ${m.env}·시야 ${m.far}m·그림자 ${m.shadow}·해상도 ${m.pr}`);
  await page.evaluate(() => window.__gfx.getState().setChoice('high'));
  await page.waitForFunction(() => !!window.__proto.scene.environment, null, { timeout: 20000 }).catch(() => {});
  const h = await state(page);
  row(h.level === 'high' && h.terrainMat === 'MeshStandardMaterial' && h.env && h.far === 3000 && h.shadow && [1, 1.5].includes(h.pr),
    `B 다시 높음: 지형 ${h.terrainMat} ${h.terrainTris}·환경광 ${h.env}·시야 ${h.far}m·그림자 ${h.shadow}·해상도 ${h.pr}`);
  const saved = await page.evaluate(() => localStorage.getItem('chatatda.gfx'));
  row(saved && JSON.parse(saved).choice === 'high', `B 고른 값 저장: ${saved}`);
  await browser.close();
}

// C
let fMin = 0;
{
  const { browser, page, reqs } = await open(SOFT);
  const s = await state(page);
  await page.waitForTimeout(3000);
  fMin = await fps(page, 9000);
  const hdr = reqs.some((u) => u.includes('sky_1k.hdr')), bg = reqs.some((u) => u.includes('sky_bg.jpg'));
  const notice = await page.getByTestId('gfx-notice').textContent().catch(() => '');
  row(s.software && s.level === 'min' && !s.aa && !hdr && !bg && /그래픽 가속/.test(notice),
    `C 가속 꺼짐: 감지 ${s.software} → ${s.level}, 안티에일리어싱 ${s.aa}, 하늘 HDR 요청 ${hdr}/사진 ${bg}, 안내 "${notice.slice(0, 22)}…", FPS ${fMin}`);
  // 지도로 보기 → 안내 사라짐
  await page.getByTestId('gfx-notice').getByRole('button', { name: '지도로 보기' }).click();
  const mapOn = await page.evaluate(() => window.__app.useUi.getState().mapMode);
  row(mapOn === '2d' && !(await page.getByTestId('gfx-notice').isVisible().catch(() => false)), `C [지도로 보기] → ${mapOn}, 안내 닫힘`);
  await browser.close();
}
{
  const { browser, page } = await open(SOFT, '&q=low');
  await page.waitForTimeout(3000);
  const f = await fps(page, 9000);
  row(fMin > f * 2, `C 같은 CPU 렌더에서 최저 FPS ${fMin} vs 예전 low FPS ${f} (${(fMin / Math.max(f, 0.01)).toFixed(1)}배)`);
  await browser.close();
}

// D
{
  const disguise = () => {
    const g = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (t, o) { if (o && o.failIfMajorPerformanceCaveat) o = { ...o, failIfMajorPerformanceCaveat: false }; return g.call(this, t, o); };
    const gp = WebGL2RenderingContext.prototype.getParameter;
    WebGL2RenderingContext.prototype.getParameter = function (p) { return p === 37446 ? 'ANGLE (NVIDIA, NVIDIA GeForce RTX 3060 Direct3D11 vs_5_0 ps_5_0, D3D11)' : gp.call(this, p); };
  };
  const { browser, page } = await open(SOFT, '', disguise);
  const s0 = await state(page);
  const steps = [s0.level];
  const t0 = Date.now();
  while (Date.now() - t0 < 150000) {
    await page.waitForTimeout(2000);
    const s = await state(page);
    if (s.level !== steps.at(-1)) steps.push(s.level);
    if (s.slow || (s.level === 'min' && Date.now() - t0 > 60000)) break;
  }
  const s1 = await state(page);
  const saved = await page.evaluate(() => localStorage.getItem('chatatda.gfx'));
  row(!s0.software && steps[0] === 'high' && s1.level === 'min', `D 장치 이름 숨김: ${steps.join(' → ')} (${Math.round((Date.now() - t0) / 1000)}초), 느림 안내 ${s1.notice}, 저장 ${saved}`);
  await browser.close();
}
console.log(`RESULT fail=${fail}`);
process.exit(fail ? 1 : 0);
