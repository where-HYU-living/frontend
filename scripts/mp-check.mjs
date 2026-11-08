// 멀티플레이 신뢰성 점검 (캡처 없음, 숫자만): 브라우저 컨텍스트 3개(A·B·C)를 같은 공유 월드에 붙인다.
// node scripts/mp-check.mjs [port] [--restart-cmd="..."]  — dev 서버(5173) + 로컬 백엔드(8080, /ws/world)가 떠 있어야 한다.
// 확인: 입장 인원, 위치 오차(m)·지연(ms), 이동 애니메이션, 퇴장 반영, 재접속, 캠퍼스↔동네 전환 중 위치, 초대 링크(캠퍼스·동네), 연결 끊김, 중복 접속, 서버 재시작.
import { chromium } from 'playwright-core';
import { execSync } from 'node:child_process';

const argv = process.argv.slice(2);
const port = argv.find((a) => /^\d+$/.test(a)) || '5173';
const restartCmd = (argv.find((a) => a.startsWith('--restart-cmd=')) || '').slice('--restart-cmd='.length);
const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] });
const results = [];
const log = (ok, name, detail) => { results.push(ok); console.log(`${ok ? 'PASS' : 'FAIL'} ${name} — ${detail}`); };
const errors = [];

async function client(name, extra = '') {
  const ctx = await browser.newContext({ viewport: { width: 1000, height: 700 } });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(`${name}: ${e.message.slice(0, 100)}`));
  await page.addInitScript((n) => sessionStorage.setItem('chatatda.nick', n), name);
  await page.goto(`http://localhost:${port}/?mock=1&q=low${extra}`);
  await page.waitForFunction(() => window.__ready === true, null, { timeout: 120000 });
  await page.waitForFunction(() => window.__net?.getState().status === 'open' && window.__net.getState().selfId, null, { timeout: 30000 });
  return { name, ctx, page, id: await page.evaluate(() => window.__net.getState().selfId) };
}
const st = (c) => c.page.evaluate(() => ({ status: window.__net.getState().status, id: window.__net.getState().selfId, count: window.__net.getState().count, area: window.__area }));
const pose = (c) => c.page.evaluate(() => { const p = window.__proto.player.pos; return [p.x, p.z]; });
/** viewer 가 받은 target 의 마지막 위치 */
const seen = (viewer, targetId) => viewer.page.evaluate((id) => { const pl = window.__mpModel?.players?.[id]; if (!pl) return null; const s = pl.samples[pl.samples.length - 1]; return { x: s.p[0], z: s.p[2], a: pl.a }; }, targetId);
const has = (viewer, id) => viewer.page.evaluate((i) => !!window.__mpModel?.players?.[i], id);
async function waitUntil(fn, ms = 8000, step = 25) { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (await fn()) return Date.now() - t0; await new Promise((r) => setTimeout(r, step)); } return -1; }
const teleport = (c, x, z) => c.page.evaluate(([x, z]) => window.__proto.player.teleport(x, z), [x, z]);

// 1. 입장
const A = await client('테스트A');
const B = await client('테스트B');
const joinMs = await waitUntil(() => has(A, B.id));
const sb = await st(B);
log(joinMs >= 0 && sb.count >= 1, '입장', `A 가 B 를 보기까지 ${joinMs}ms, B 가 보는 다른 접속자 ${sb.count}명`);

// 2. 위치 동기화 (지연·오차)
let maxErr = 0, lat = [];
for (const [x, z] of [[-10, 5], [30, -20], [60, -60], [5, 40]]) {
  await teleport(A, x, z);
  const [ax, az] = await pose(A);
  const ms = await waitUntil(async () => { const s = await seen(B, A.id); return s && Math.hypot(s.x - ax, s.z - az) < 0.05; }, 3000, 10);
  const s = await seen(B, A.id);
  maxErr = Math.max(maxErr, s ? Math.hypot(s.x - ax, s.z - az) : 999); lat.push(ms);
}
log(maxErr < 0.05 && lat.every((v) => v >= 0 && v < 600), '위치 동기화', `순간이동 4번, B 가 받은 A 위치 오차 최대 ${maxErr.toFixed(3)}m, 지연 ${lat.join('/')}ms (move 10Hz + 서버 tick 100ms)`);

// 3. 이동(걷기 애니메이션)
await A.page.keyboard.down('KeyW'); await A.page.waitForTimeout(900);
const walk = await seen(B, A.id);
await A.page.keyboard.up('KeyW'); await A.page.waitForTimeout(600);
const [ax2, az2] = await pose(A); await B.page.waitForTimeout(400);
const idle = await seen(B, A.id);
log(walk?.a === 'walk' && idle?.a === 'idle' && Math.hypot(idle.x - ax2, idle.z - az2) < 0.05, '걷기', `걷는 중 상대에게 a=${walk?.a}, 멈춘 뒤 a=${idle?.a}, 멈춘 위치 오차 ${idle ? Math.hypot(idle.x - ax2, idle.z - az2).toFixed(3) : '-'}m`);

// 4. 캠퍼스 ↔ 동네 전환: 연결 유지·위치
const before = await st(A);
await A.page.evaluate(() => window.__useArea.getState().enter('l6', null));
await A.page.waitForFunction(() => window.__ready === true && window.__area === 'l6', null, { timeout: 120000 });
await A.page.waitForTimeout(800);
const inL6 = await st(A);
const [lx, lz] = await pose(A);
const nbMs = await waitUntil(async () => { const s = await seen(B, A.id); return s && Math.hypot(s.x - lx, s.z - lz) < 0.05; }, 4000, 10);
const sL6 = await seen(B, A.id);
log(inL6.status === 'open' && inL6.id === before.id && nbMs >= 0, '동네로 전환', `A 연결 ${inL6.status}, selfId 유지 ${inL6.id === before.id}, B 가 본 A 위치 (${sL6?.x.toFixed(1)},${sL6?.z.toFixed(1)}) = A 실제 (${lx.toFixed(1)},${lz.toFixed(1)}) 까지 ${nbMs}ms`);
// B 가 그 사이 A 를 놓쳤다가(leave) 다시 봤는지: 놓쳤으면 연결이 끊긴 것
const stillThere = await has(B, A.id);

// 5. 동네에서 초대 → C 는 그 동네로 월드를 바꿔 A 옆에
const inv = await A.page.evaluate(async (id) => { const r = await fetch('http://localhost:8080/api/v1/invites', { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: location.origin }, body: JSON.stringify({ playerId: id }) }); return r.json(); }, A.id);
const token = new URL(inv.url).searchParams.get('invite');
const C = await client('테스트C', `&invite=${token}`);
await C.page.waitForFunction(() => window.__area === 'l6' && window.__ready === true, null, { timeout: 120000 }).catch(() => {});
await C.page.waitForTimeout(800);
const [cx, cz] = await pose(C); const [ax3, az3] = await pose(A);
const cArea = (await st(C)).area;
const cSeesA = await has(C, A.id);
log(cArea === 'l6' && Math.hypot(cx - ax3, cz - az3) <= 3 && cSeesA && stillThere, '초대 링크(동네)', `C 월드 ${cArea}, A 와 거리 ${Math.hypot(cx - ax3, cz - az3).toFixed(2)}m (C ${cx.toFixed(1)},${cz.toFixed(1)} · A ${ax3.toFixed(1)},${az3.toFixed(1)}), C 가 A 를 봄 ${cSeesA}, B 는 전환 중에도 A 를 계속 봄 ${stillThere}`);

// 6. 캠퍼스로 돌아오기 + 캠퍼스 초대
await A.page.evaluate(() => window.__useArea.getState().leave());
await A.page.waitForFunction(() => window.__ready === true && window.__area === 'campus', null, { timeout: 120000 });
await A.page.waitForTimeout(800);
const [bx, bz] = await pose(A);
const backMs = await waitUntil(async () => { const s = await seen(B, A.id); return s && Math.hypot(s.x - bx, s.z - bz) < 0.05; }, 4000, 10);
log(backMs >= 0 && (await st(A)).id === A.id, '캠퍼스로 복귀', `B 가 복귀한 A 위치를 받기까지 ${backMs}ms, selfId 유지`);
const inv2 = await A.page.evaluate(async (id) => (await (await fetch('http://localhost:8080/api/v1/invites', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ playerId: id }) })).json()), A.id);
const D = await client('테스트D', `&invite=${new URL(inv2.url).searchParams.get('invite')}`);
await D.page.waitForTimeout(800);
const [dx, dz] = await pose(D); const [ax4, az4] = await pose(A);
log((await st(D)).area === 'campus' && Math.hypot(dx - ax4, dz - az4) <= 3, '초대 링크(캠퍼스)', `D 월드 ${(await st(D)).area}, A 와 거리 ${Math.hypot(dx - ax4, dz - az4).toFixed(2)}m`);

// 7. 퇴장 반영
const t7 = Date.now(); await D.ctx.close();
const leaveMs = await waitUntil(async () => !(await has(A, D.id)), 10000);
log(leaveMs >= 0, '퇴장', `D 창을 닫고 A 에서 사라지기까지 ${leaveMs}ms`);

// 8. 재접속 (새로고침) — 같은 사람이 새 id 로 다시 보이고 옛 id 는 사라짐
const oldB = B.id;
await B.page.reload();
await B.page.waitForFunction(() => window.__ready === true && window.__net?.getState().status === 'open' && window.__net.getState().selfId, null, { timeout: 120000 });
B.id = await B.page.evaluate(() => window.__net.getState().selfId);
const reMs = await waitUntil(async () => (await has(A, B.id)) && !(await has(A, oldB)), 10000);
log(reMs >= 0, '새로고침 재접속', `A 가 새 B 를 보고 옛 B 가 사라지기까지 ${reMs}ms`);

// 9. 연결 끊김(오프라인 6초) → 자동 재접속, 화면 안 죽음
await C.ctx.setOffline(true);
// 열려 있는 WebSocket 은 오프라인 전환만으로는 안 끊겨서 소켓도 끊는다 (재접속 시도는 오프라인이라 실패하다가 온라인이 되면 성공해야 한다)
await C.page.evaluate(() => window.__net.getState().conn?.drop());
const offStatus = await C.page.waitForFunction(() => window.__net.getState().status !== 'open', null, { timeout: 15000 }).then(() => 'closed', () => 'still-open');
await C.page.waitForTimeout(3000);
await C.ctx.setOffline(false);
const reconMs = await waitUntil(() => C.page.evaluate(() => window.__net.getState().status === 'open'), 20000, 100);
const cAlive = await C.page.evaluate(() => window.__ready === true && !!window.__proto?.player);
log(reconMs >= 0 && cAlive, '연결 끊김', `오프라인 중 상태 ${offStatus}, 온라인 후 재접속 ${reconMs}ms, 3D 살아 있음 ${cAlive}, C 위치 유지(재초대 없음) ${(await st(C)).area}`);

// 10. 중복 접속 (같은 닉네임 두 창)
const B2 = await client('테스트B');
const dupOk = await waitUntil(async () => (await has(A, B2.id)) && (await has(A, B.id)), 5000);
log(dupOk >= 0 && B2.id !== B.id, '중복 접속', `같은 닉네임 두 창이 각자 id(${B.id}, ${B2.id})로 보임, A 가 보는 인원 ${(await st(A)).count}`);
await B2.ctx.close();

// 11. 서버 재시작
if (restartCmd) {
  const t0 = Date.now();
  execSync(restartCmd, { stdio: 'ignore' });
  const down = await waitUntil(() => A.page.evaluate(() => window.__net.getState().status !== 'open'), 30000, 200);
  const up = await waitUntil(async () => (await A.page.evaluate(() => window.__net.getState().status === 'open')) && (await B.page.evaluate(() => window.__net.getState().status === 'open')), 120000, 500);
  const idA = await A.page.evaluate(() => window.__net.getState().selfId), idB = await B.page.evaluate(() => window.__net.getState().selfId);
  const seeMs = await waitUntil(async () => (await has(A, idB)) && (await has(B, idA)), 10000);
  const alive = await A.page.evaluate(() => window.__ready === true) && await B.page.evaluate(() => window.__ready === true);
  log(up >= 0 && seeMs >= 0 && alive, '서버 재시작', `끊김 감지 ${down}ms, 재시작~둘 다 재접속 ${up}ms(총 ${Date.now() - t0}ms), 서로 다시 보임 ${seeMs}ms, 3D 살아 있음 ${alive}`);
}

await browser.close();
const fail = results.filter((r) => !r).length;
console.log(`RESULT ${results.length - fail}/${results.length} pageerrors=${errors.length}`, errors.slice(0, 3));
process.exit(fail ? 1 : 0);
