// 최종 QA: 화면 반응성·레이아웃·폼 E2E (캡처 없음, DOM·좌표·시간만 잰다)
//   node scripts/qa-final.mjs local [out.json]   dev 서버(5173) + 로컬 백엔드(8080). 쓰기 흐름 포함
//   node scripts/qa-final.mjs prod  [out.json]   운영(where-hyu-living.xyz). 읽기만: API 로 GET 말고는 브라우저에서 막는다
// local 은 MAIL_LOG(로컬 서버 로그 파일, 인증 코드 읽기)가 필요하다: docker logs -f chatatda-api > api.log &
// 결과: [{ id, w, ok, ms?, note }] + 요약(폭별 레이아웃 문제 수, 300ms 넘는 반응)
import { chromium } from 'playwright-core';
import { readFileSync, writeFileSync } from 'node:fs';

const ENV = process.argv[2] === 'prod' ? 'prod' : 'local';
const OUT = process.argv[3] || `qa-final-${ENV}.json`;
const FE = ENV === 'prod' ? 'https://where-hyu-living.xyz' : 'http://localhost:5173';
const BE = ENV === 'prod' ? 'https://api-production-8811.up.railway.app/api/v1' : 'http://localhost:8080/api/v1';
const DEV = ENV === 'local'; // dev 훅(window.__app·__proto)은 dev 서버에만 있다
const WIDTHS = [1280, 1024, 760, 380];
const SLOW = 300; // 클릭→화면 반응이 이보다 길면 기록
const R = [];
const rec = (id, w, ok, note, ms) => { R.push({ id, w, ok, ms, note }); console.log(`${ok ? 'ok  ' : 'FAIL'} ${String(w).padEnd(4)} ${id.padEnd(22)} ${ms != null ? `${String(Math.round(ms)).padStart(5)}ms ` : '        '}${note ?? ''}`); };

// ---------- 로그인 (local 전용: 점검용 메일 코드) ----------
async function login(email) {
  await fetch(`${BE}/auth/email/send`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email }) });
  for (let i = 0; i < 20; i++) {
    await new Promise((r) => setTimeout(r, 250));
    const line = readFileSync(process.env.MAIL_LOG, 'utf8').split('\n').filter((l) => l.includes(`to=${email} `)).pop();
    const code = line?.match(/(\d{6})\s*$/)?.[1];
    if (code) return (await (await fetch(`${BE}/auth/email/verify`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, code }) })).json()).accessToken;
  }
  throw new Error('인증 코드를 로그에서 못 찾음 (MAIL_LOG 확인)');
}

// ---------- 페이지 안 도우미 ----------
function installQa() {
  const vis = (el) => {
    if (!el || !el.isConnected) return false;
    const r = el.getBoundingClientRect(); if (r.width < 1 || r.height < 1) return false;
    for (let n = el; n && n !== document.body; n = n.parentElement) { const cs = getComputedStyle(n); if (cs.display === 'none' || cs.visibility === 'hidden' || Number(cs.opacity) === 0) return false; }
    return true;
  };
  const label = (el) => (el.getAttribute('aria-label') || el.textContent || el.getAttribute('placeholder') || el.tagName).replace(/\s+/g, ' ').trim().slice(0, 28);
  const find = (sel, text) => [...document.querySelectorAll(sel)].find((e) => vis(e) && (!text || (text instanceof RegExp ? text.test(label(e)) : label(e).includes(text))));
  const until = (pred, timeout = 15000) => new Promise((res) => {
    const t0 = performance.now();
    const tick = () => { let v = false; try { v = pred(); } catch { /* 아직 */ } if (v) { requestAnimationFrame(() => res(performance.now() - t0)); return; } if (performance.now() - t0 > timeout) { res(-1); return; } requestAnimationFrame(tick); };
    tick();
  });
  /** 레이아웃 점검: 가로 넘침, 화면 밖 조작 요소, 같은 영역 안 버튼 겹침, 잘린 글자, 영역끼리 겹침, 작은 터치 영역 */
  const audit = () => {
    const vw = innerWidth, vh = innerHeight, out = { hscroll: document.documentElement.scrollWidth > vw + 1, offscreen: [], clipped: [], overlaps: [], textCut: [], regions: [], small: [] };
    // CSS2D 층(3D 말풍선·이름표)은 3D 장면을 따라 화면 밖으로 나가는 게 정상이라 뺀다: position fixed + inset 0 + pointer-events none 인 뿌리
    const css2d = [...document.querySelectorAll('body > div, #root ~ div, div')].filter((d) => d.style.position === 'fixed' && d.style.pointerEvents === 'none' && d.style.inset === '0px');
    const in3d = (e) => css2d.some((r) => r.contains(e)) || !!e.closest('[class^="w3d-"], .lm-label');
    const ctrls = [...document.querySelectorAll('button, input, select, textarea, a[href], [role=tab], [role=option]')].filter((e) => vis(e) && !e.closest('[aria-hidden="true"]') && !e.closest('.ui-map-canvas') && !e.closest('canvas') && !in3d(e));
    const leaf = ctrls.filter((e) => !ctrls.some((o) => o !== e && e.contains(o)));
    for (const e of leaf) {
      const r = e.getBoundingClientRect();
      if (r.left < -1 || r.right > vw + 1 || r.top < -1 || r.bottom > vh + 1) {
        // 세로로는 스크롤 영역 안이면 정상. 가로로 나가거나, 스크롤 영역 밖에서 세로로 나가면 문제
        let sc = null; for (let n = e.parentElement; n; n = n.parentElement) { const cs = getComputedStyle(n); if (/(auto|scroll)/.test(cs.overflowY) && n.scrollHeight > n.clientHeight) { sc = n; break; } }
        let xs = null; for (let n = e.parentElement; n; n = n.parentElement) { const cs = getComputedStyle(n); if (/(auto|scroll)/.test(cs.overflowX) && n.scrollWidth > n.clientWidth) { xs = n; break; } }
        if (xs && r.top >= -1 && r.bottom <= vh + 1) { out.hidden = (out.hidden || 0) + 1; continue; } // 가로로 밀어 보는 줄 안 (의도)
        if (r.left < -1 || r.right > vw + 1 || !sc) out.offscreen.push(`${label(e)} [${Math.round(r.left)},${Math.round(r.top)}~${Math.round(r.right)},${Math.round(r.bottom)}]`);
      }
      // 가로로 잘림: overflow-x hidden 조상 밖으로 나감 (가로 스크롤 영역은 의도된 것)
      for (let n = e.parentElement; n && n !== document.body; n = n.parentElement) {
        const cs = getComputedStyle(n);
        if (cs.overflowX === 'visible') continue;
        if (/(auto|scroll)/.test(cs.overflowX) && n.scrollWidth > n.clientWidth) break;
        const p = n.getBoundingClientRect();
        if (r.right > p.right + 1 || r.left < p.left - 1) out.clipped.push(`${label(e)} ⊄ .${(n.className || n.tagName).toString().split(' ')[0]}`);
        break;
      }
      if (vw <= 760 && (r.width < 24 || r.height < 24)) out.small.push(`${label(e)} ${Math.round(r.width)}×${Math.round(r.height)}`);
    }
    // 같은 영역(상단바·패널·대화상자·HUD) 안에서 조작 요소끼리 겹침
    const regionOf = (e) => e.closest('[role=dialog], .ui-panel, header, .ui-v-hud, .ui-chat, .ui-tb-pop') || document.body;
    for (let i = 0; i < leaf.length; i++) for (let j = i + 1; j < leaf.length; j++) {
      const a = leaf[i], b = leaf[j]; if (regionOf(a) !== regionOf(b)) continue;
      if (a.closest('.ui-heart-wrap') || b.closest('.ui-heart-wrap')) continue; // 카드 모서리에 얹은 하트 (의도)
      if (!!a.closest('.ui-sticky') !== !!b.closest('.ui-sticky')) continue; // 하단 고정 버튼 줄 밑으로 스크롤되는 내용 (의도)
      const ra = a.getBoundingClientRect(), rb = b.getBoundingClientRect();
      const ix = Math.min(ra.right, rb.right) - Math.max(ra.left, rb.left), iy = Math.min(ra.bottom, rb.bottom) - Math.max(ra.top, rb.top);
      if (ix > 3 && iy > 3) {
        // 스크롤 영역 밖으로 가려진 것끼리는 제외 (둘 다 보이는 자리여야)
        out.overlaps.push(`${label(a)} ↔ ${label(b)} (${Math.round(ix)}×${Math.round(iy)})`);
      }
    }
    // 잘린 글자: 줄임표 없이 넘치는 글자
    for (const e of document.querySelectorAll('.ui-panel *, header *, [role=dialog] *, .ui-v-hud *')) {
      if (e.children.length || !e.textContent.trim() || !vis(e)) continue;
      const cs = getComputedStyle(e);
      if (e.clientWidth <= 2 || cs.clip !== 'auto' && cs.clip !== '') continue; // 화면 낭독기 전용
      if (cs.overflowX !== 'visible' && cs.textOverflow !== 'ellipsis' && e.scrollWidth > e.clientWidth + 1) out.textCut.push(`"${e.textContent.trim().slice(0, 20)}" ${e.scrollWidth}>${e.clientWidth}`);
    }
    // 영역끼리 겹침 (대화상자·팝오버는 덮는 게 정상이라 제외)
    const regs = [['상단바', 'header.topbar'], ['패널', '.ui-panel'], ['동네 HUD', '.ui-v-hud'], ['미니맵', '#minimap'], ['조이스틱', '#joystick']]
      .map(([n, s]) => [n, document.querySelector(s)]).filter(([, e]) => vis(e)).map(([n, e]) => [n, e.getBoundingClientRect()]);
    for (let i = 0; i < regs.length; i++) for (let j = i + 1; j < regs.length; j++) {
      const [na, a] = regs[i], [nb, b] = regs[j];
      const ix = Math.min(a.right, b.right) - Math.max(a.left, b.left), iy = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
      if (ix > 8 && iy > 8) out.regions.push(`${na}↔${nb} ${Math.round(ix)}×${Math.round(iy)}`);
    }
    for (const k of ['offscreen', 'clipped', 'overlaps', 'textCut', 'small']) out[k] = [...new Set(out[k])];
    return out;
  };
  window.__qa = { vis, find, until, audit, label };
}

async function main() {
  const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] });
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 860 } });
  const page = await ctx.newPage();
  const errs = []; page.on('pageerror', (e) => errs.push(e.message.slice(0, 160)));
  const writes = []; // 운영에서 막은 쓰기 요청
  if (ENV === 'prod') {
    await page.route('**/api/v1/**', (route) => { const m = route.request().method(); if (m === 'GET' || m === 'OPTIONS') return route.continue(); writes.push(`${m} ${route.request().url()}`); return route.abort(); });
  }
  const api4xx = []; page.on('response', (r) => { if (r.url().includes('/api/v1/') && r.status() >= 500) api4xx.push(`${r.status()} ${r.request().method()} ${r.url().replace(/^.*\/api\/v1/, '')}`); });
  await page.addInitScript(installQa);
  await page.addInitScript(() => { try { sessionStorage.setItem('chatatda.onboarded', '1'); } catch { /* */ } });

  let token = null, email = null;
  if (DEV) { email = `qf${Date.now() % 1e7}@hanyang.ac.kr`; token = await login(email); }
  const t0 = Date.now();
  await page.goto(`${FE}/?${DEV ? 'solo&' : 'solo&'}q=low`);
  await page.waitForFunction(() => document.querySelector('header.topbar') && !document.querySelector('.loading'), null, { timeout: 120000 });
  rec('S-load', 1280, true, '첫 화면(상단바 + 로딩 끝)', Date.now() - t0);
  if (DEV) {
    await page.waitForFunction(() => !!window.__app?.useSession);
    await page.evaluate((t) => { window.__app.useSession.getState().setLogin(t, 'QA'); window.__app.useUi.setState({ profileOpen: false }); }, token);
  }
  const ev = (fn, arg) => page.evaluate(fn, arg);
  /** 클릭하고 조건이 참이 될 때까지 (페이지 안에서 잰다: 클릭 → 조건 → 다음 프레임) */
  const clickWait = (click, wait, timeout = 15000) => ev(async ({ click, wait, timeout }) => {
    const el = typeof click === 'string' ? document.querySelector(click) : window.__qa.find(click.sel, click.re ? new RegExp(click.re) : click.text);
    if (!el) return { err: `누를 것 없음 ${JSON.stringify(click)}` };
    const pred = new Function(`return (${wait})`);
    const p = window.__qa.until(pred, timeout); el.click(); const ms = await p;
    return ms < 0 ? { err: `시간 초과 ${timeout}ms: ${wait}` } : { ms };
  }, { click, wait, timeout });
  const audit = () => ev(() => window.__qa.audit());
  const auditRec = async (id, w) => {
    const a = await audit();
    const bad = [...(a.hscroll ? ['가로 스크롤'] : []), ...a.offscreen.map((x) => `화면밖 ${x}`), ...a.clipped.map((x) => `잘림 ${x}`), ...a.overlaps.map((x) => `겹침 ${x}`), ...a.regions.map((x) => `영역겹침 ${x}`)];
    rec(`L:${id}`, w, bad.length === 0, bad.slice(0, 6).join(' | ') + (bad.length > 6 ? ` 외 ${bad.length - 6}` : '') + (a.textCut.length ? ` · 글자잘림 ${a.textCut.slice(0, 3).join(', ')}` : '') + (a.small.length ? ` · 24px 미만 ${a.small.length}개(${a.small.slice(0, 3).join(', ')})` : ''));
    return a;
  };
  const closeAll = () => (DEV
    ? ev(() => { window.__app.useUi.setState({ panelOpen: false, mapMode: '3d', indoor: null, profileOpen: false }); })
    : ev(async () => { // 운영: dev 훅이 없어 화면 버튼으로 닫는다 (실내 나가기 → 지도 끄기 → 패널 접기 → 열린 메뉴 닫기)
      document.querySelector('.ui-interior .ui-tour-back')?.click();
      const map = window.__qa.find('button.mapswitch[aria-pressed="true"]'); map?.click();
      if (!map && document.querySelector('.ui-map')) { window.__qa.find('.ui-tb-menubtn')?.click(); await new Promise((r) => setTimeout(r, 50)); window.__qa.find('.ui-tb-pop button', '3D로 보기')?.click(); }
      document.querySelector('.ui-panel .fold')?.click();
      if (document.querySelector('.ui-tb-pop')) document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      await new Promise((r) => setTimeout(r, 80));
    }));
  /** 탭 열기: 넓으면 탭 버튼, 좁으면 메뉴 → 항목 */
  const openTab = async (label) => {
    const desk = await ev((l) => !!window.__qa.find('[role=tab]', l) || (l === '찜 목록' && !!window.__qa.find('button[aria-label="찜 목록"]')) || (l === '알림' && !!window.__qa.find('button.ui-bell')), label);
    const wait = `(() => { const p = document.querySelector('.ui-panel'); return p && window.__qa.vis(p) && !/불러오는 중/.test(p.textContent); })()`;
    if (desk) {
      const sel = label === '찜 목록' ? { sel: 'button[aria-label="찜 목록"]' } : label === '알림' ? { sel: 'button.ui-bell' } : { sel: '[role=tab]', text: label };
      return clickWait(sel, wait);
    }
    await ev(() => window.__qa.find('.ui-tb-menubtn').click());
    await page.waitForSelector('.ui-tb-pop');
    return clickWait({ sel: '.ui-tb-pop button', re: `^${label}` }, wait);
  };

  const TABLIST = ['매물 찾기', '캠퍼스 투어', '기숙사', '청년안심주택', '양도', '내 집 기록', '찜 목록', '알림'];
  for (const W of WIDTHS) {
    await page.setViewportSize({ width: W, height: W <= 760 ? 820 : 860 });
    await closeAll(); await page.waitForTimeout(400);
    await auditRec('기본 화면', W);

    for (const t of TABLIST) {
      if (!DEV && (t === '내 집 기록' || t === '찜 목록' || t === '알림')) continue; // 운영은 비로그인
      await closeAll(); if (DEV) await ev(() => { window.__app.useListingsUi.getState().select(null); window.__app.useDetailSel.setState({ housing: null, transfer: null }); }); await page.waitForTimeout(150);
      const r = await openTab(t);
      if (r.err) { rec(`T:${t}`, W, false, r.err); continue; }
      rec(`T:${t}`, W, r.ms <= SLOW * 3, '탭 → 패널 내용', r.ms);
      await auditRec(`패널 ${t}`, W);
    }

    // 매물 상세 → 판결 카드(AI 적정가 포함) → 3D에서 보기
    await closeAll(); if (DEV) await ev(() => window.__app.useListingsUi.getState().select(null)); await page.waitForTimeout(150);
    await openTab('매물 찾기');
    if (!DEV) await ev(() => window.__qa.find('.ui-panel .ui-back')?.click()); // 운영: 앞 폭에서 연 상세가 남아 있으면 목록으로
    await page.waitForTimeout(100);
    const d = await clickWait({ sel: '.ui-panel .ui-dc' }, `!!document.querySelector('.ui-panel .ui-vd .ui-vd-big') && !/불러오는 중/.test(document.querySelector('.ui-vd').textContent)`);
    if (d.err) rec('D:상세', W, false, d.err);
    else {
      rec('D:상세+판결', W, d.ms <= SLOW * 3, '목록 카드 → 판결 카드 숫자', d.ms);
      const v = await ev(() => ({ ai: document.querySelector('.ui-vd-b.is-ai dd')?.textContent, fair: document.querySelector('.ui-vd-b.is-fair dd')?.textContent, big: document.querySelector('.ui-vd-big')?.textContent, lineup: !!document.querySelector('.ui-lu'), wanted: !!document.querySelector('.ui-wanted') }));
      rec('X1:AI적정가 표시', W, !!v.ai, `판결 "${v.big}" · 실거래 ${v.fair} · AI ${v.ai} · 눈금자 ${v.lineup}`);
      await auditRec('매물 상세', W);
      // 판결 눈금자 이름표끼리 겹침
      const lu = await ev(() => { const ls = [...document.querySelectorAll('.ui-lu-label')].map((e) => e.getBoundingClientRect()); let n = 0; for (let i = 0; i < ls.length; i++) for (let j = i + 1; j < ls.length; j++) { const a = ls[i], b = ls[j]; if (Math.min(a.right, b.right) - Math.max(a.left, b.left) > 1 && Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > 1) n++; } const box = document.querySelector('.ui-lu')?.getBoundingClientRect(); const out = ls.filter((r) => box && (r.left < box.left - 1 || r.right > box.right + 1)).length; return { n, out, total: ls.length }; });
      rec('D3:눈금자 이름표', W, lu.n === 0 && lu.out === 0, `이름표 ${lu.total}개, 겹침 ${lu.n}, 밖으로 ${lu.out}`);
      if (DEV) {
        const p0 = await ev(() => { const p = window.__proto.player.pos; return [p.x, p.z]; });
        // 앞 폭에서 이미 그 집으로 갔으면 움직임이 없으니 캠퍼스로 돌아와서 잰다
        if (await ev(() => window.__area !== 'campus')) { await ev(() => window.__useArea.getState().goTo('campus', 0, 0)); await page.waitForFunction(() => window.__ready === true && window.__area === 'campus', null, { timeout: 60000 }); }
        const a0 = await ev(() => window.__area);
        const g = await clickWait({ sel: '.ui-ld-go' }, `window.__ready === true && (window.__area !== '${a0}' || Math.hypot(window.__proto.player.pos.x - ${p0[0]}, window.__proto.player.pos.z - ${p0[1]}) > 1)`, 30000);
        rec('D2:3D에서 보기', W, !g.err, g.err ?? `3D 이동 (${a0} → ${await ev(() => window.__area)})`, g.ms);
        await ev(() => window.__app.useArea?.getState?.().enter?.(null));
      }
    }

    // 지도 전환
    await closeAll(); await page.waitForTimeout(150);
    const mapBtn = await ev(() => !!window.__qa.find('button.mapswitch'));
    let m;
    if (mapBtn) m = await clickWait({ sel: 'button.mapswitch' }, `!!document.querySelector('.ui-map') && !document.querySelector('.ui-map-note[role=status]')`, 20000);
    else { await ev(() => window.__qa.find('.ui-tb-menubtn').click()); await page.waitForSelector('.ui-tb-pop'); m = await clickWait({ sel: '.ui-tb-pop button', text: '지도로 보기' }, `!!document.querySelector('.ui-map') && !document.querySelector('.ui-map-note[role=status]')`, 20000); }
    rec('C2:지도로 보기', W, !m.err, m.err ?? '지도 준비', m.ms);
    if (!m.err) { await page.waitForTimeout(300); await auditRec('지도 화면', W); }
    await closeAll(); await page.waitForTimeout(300);

    // 실내 진입·이탈 (1280, 380 만: 무겁다)
    if (W === 1280 || W === 380) {
      await openTab('기숙사');
      const i = await clickWait({ sel: '.ui-panel button', text: '실내 보기' }, `!!document.querySelector('.ui-interior canvas') && !document.querySelector('.ui-interior [role=status]') && !document.querySelector('.loading')`, 30000);
      rec('E1:실내 진입', W, !i.err, i.err ?? '기숙사 실내 보기 → 실내 캔버스', i.ms);
      if (!i.err) {
        await page.waitForTimeout(500); await auditRec('실내', W);
        const o = await clickWait('.ui-interior .ui-tour-back', `!document.querySelector('.ui-interior')`);
        rec('E1:실내 나가기', W, !o.err, o.err ?? '나가기 → 동네', o.ms);
      }
      await closeAll();
    }
  }

  // ---------- 상단바: 폭 761~1440 + 긴 닉네임에서 화면 밖으로 나가는 버튼이 없는지 ----------
  if (DEV) {
    await closeAll();
    const nick0 = await ev(() => window.__app.useSession.getState().nickname);
    await ev(() => window.__app.useSession.setState({ nickname: '아주아주긴닉네임스물다섯자까지도올수있어요' }));
    const bad = [];
    for (const w of [761, 820, 900, 1024, 1101, 1180, 1280, 1440]) {
      await page.setViewportSize({ width: w, height: 800 }); await page.waitForTimeout(120);
      const r = await ev(() => [...document.querySelectorAll('header.topbar button, header.topbar input')].filter((e) => window.__qa.vis(e)).map((e) => [window.__qa.label(e), e.getBoundingClientRect().right]).filter(([, right]) => right > innerWidth + 1));
      if (r.length) bad.push(`${w}: ${r.map(([n, x]) => `${n}→${Math.round(x)}`).join(', ')}`);
    }
    rec('S3:상단바 폭별 넘침', 0, bad.length === 0, bad.join(' | ') || '761~1440 8가지 폭, 긴 닉네임에서도 넘침 없음');
    await ev((n) => window.__app.useSession.setState({ nickname: n }), nick0);
  }

  // ---------- 폼 (local 만: 실서버 쓰기) ----------
  if (DEV) {
    for (const W of [1280, 380]) {
      await page.setViewportSize({ width: W, height: W <= 760 ? 820 : 860 });
      await closeAll(); await page.waitForTimeout(300);
      // 내 정보
      await ev(() => window.__app.useUi.setState({ profileOpen: true }));
      await page.waitForSelector('[role=dialog][aria-label="내 정보"]');
      await auditRec('내 정보 창', W);
      if (W === 1280) {
        const chip = await ev(() => { const b = window.__qa.find('[role=dialog] button', '50만'); b?.click(); return !!b; });
        const s = await clickWait({ sel: '[role=dialog] button', text: '저장' }, `!document.querySelector('[role=dialog][aria-label="내 정보"]')`);
        const prof = await ev(() => window.__app.api('/me/profile'));
        rec('A2:내 정보 저장', W, !s.err && prof.budget?.rentCap === 500000, `${chip ? '50만 칩' : '칩 없음'} → 저장 → 서버 rentCap ${prof.budget?.rentCap}`, s.ms);
      } else await ev(() => window.__app.useUi.setState({ profileOpen: false }));

      // 내 집 기록: 주소 → 금액 → 달력 → 등록
      await closeAll(); await openTab('내 집 기록');
      const hasForm = await ev(() => !!document.querySelector('.ui-panel input[aria-label="주소 검색"]'));
      if (hasForm) {
        await page.getByRole('combobox', { name: '주소 검색' }).fill('행당동');
        const opt = page.locator('[role=option]').first();
        const got = await opt.waitFor({ timeout: 10000 }).then(() => true, () => false);
        if (!got) rec('H1:주소 검색', W, false, '주소 결과 없음 (/geo/address)');
        else {
          await opt.click();
          await page.getByRole('textbox', { name: '보증금(만원)' }).fill('1000');
          await page.getByRole('textbox', { name: '월세(만원)' }).fill('55');
          await page.getByRole('textbox', { name: '면적(㎡)' }).fill('18');
          await ev(() => window.__qa.find('.ui-date-btn').click());
          await page.waitForSelector('.ui-dcal');
          const cal = await ev(() => { const c = document.querySelector('.ui-dcal').getBoundingClientRect(), p = document.querySelector('.ui-panel').getBoundingClientRect(); return { inView: c.left >= 0 && c.right <= innerWidth && c.top >= 0, inPanel: c.left >= p.left - 1 && c.right <= p.right + 1, w: Math.round(c.width) }; });
          rec('H1:달력 위치', W, cal.inView && cal.inPanel, `달력 폭 ${cal.w}, 화면 안 ${cal.inView}, 패널 안 ${cal.inPanel}`);
          await ev(() => window.__qa.find('.ui-dcal-quick button', '오늘').click());
          const endSet = await ev(() => [...document.querySelectorAll('.ui-date-btn')].map((b) => b.textContent.trim()));
          if (W === 1280) {
            const s = await clickWait({ sel: '.ui-panel .ui-primary', text: '등록' }, `!!document.querySelector('.ui-home-card') || !!document.querySelector('[aria-label="내 집"]')`);
            rec('H1:내 집 등록', W, !s.err, s.err ?? `날짜 ${endSet.join(' ~ ')} → 등록 → 내 집 카드`, s.ms);
            if (!s.err) await auditRec('내 집 기록(등록 후)', W);
            // 월세 한 번 누르기
            const pay = await ev(() => !!window.__qa.find('.ui-panel button', /냈어요$/));
            if (pay) { const p = await clickWait({ sel: '.ui-panel button', re: '냈어요$' }, `!!document.querySelector('.ui-home-row.is-done')`); const pays = await ev(() => window.__app.api('/me/payments')); rec('H2:월세 한 번 누르기', W, !p.err && pays.length === 1, `${p.err ?? ''} 서버 납부 ${pays.length}건 ${pays[0]?.amount ?? ''}`, p.ms); }
            else rec('H2:월세 한 번 누르기', W, false, '"…냈어요" 버튼 없음');
          } else rec('H1:모바일 폼', W, endSet.filter((x) => /\d/.test(x)).length === 2, `오늘 → 끝 자동 ${endSet.join(' ~ ')}`);
        }
      } else await auditRec('내 집 기록(등록됨)', W);

      // 양도 글쓰기: 빈 칸 안내 → 임시 저장 복원 → 올리기
      if (W === 1280) {
        await closeAll(); await openTab('양도');
        await ev(() => window.__qa.find('.ui-panel .ui-primary', '양도 글 올리기').click());
        await page.waitForSelector('.ui-panel input[aria-label="주소 검색"]');
        await auditRec('양도 글쓰기', W);
        const miss = await ev(async () => { const b = window.__qa.find('.ui-sticky-jump'); if (!b) return null; b.click(); await new Promise((r) => setTimeout(r, 400)); return document.activeElement?.getAttribute('aria-label'); });
        rec('K2:빈 칸으로 이동', W, miss === '주소 검색', `안내 누름 → 포커스 "${miss}"`);
        await page.getByRole('combobox', { name: '주소 검색' }).fill('행당동');
        await page.locator('[role=option]').first().click({ timeout: 10000 });
        await page.getByRole('textbox', { name: '보증금(만원)' }).fill('500');
        await page.getByRole('textbox', { name: '월세(만원)' }).fill('45');
        await page.waitForTimeout(300);
        await page.reload(); await page.waitForFunction(() => !!window.__app?.useSession && !document.querySelector('.loading'), null, { timeout: 120000 });
        await ev(() => window.__app.useUi.setState({ profileOpen: false, tab: 'transfer', panelOpen: true }));
        await ev(() => window.__qa.find('.ui-panel .ui-primary', '양도 글 올리기').click());
        const restored = await ev(async () => { await window.__qa.until(() => document.querySelector('.ui-form2'), 5000); return { msg: !!document.querySelector('.ui-form2-restored'), dep: document.querySelector('input[aria-label="보증금(만원)"]')?.value, addr: document.querySelector('.ui-addr2-main')?.textContent?.trim()?.slice(0, 20) ?? null }; });
        rec('K2:임시 저장 복원', W, restored.msg && restored.dep === '500', `새로고침 → "이어서 써요" ${restored.msg}, 보증금 ${restored.dep}, 주소 ${restored.addr}`);
        await page.getByRole('textbox', { name: '면적(㎡)' }).fill('17');
        await ev(() => window.__qa.find('.ui-panel button', '6개월').click());
        const title = await ev(() => document.querySelector('input[aria-label="글 제목"]')?.value);
        const s = await clickWait({ sel: '.ui-panel .ui-primary', text: '올리기' }, `!document.querySelector('.ui-form2')`);
        const mine = await ev(async (t) => { const l = await window.__app.api('/transfers?size=50'); return l.items.find((x) => x.title === t); }, title);
        const draftGone = await ev(() => localStorage.getItem('chatatda.transferDraft') == null);
        rec('K2:양도 글 올리기', W, !s.err && !!mine && draftGone, `${s.err ?? ''} 제목 "${title}" → 서버 ${mine ? `id ${mine.id} 등급 ${mine.grade}` : '없음'}, 임시 저장 지움 ${draftGone}`, s.ms);
      }

      // 후기 쓰기 (1280)
      if (W === 1280) {
        await closeAll(); await openTab('매물 찾기');
        await clickWait({ sel: '.ui-panel .ui-dc' }, `!!document.querySelector('.ui-reviews')`);
        const before = await ev(() => Number(document.querySelector('.ui-rv-n')?.textContent || 0));
        await ev(() => window.__qa.find('.ui-rv-write').click());
        await page.waitForSelector('.ui-reviews textarea');
        await ev(() => { for (const g of document.querySelectorAll('.ui-reviews [role=radiogroup]')) g.querySelectorAll('[role=radio]')[3]?.click(); });
        await page.getByRole('textbox', { name: '후기 내용' }).fill('QA 최종 점검 후기: 낮에 채광이 좋고 밤에는 조용한 편이에요.');
        await auditRec('후기 쓰기', W);
        const s = await clickWait({ sel: '.ui-reviews button', text: '등록' }, `!document.querySelector('.ui-reviews textarea') && Number(document.querySelector('.ui-rv-n')?.textContent || 0) > ${before}`);
        rec('G1:후기 등록', W, !s.err, s.err ?? `후기 ${before} → +1`, s.ms);
      }
    }
  }

  // ---------- 운영: 쓰기 요청이 나가지 않았는지 ----------
  if (ENV === 'prod') rec('prod:쓰기 차단', 0, writes.length === 0, writes.length ? `막은 쓰기 ${writes.slice(0, 3).join(', ')}` : '쓰기 요청 0');
  rec('S:페이지 오류', 0, errs.length === 0, errs.slice(0, 4).join(' | ') || '없음');
  rec('S:API 5xx', 0, api4xx.length === 0, api4xx.slice(0, 5).join(' | ') || '없음');

  await browser.close();
  const slow = R.filter((r) => r.ms != null && r.ms > SLOW).map((r) => `${r.w} ${r.id} ${Math.round(r.ms)}ms`);
  const fail = R.filter((r) => !r.ok);
  const summary = { env: ENV, total: R.length, passed: R.length - fail.length, failed: fail.map((r) => `${r.w} ${r.id}: ${r.note}`), slow, email };
  writeFileSync(OUT, JSON.stringify({ summary, results: R }, null, 2));
  console.log(`\n${ENV}: ${summary.passed}/${summary.total} 통과, ${SLOW}ms 넘는 반응 ${slow.length}개`);
}

main().catch((e) => { console.error(e); process.exit(1); });
