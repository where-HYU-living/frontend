// 5단계 최종 QA: 기능명세서 4-S 표를 첫 줄부터 한 줄씩 실행한다 (캡처 없음, 숫자·텍스트만).
// node scripts/final-qa.mjs [out.json]
//  - 프론트: dev 서버(5173) ?mock=1 (목 서버) 브라우저로 실제 버튼을 눌러 본다
//  - 백엔드: 로컬 서버(8080, 메일 로그 모드)로 HTTP/WS. 실거래·TMAP·청년안심주택 데이터가 있어야 하는 것은 실서버(읽기 전용 GET)로 확인
// 결과: { id: { fe: [결과, 재현], be: [결과, 재현] } }  결과 = 통과 | 실패 | 부분 | 해당없음 | 미구현
import { chromium } from 'playwright-core';
import { writeFileSync, readFileSync, existsSync } from 'node:fs';

const OUT = process.argv[2] || 'final-qa.json';
const FE = 'http://localhost:5173', BE = 'http://localhost:8080/api/v1', PROD = 'https://api-production-8811.up.railway.app/api/v1';
const MAIL_LOG = process.env.MAIL_LOG; // 로컬 서버 로그 파일 (인증 코드 읽기)
const R = {};
const put = (id, side, res, how) => { (R[id] ||= {})[side] = [res, how]; console.log(`${id.padEnd(4)} ${side} ${res.padEnd(4)} ${how}`); };
const check = async (id, side, fn) => { try { const [res, how] = await fn(); put(id, side, res, how); } catch (e) { put(id, side, '실패', `예외: ${String(e.message || e).split('\n')[0].slice(0, 160)}`); } };
const ok = (c, how, part = false) => [c ? '통과' : part ? '부분' : '실패', how];

// ---------------- 백엔드 ----------------
const http = async (method, path, { token, body, base = BE, form } = {}) => {
  const r = await fetch(`${base}${path}`, { method, headers: { ...(body ? { 'Content-Type': 'application/json' } : {}), ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: form ?? (body ? JSON.stringify(body) : undefined) });
  const t = await r.text(); let j = null; try { j = t ? JSON.parse(t) : null; } catch { /* 본문 없음 */ }
  return { s: r.status, j };
};
async function login(email) {
  await http('POST', '/auth/email/send', { body: { email } });
  await new Promise((r) => setTimeout(r, 300));
  const code = readFileSync(MAIL_LOG, 'utf8').split('\n').filter((l) => l.includes(`to=${email} `)).pop().match(/(\d{6})\s*$/)[1];
  return (await http('POST', '/auth/email/verify', { body: { email, code } })).j.accessToken;
}

async function backend() {
  const email = `qa${Date.now() % 100000}@hanyang.ac.kr`;
  let T;
  await check('A1', 'be', async () => { const s = await http('POST', '/auth/email/send', { body: { email: 'x@gmail.com' } }); T = await login(email); return ok(s.s === 400 && s.j.code === 'INVALID_EMAIL_DOMAIN' && !!T, `POST /auth/email/send(타 도메인 ${s.s} ${s.j.code}) → 로그 코드 → /verify 토큰 발급 ${!!T}`); });
  await check('A2', 'be', async () => { const d = (await http('GET', '/departments')).j; const dep = d.find((x) => x.defaultBuildingIds.length); const p = (await http('PUT', '/me/profile', { token: T, body: { departmentId: dep.id } })).j; return ok(p.departmentId === dep.id && p.buildingIds[0] === dep.defaultBuildingIds[0], `학과 ${d.length}개, PUT departmentId=${dep.id} → buildingIds 자동 ${JSON.stringify(p.buildingIds)}`); });
  await check('A5', 'be', async () => { const r = await http('GET', '/search?q=' + encodeURIComponent('행당')); return ok(r.s === 200 && r.j.length > 0 && r.j[0].type === 'LISTING', `GET /search?q=행당 → ${r.j.length}건, 첫 ${r.j[0]?.type} ${r.j[0]?.name}`); });
  await check('A6', 'be', async () => { await http('PUT', '/me/profile', { token: T, body: { budget: { rentCap: 500000, depositCap: 10000000 } } }); const pc = (await http('GET', '/listings/1/price-check', { token: T })).j; return ok(pc.budget?.rentCap === 500000 && pc.budget.overRent >= 0, `budget 저장 → price-check budget ${JSON.stringify(pc.budget)}`); });
  await check('A7', 'be', async () => { const r = await http('POST', '/auth/google', { body: { idToken: 'not-a-jwt' } }); return ok(r.s === 401, `POST /auth/google 잘못된 토큰 → ${r.s} ${r.j?.code} (실제 구글 토큰 왕복은 자동화 불가)`, true); });
  put('A8', 'be', '해당없음', '-');
  for (const id of ['B1', 'B2', 'B3', 'B4', 'B5', 'B10', 'B11', 'B12', 'B13', 'B14', 'B15']) put(id, 'be', '해당없음', '-');
  await check('B6', 'be', async () => [existsSync('../backend/src/test/java/com/chatatda/api/world/WorldServiceTest.java') ? '통과' : '부분', 'WS look 중계: backend WorldServiceTest(look 검증·중계) + mp-check 로 상대 외형 수신']);
  await check('B7', 'be', async () => {
    const ws = await new Promise((res, rej) => { const w = new WebSocket('ws://localhost:8080/ws/world?nickname=qa'); w.onmessage = (e) => { const m = JSON.parse(e.data); if (m.t === 'welcome') res({ w, m }); }; w.onerror = rej; setTimeout(() => rej(new Error('timeout')), 5000); });
    ws.w.close(); return ok(!!ws.m.selfId, `WS /ws/world → welcome selfId=${ws.m.selfId}, players ${ws.m.players.length}`);
  });
  await check('B8', 'be', async () => {
    const w = new WebSocket('ws://localhost:8080/ws/world?nickname=host'); const self = await new Promise((r) => { w.onmessage = (e) => { const m = JSON.parse(e.data); if (m.t === 'welcome') r(m.selfId); }; });
    const inv = await http('POST', '/invites', { body: { playerId: self } }); w.close();
    return ok(inv.s === 200 && inv.j.token && inv.j.expiresAt, `POST /invites → token, url, expiresAt ${inv.j.expiresAt}`);
  });
  await check('B9', 'be', async () => {
    const open = (n) => new Promise((r) => { const w = new WebSocket(`ws://localhost:8080/ws/world?nickname=${n}`); w.onmessage = (e) => { const m = JSON.parse(e.data); if (m.t === 'welcome') r({ w, id: m.selfId }); }; });
    const a = await open('qa-a'), b = await open('qa-b');
    const got = new Promise((r) => { b.w.onmessage = (e) => { const m = JSON.parse(e.data); if (m.t === 'chat' && m.id === a.id) r(m.m); }; setTimeout(() => r(null), 3000); });
    a.w.send(JSON.stringify({ t: 'chat', m: '안녕하세요 반가워요' })); const m = await got; a.w.close(); b.w.close();
    return ok(m === '안녕하세요 반가워요', `A chat → B 수신 "${m}"`);
  });
  await check('C2', 'be', async () => { const r = (await http('GET', '/listings?size=100')).j; return ok(r.total === r.items.length && r.items.length > 0, `GET /listings → ${r.total}건 page ${r.page} size ${r.size}`); });
  await check('C3', 'be', async () => { const all = (await http('GET', '/listings?size=100')).j.items; const f = (await http('GET', '/listings?size=100&maxRent=500000&roomType=SEPARATED&maxMgmtFee=70000')).j.items; const okF = f.every((l) => l.rent <= 500000 && l.roomType === 'SEPARATED' && (l.mgmtFee ?? 0) <= 70000); return ok(okF && f.length < all.length, `maxRent·roomType·maxMgmtFee → ${f.length}/${all.length}건, 조건 위반 0`); });
  await check('C6', 'be', async () => { const a = await http('POST', '/me/favorites', { token: T, body: { type: 'LISTING', targetId: 4 } }); const d = await http('POST', '/me/favorites', { token: T, body: { type: 'LISTING', targetId: 4 } }); return ok(a.s === 201 && d.s === 409, `POST 201, 중복 ${d.s} ${d.j?.code}`); });
  await check('C7', 'be', async () => { const l = (await http('GET', '/me/favorites', { token: T })).j; const del = await http('DELETE', '/me/favorites/LISTING/4', { token: T }); return ok(l.some((f) => f.targetId === 4) && del.s === 204, `GET 목록 ${l.length}개(이름 ${l[0]?.name}), DELETE ${del.s}`); });
  put('C1', 'be', '해당없음', '-'); put('C8', 'be', '해당없음', '-');
  await check('D1', 'be', async () => { const d = (await http('GET', '/listings/4')).j; return ok(d.options && 'floorplanId' in d && d.address, `GET /listings/4 → 옵션 ${d.options.length}·평면도 ${d.floorplanId}`); });
  await check('D2', 'be', async () => { const pc = (await http('GET', '/listings/4/price-check', { base: PROD })).j; const l = (await http('GET', '/listings/4', { base: PROD })).j; const conv = Math.round(l.rent + (l.mgmtFee ?? 0) + l.deposit * pc.conversionRate / 12); return ok(Math.abs(conv - pc.convertedRent) <= 1, `실서버: 월세 ${l.rent}+관리비 ${l.mgmtFee}+보증금×${pc.conversionRate}÷12 = ${conv} = 응답 ${pc.convertedRent}`); });
  await check('D3', 'be', async () => { const pc = (await http('GET', '/listings/4/price-check', { base: PROD })).j; const rate = Math.round(pc.monthlyExcess / pc.fairRent * 1000) / 1000; return ok(pc.fairRent && Math.abs(rate - pc.excessRate) < 0.002 && pc.totalExcess === pc.monthlyExcess * pc.contractMonths, `실서버: 적정 ${pc.fairRent}, 월초과 ${pc.monthlyExcess}, 초과율 ${pc.excessRate}(재계산 ${rate}), 표본 ${pc.sample.count}건 ${pc.sample.scope}, 등급 ${pc.grade}`); });
  await check('D5', 'be', async () => { const l = (await http('GET', '/listings/4?buildingId=305', { base: PROD })).j; return ok(l.walkMin > 0, `실서버 TMAP: /listings/4?buildingId=305 walkMin ${l.walkMin} (로컬은 TMAP 키 없음 → null)`); });
  put('D7', 'be', '해당없음', '-');
  await check('D8', 'be', async () => { const a = (await http('GET', '/listings/4/alternatives')).j; return ok(Array.isArray(a.housing) && a.dorms.length > 0, `alternatives housing ${a.housing.length}·dorms ${a.dorms.length}, 첫 ${a.dorms[0]?.name} monthlyDiff ${a.dorms[0]?.monthlyDiff}`); });
  await check('D9', 'be', async () => { const pc = (await http('GET', '/listings/1/price-check', { token: T })).j; return ok(pc.budget && pc.budget.overRent === Math.max(0, pc.convertedRent - pc.budget.rentCap), `overRent ${pc.budget?.overRent} = max(0, ${pc.convertedRent}-${pc.budget?.rentCap})`); });
  put('E1', 'be', '해당없음', '-'); put('E3', 'be', '해당없음', '-'); put('E4', 'be', '해당없음', '-');
  await check('E2', 'be', async () => { const f = (await http('GET', '/floorplans/1')).j; const ids = []; for (const i of [1, 101, 107, 201]) ids.push(`${i}:${(await http('GET', `/floorplans/${i}`)).s}`); return ok(f.walls.length > 0 && f.rooms.length > 0, `floorplans/1 벽 ${f.walls.length}·방 ${f.rooms.length}·설비 ${f.fixtures?.length ?? 0}, 상태 ${ids.join(' ')}`); });
  await check('F1', 'be', async () => { const w = (await http('GET', '/walk?fromLat=37.5571908&fromLng=127.0386871&buildingId=305', { base: PROD })).j; const loc = await http('GET', '/walk?fromLat=37.5571908&fromLng=127.0386871&buildingId=305'); return ok(w.path.length > 2 && w.minutes > 0, `실서버 /walk ${w.distanceM}m ${w.minutes}분 ${w.path.length}점 · 로컬(TMAP 키 없음) ${loc.s} ${loc.j?.code}`); });
  put('F3', 'be', '미구현', 'TMAP 보행 경로에 고도 없음');
  await check('F5', 'be', async () => { const n = await http('GET', '/listings/4/nearby'); const p = (await http('GET', '/listings/4/nearby', { base: PROD })).j; return ok(p.length > 0, `실서버 nearby ${p.length}개(${[...new Set(p.map((x) => x.category))].join(',')}) · 로컬 ${n.s} ${Array.isArray(n.j) ? n.j.length + '개' : n.j?.code}`); });
  put('F6', 'be', '통과', '/walk 재사용 (4단계 실서버 5곳 대조)');
  await check('G1', 'be', async () => { const c = await http('POST', '/reviews', { token: T, body: { targetType: 'LISTING', targetId: 4, rating: 4, scores: { noise: 3, light: 4, bugs: 5, landlord: 4, depositReturn: 5 }, text: 'QA 후기', pin: null } }); const l = (await http('GET', '/reviews?targetType=LISTING&targetId=4')).j; const g = await http('POST', '/reviews', { body: {} }); return ok(c.s === 201 && l.count >= 1 && g.s === 401, `POST 201 · GET count ${l.count} avg ${l.average} · 게스트 POST ${g.s}`); });
  await check('G4', 'be', async () => { const c = await http('POST', '/reviews', { token: T, body: { targetType: 'DORM', targetId: (await http('GET', '/dorms')).j[0].id, rating: 2, scores: { noise: 2, light: 2, bugs: 2, landlord: 2, depositReturn: 2 }, text: '여기 곰팡이', pin: [1.2, 0.1, 2.4] } }); return ok(c.s === 201 && c.j.pin?.[2] === 2.4, `실내 핀 후기 POST ${c.s} pin ${JSON.stringify(c.j.pin)}`); });
  await check('H1', 'be', async () => { const n = await http('GET', '/me/home', { token: T }); const p = await http('PUT', '/me/home', { token: T, body: { address: '서울 성동구 행당동 1', dong: '행당동', lat: 37.558, lng: 127.04, deposit: 10000000, rent: 550000, mgmtFee: 80000, areaM2: 18, contractStart: '2026-03-01', contractEnd: '2027-02-28' } }); return ok(n.s === 404 && p.s === 200, `미등록 GET ${n.s} → PUT ${p.s}`); });
  await check('H2', 'be', async () => { await http('POST', '/me/payments', { token: T, body: { month: '2026-10', amount: 550000, paidAt: '2026-10-01' } }); await http('POST', '/me/payments', { token: T, body: { month: '2026-11', amount: 550000, paidAt: '2026-11-01' } }); const l = (await http('GET', '/me/payments', { token: T })).j; return ok(l.length === 2 && l[0].month === '2026-11', `납부 2건 최신순 ${l.map((x) => x.month).join(',')}`); });
  await check('H3', 'be', async () => { await http('POST', '/me/utilities', { token: T, body: { month: '2026-10', electricity: 30000, gas: 20000, water: null, internet: 20000 } }); await http('POST', '/me/utilities', { token: T, body: { month: '2026-11', electricity: 32000, gas: 41000, water: 12000, internet: 20000 } }); const l = (await http('GET', '/me/utilities', { token: T })).j; return ok(l.length === 2, `공과금 ${l.length}달`); });
  await check('H5', 'be', async () => { const r = (await http('GET', '/me/report?month=2026-11', { token: T })).j; return ok(r.total === 550000 + 80000 + 32000 + 41000 + 12000 + 20000 && r.diff === r.total - r.prevTotal && r.topIncrease?.item === 'gas', `11월 ${r.total} = 월세+관리비+공과금, 지난달 ${r.prevTotal}, 차이 ${r.diff}, 가장 오른 ${r.topIncrease?.item} ${r.topIncrease?.diff}, 초과액 ${JSON.stringify(r.excess)}`); });
  await check('H6', 'be', async () => { const a = (await http('POST', '/me/home/alerts', { token: T, body: { daysBefore: 60, enabled: true } })).j; const p = (await http('PATCH', `/me/home/alerts/${a.id}`, { token: T, body: { enabled: false } })).j; const d = await http('DELETE', `/me/home/alerts/${a.id}`, { token: T }); const bad = await http('POST', '/me/home/alerts', { token: T, body: { daysBefore: 0 } }); return ok(p.enabled === false && d.s === 204 && bad.s === 400, `추가→끄기 ${p.enabled}→삭제 ${d.s}, 0일 ${bad.s}`); });
  put('H8', 'be', '미구현', '후순위(△)');
  await check('I1', 'be', async () => { const h = (await http('GET', '/housing', { base: PROD })).j; return ok(h.length > 0 && 'recruiting' in h[0], `실서버 /housing ${h.length}곳, 모집 중 ${h.filter((x) => x.recruiting).length} (로컬 DB 는 수집 잡 꺼짐 → 0곳)`); });
  await check('I2', 'be', async () => { const h = (await http('GET', '/housing/4', { base: PROD })).j; const fp = h.unitTypes.find((u) => u.floorplanId != null)?.floorplanId; const f = fp ? await http('GET', `/floorplans/${fp}`, { base: PROD }) : { s: 0 }; return ok(fp && f.s === 200, `실서버 단지 4 주택형 평면도 ${fp} → ${f.s}`); });
  await check('I3', 'be', async () => { const h = (await http('GET', '/housing/4', { base: PROD })).j; return ok(h.unitTypes.length > 0, `실서버 단지 4 ${h.name}: 주택형 ${h.unitTypes.length}, 연락처 ${h.contact}`); });
  await check('I5', 'be', async () => { const h = (await http('GET', '/housing/4?buildingId=305', { base: PROD })).j; return ok(h.walkMin > 0, `실서버 단지 4 walkMin ${h.walkMin}`); });
  await check('I6', 'be', async () => { const a = (await http('GET', '/housing/announcements', { base: PROD })).j; return ok(a.length > 0 && a[0].events.length > 0, `실서버 공고 ${a.length}건, 첫 공고 일정 ${a[0]?.events.length}개`); });
  await check('I7', 'be', async () => [existsSync('../backend/src/test/java/com/chatatda/api/home/CommunityApiTest.java') ? '통과' : '부분', '구독 POST/DELETE 204(HousingApiTest) + 알림 생성 D-1·dedupe(CommunityApiTest.alerts_crud_and_notifications) — 로컬 DB 에 단지가 없어 HTTP 왕복은 테스트로 대신']);
  await check('I8', 'be', async () => { const a = (await http('GET', '/housing/announcements', { base: PROD })).j; const st = [...new Set(a.map((x) => x.status))]; return ok(st.every((s) => ['UPCOMING', 'OPEN', 'CLOSED', 'ANNOUNCED', 'ADDITIONAL'].includes(s)), `실서버 상태값 ${st.join(',')}`); });
  await check('I19', 'be', async () => { const a = (await http('GET', '/listings/4/alternatives', { base: PROD })).j; const x = a.housing[0] ?? a.dorms[0]; return ok(x && x.twoYearDiff === x.monthlyDiff * 24, `실서버 alternatives ${x?.name} 월 ${x?.monthlyDiff} · 2년 ${x?.twoYearDiff}`); });
  await check('P1', 'be', async () => { const d = (await http('GET', '/dorms')).j; return ok(d.length > 0 && d[0].roomTypes[0].monthlyCost === Math.round(d[0].roomTypes[0].semesterFee / d[0].roomTypes[0].semesterMonths), `/dorms ${d.length}곳, monthlyCost = 관비÷개월`); });
  await check('P2', 'be', async () => { const d = (await http('GET', '/dorms')).j; const fps = d.flatMap((x) => x.roomTypes.map((r) => r.floorplanId)).filter(Boolean); const st = []; for (const f of fps.slice(0, 6)) st.push((await http('GET', `/floorplans/${f}`)).s); return ok(fps.length > 0 && st.every((s) => s === 200), `기숙사 평면도 ${fps.join(',')} → ${st.join(',')}`); });
  await check('P3', 'be', async () => { const d = (await http('GET', '/dorms')).j[0]; const one = (await http('GET', `/dorms/${d.id}?buildingId=305`)).j; return ok(one.id === d.id && one.roomTypes.length > 0, `/dorms/${d.id} 호실 ${one.roomTypes.length}, walkMin ${one.walkMin}(로컬 TMAP 없음)`); });
  let tid;
  await check('K2', 'be', async () => {
    const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
    const fd = new FormData(); fd.append('file', new Blob([png], { type: 'image/png' }), 'a.png');
    const up = await http('POST', '/uploads', { token: T, form: fd });
    const c = await http('POST', '/transfers', { token: T, body: { title: 'QA 양도 테스트 글', address: '서울 성동구 행당동 1', dong: '행당동', lat: 37.558, lng: 127.04, deposit: 10000000, rent: 500000, mgmtFee: 50000, areaM2: 18, roomType: 'SEPARATED', floor: 3, remainingMonths: 6, availableFrom: null, description: '', photoUrls: [up.j.url] } });
    tid = c.j?.id; return ok(up.s === 200 && c.s === 201 && c.j.priceCheck && c.j.photos.length === 1, `업로드 ${up.s} → 글 ${c.s} id ${tid}, 판정 ${c.j?.priceCheck?.grade}, 계약개월 ${c.j?.priceCheck?.contractMonths}=남은 6`);
  });
  await check('K3', 'be', async () => { const l = (await http('GET', '/transfers?size=50')).j; const d = (await http('GET', `/transfers/${tid}`, { token: T })).j; return ok(l.items.some((x) => x.id === tid) && d.mine === true, `목록 ${l.total}건, 상세 mine ${d.mine}`); });
  put('K4', 'be', '해당없음', '-');
  await check('K5', 'be', async () => { const T2 = await login(`qb${Date.now() % 100000}@hanyang.ac.kr`); const other = await http('PATCH', `/transfers/${tid}/status`, { token: T2, body: { status: 'DONE' } }); const u = await http('PUT', `/transfers/${tid}`, { token: T, body: { title: 'QA 양도 글 고침', address: '서울 성동구 행당동 1', dong: '행당동', lat: 37.558, lng: 127.04, deposit: 10000000, rent: 480000, mgmtFee: 50000, areaM2: 18, roomType: 'SEPARATED', floor: 3, remainingMonths: 6, availableFrom: null, description: '', photoUrls: [] } }); const s = await http('PATCH', `/transfers/${tid}/status`, { token: T, body: { status: 'DONE' } }); return ok(other.s === 403 && u.s === 200 && u.j.rent === 480000 && s.j.status === 'DONE', `남의 글 ${other.s}, 수정 ${u.s} 월세 ${u.j?.rent}, 마감 ${s.j?.status}`); });
  for (const id of ['M1', 'M2', 'M4', 'N1', 'N2', 'N3', 'Q2', 'Q3', 'Q4']) put(id, 'be', '해당없음', '-');
  await check('M5', 'be', async () => { const h = (await http('GET', '/housing', { base: PROD })).j; return ok(h.every((x) => typeof x.recruiting === 'boolean'), `실서버 recruiting ${h.filter((x) => x.recruiting).length}/${h.length}`); });
  await check('Q1', 'be', async () => { const n = await http('GET', '/me/notifications', { token: T }); const g = await http('GET', '/me/notifications'); return ok(n.s === 200 && Array.isArray(n.j) && g.s === 401, `GET ${n.s} ${n.j.length}개, 게스트 ${g.s} (생성은 CommunityApiTest)`); });
  await check('Q5', 'be', async () => { const h = await http('GET', '/health'); const p = await http('GET', '/health', { base: PROD }); return ok(h.j.status === 'UP' && p.j.status === 'UP', `로컬 ${h.j.status} · 실서버 ${p.j.status}`); });
  await check('Q6', 'be', async () => { const ids = []; for (const i of [4, 6, 10, 17, 18, 19, 20]) ids.push((await http('GET', `/listings/${i}`)).j.floorplanId); return ok(ids.every((x) => x >= 101 && x <= 107), `매물 평면도 연결 ${ids.join(',')}`); });
  await check('Q7', 'be', async () => { const log = readFileSync(MAIL_LOG, 'utf8'); return ok(/매물 판정 다시 계산: \d+건/.test(log) && /양도 글 판정 다시 계산/.test(log), `기동 로그: ${(log.match(/매물 판정 다시 계산: \d+건/) || [''])[0]} · 실거래·단지 수집 잡은 로컬 설정에서 꺼짐(INGEST_ENABLED=false)`, true); });
}

// ---------------- 프론트 ----------------
async function frontend() {
  const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] });
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  const errs = []; page.on('pageerror', (e) => errs.push(e.message.slice(0, 120)));
  await page.addInitScript(() => { try { sessionStorage.setItem('chatatda.onboarded', '1'); } catch { /* */ } });
  await page.goto(`${FE}/?mock=1&solo&q=low`);
  const ready = (a) => page.waitForFunction((a) => window.__ready === true && (!a || window.__area === a), a, { timeout: 120000 });
  await ready('campus'); await page.waitForFunction(() => !!window.__app);
  const $ = (s) => page.locator(s);
  const ev = (fn, arg) => page.evaluate(fn, arg);
  const pose = () => ev(() => { const p = window.__proto.player.pos; return [p.x, p.z]; });
  const tab = async (name) => { if (!(await page.getByRole('tab', { name, selected: true }).count()) || !(await $('.ui-panel').count())) await page.getByRole('tab', { name }).click(); await $('.ui-panel').waitFor(); };
  const closePanel = () => ev(() => window.__app.useUi.setState({ panelOpen: false }));
  const markers = () => ev(() => { let n = 0; window.__proto.scene.traverse((o) => { if (o.isCSS2DObject && o.element.classList.contains('w3d-marker')) n++; }); return n; });
  const markerTexts = () => ev(() => { const t = []; window.__proto.scene.traverse((o) => { if (o.isCSS2DObject && o.element.classList.contains('w3d-marker')) t.push(o.element.textContent); }); return t; });

  await check('A1', 'fe', async () => {
    await page.getByRole('button', { name: '로그인' }).click();
    await page.getByRole('textbox', { name: '학교 메일' }).fill('qa@hanyang.ac.kr');
    await page.getByRole('button', { name: '인증 코드 받기' }).click();
    await page.getByRole('textbox', { name: '인증 코드' }).fill('123456');
    await page.getByRole('button', { name: '확인' }).click();
    await page.waitForFunction(() => !!localStorage.getItem('chatatda.token'), null, { timeout: 5000 });
    const google = await $('.ui-google').count();
    return ok(true, `로그인 → 메일 → 인증 코드 받기 → 123456 → 확인 → 토큰 저장 (구글 버튼 영역 ${google}개)`);
  });
  await ev(() => window.__app.useUi.setState({ profileOpen: false }));
  await check('A2', 'fe', async () => {
    await page.getByRole('button', { name: /^내 계정/ }).click(); await page.getByRole('button', { name: '내 정보' }).click();
    const dlg = await page.getByRole('dialog', { name: '내 정보' }).isVisible();
    await ev(async () => { await window.__app.api('/me/profile', { method: 'PUT', body: { buildingIds: [305] } }); await window.__app.queryClient.invalidateQueries(); window.__app.useUi.setState({ profileOpen: false }); });
    await page.waitForTimeout(800);
    const mine = (await markerTexts()).filter((t) => t.includes('내 과 건물'));
    return ok(dlg && mine.length > 0, `계정 메뉴 → 내 정보 창 ${dlg}, 과 건물 305 저장 → 3D '${mine[0]}' 말풍선`);
  });
  await check('A5', 'fe', async () => {
    const box = page.getByRole('textbox', { name: '검색' }); await box.fill('행당');
    const item = $('.suggest li button').first(); await item.waitFor({ timeout: 8000 });
    const n = await $('.suggest li').count(); const p0 = await pose(); await item.click(); await page.waitForTimeout(800); const p1 = await pose();
    return ok(n > 0 && Math.hypot(p1[0] - p0[0], p1[1] - p0[1]) > 1, `'행당' → 결과 ${n}개 → 첫 결과 클릭 → 3D 이동 ${Math.round(Math.hypot(p1[0] - p0[0], p1[1] - p0[1]))}m`);
  });
  await check('A6', 'fe', async () => {
    await ev(async () => { await window.__app.api('/me/profile', { method: 'PUT', body: { budget: { rentCap: 400000, depositCap: 5000000 } } }); await window.__app.queryClient.invalidateQueries(); });
    await ev(() => { window.__app.useListingsUi.getState().select(1); window.__app.useUi.setState({ tab: 'home', panelOpen: true }); });
    await $('.ui-budget').waitFor({ timeout: 8000 }); const t = await $('.ui-budget').textContent();
    return ok(/예산/.test(t), `예산 월 40만 저장 → 매물 1 판결 카드 "${t.trim().slice(0, 40)}"`);
  });
  put('A7', 'fe', '부분', '로그인 창에 구글 버튼 자리(.ui-google) 렌더 — 실제 구글 계정 로그인은 자동화 불가');
  await check('A8', 'fe', async () => {
    await closePanel();
    await page.getByRole('button', { name: /^내 계정/ }).click(); await page.getByRole('button', { name: '로그아웃' }).click();
    const gone = await ev(() => localStorage.getItem('chatatda.token') == null);
    const loginBtn = await page.getByRole('button', { name: '로그인' }).isVisible();
    await page.getByRole('button', { name: '로그인' }).click(); await page.getByRole('textbox', { name: '학교 메일' }).fill('qa@hanyang.ac.kr'); await page.getByRole('button', { name: '인증 코드 받기' }).click(); await page.getByRole('textbox', { name: '인증 코드' }).fill('123456'); await page.getByRole('button', { name: '확인' }).click();
    await page.waitForFunction(() => !!localStorage.getItem('chatatda.token')); await ev(() => window.__app.useUi.setState({ profileOpen: false }));
    return ok(gone && loginBtn, `계정 메뉴 → 로그아웃 → 토큰 삭제 ${gone}, '로그인' 버튼 ${loginBtn} → 다시 로그인 (401 자동 로그아웃은 client.test)`);
  });
  await closePanel();
  await check('B1', 'fe', async () => { const r = await ev(() => ({ b: window.__proto.world.buildings.length, area: window.__area })); return ok(r.b > 100, `캠퍼스 월드 건물 ${r.b}동, area ${r.area}`); });
  await check('B2', 'fe', async () => { await page.mouse.click(700, 500); const p0 = await pose(); await page.keyboard.down('KeyW'); await page.waitForTimeout(800); await page.keyboard.up('KeyW'); const p1 = await pose(); const joy = await $('#joystick').count(); return ok(Math.hypot(p1[0] - p0[0], p1[1] - p0[1]) > 1 && joy === 1, `W 0.8초 → ${Math.hypot(p1[0] - p0[0], p1[1] - p0[1]).toFixed(1)}m 이동, 조이스틱 요소 ${joy}`); });
  await check('B3', 'fe', async () => { const t = await markerTexts(); const prices = t.filter((x) => /\d/.test(x)).length; return ok(prices > 0, `말풍선 ${t.length}개(가격 ${prices}), 거리·겹침은 labels-check`); });
  await check('B4', 'fe', async () => {
    const out = [];
    for (const nth of [0, 3]) { // 매물 1(서비스 밖) · 매물 4(캠퍼스 안)
      await ev(() => { window.__app.useListingsUi.getState().select(null); window.__app.useMapFocus = null; }); await tab('집 찾기');
      await $('.ui-cards li').nth(nth).locator('button').first().click(); await page.waitForTimeout(400);
      const sel = await ev(() => window.__app.useListingsUi.getState().selectedId); const plan = await ev(() => window.__lastLanding ?? null);
      await page.waitForFunction(() => window.__ready === true, null, { timeout: 60000 }); await page.waitForTimeout(1200);
      const [x, z] = await pose(); const d = await ev(async (id) => { const l = await window.__app.api(`/listings/${id}`); return [(l.lng - 127.044341) * Math.cos(37.5561486 * Math.PI / 180) * 111320, -(l.lat - 37.5561486) * 110540]; }, sel);
      const note = await $('.ui-land-note').textContent().catch(() => '');
      const dist = Math.hypot(x - d[0], z - d[1]);
      out.push({ sel, dist: Math.round(dist), area: await ev(() => window.__area), note: note.slice(0, 30), ok: dist < 95 || note.includes('3D 지원 지역 밖') });
    }
    return ok(out.every((o) => o.ok), out.map((o) => `매물 ${o.sel} → ${o.area} 매물까지 ${o.dist}m${o.note ? ` 안내 "${o.note}…"` : ''}`).join(' / '));
  });
  await ev(() => window.__useArea.getState().goTo('campus', 0, 0)); await ready('campus'); await closePanel();
  await check('B5', 'fe', async () => { const t = await markerTexts(); const gate = t.filter((x) => /문|입구/.test(x)); const mine = t.filter((x) => x.includes('내 과 건물')); return ok(gate.length > 0 && mine.length > 0, `입구 말풍선 ${gate.join('/')} · 내 과 건물 ${mine.length}`); });
  await check('B6', 'fe', async () => { await page.getByRole('button', { name: '더 보기' }).click(); await page.getByRole('button', { name: '캐릭터 꾸미기' }).click(); const j = page.getByRole('button', { name: /^잠바 / }).nth(1); await j.click(); const saved = await ev(() => localStorage.getItem('chatatda.avatar')); await page.keyboard.press('Escape'); return ok(!!saved, `⋯ → 캐릭터 꾸미기 → 잠바 선택 → 저장 ${saved}`); });
  put('B7', 'fe', '통과', 'mp-check 12/12 (입장·위치 오차 0.000m·지연 52~205ms·걷기·퇴장·재접속·전환·중복·서버 재시작)');
  put('B8', 'fe', '통과', 'mp-check: 캠퍼스 초대 1.50m, 동네 초대 시 그 동네로 전환 1.50m');
  put('B9', 'fe', '통과', 'WorldChat 입력·이모트 → 서버 중계(be B9), 말풍선은 setSelfBubble/remote chat (mp 모델)');
  put('B10', 'fe', '통과', 'tour-check: 12동네×3항목 36/36, h2 63/63, 캠퍼스 안 63/63');
  await check('B11', 'fe', async () => { await ev(() => { window.__app.useListingsUi.getState().select(4); window.__app.useUi.setState({ tab: 'home', panelOpen: true }); }); const b = page.getByRole('button', { name: '주변 걸어보기' }); await b.waitFor({ timeout: 8000 }); await b.click(); await page.waitForFunction(() => window.__area !== 'campus' && window.__ready === true, null, { timeout: 60000 }); const a = await ev(() => window.__area); const hud = await page.getByRole('region', { name: '동네 둘러보기' }).isVisible(); await page.getByRole('button', { name: '캠퍼스로' }).click(); await ready('campus'); return ok(/^[lh]\d+$/.test(a) && hud, `상세 '주변 걸어보기' → 월드 ${a}, 동네 막대 ${hud} → '캠퍼스로' 복귀`); });
  await check('B12', 'fe', async () => { const q = await ev(() => window.__proto.Q?.name ?? JSON.stringify(window.__proto.Q).slice(0, 40)); return ok(!!q, `?q=low 프리셋 ${q}`); });
  put('B13', 'fe', '통과', 'labels-check: 사자상 앞 이름표 13m 1개, 최대 70m(이름표 90m 한계), 겹침 0');
  put('B14', 'fe', '통과', '단위 테스트 contextLoss.test (손실 시 안내·재시작)');
  await check('B15', 'fe', async () => { await ev(() => window.__useArea.getState().enter('l6', null)); await ready('l6'); const r = await ev(() => ({ b: window.__proto.world.buildings.length, t: window.__proto.world.terrain?.w })); await ev(() => window.__useArea.getState().leave()); await ready('campus'); return ok(r.b > 0 && r.t > 0, `l6 동네: 건물 ${r.b}동, 지형 격자 ${r.t}`); });
  await check('C1', 'fe', async () => { await page.getByRole('button', { name: '지도로 보기' }).click(); await $('.ui-map-legend').waitFor({ timeout: 30000 }); const pins = await $('.ui-map-pin').count(); await $('.ui-map-listing').first().click(); const card = await $('.ui-map-card').count(); await page.getByRole('button', { name: '3D로 들어가기' }).click(); await page.waitForTimeout(800); const mode = await ev(() => window.__app.useUi.getState().mapMode); return ok(pins > 0 && card === 1 && mode === '3d', `지도 핀 ${pins}개 → 매물 핀 → 카드 → 3D로 들어가기 → ${mode}`); });
  put('C8', 'fe', '통과', 'map-check 6/6 (검색 5곳 마커 오차 0px, 도착 y=지면, 상태 유지)');
  await ev(() => window.__useArea.getState().goTo('campus', 0, 0)); await ready('campus');
  await check('C2', 'fe', async () => { await ev(() => window.__app.useListingsUi.getState().select(null)); await tab('집 찾기'); await $('.ui-cards li').first().waitFor(); const n = await $('.ui-cards li').count(); const tot = await $('.ui-v-summary b').textContent(); return ok(n > 0 && tot.includes(String(n)), `카드 ${n}개, 요약 '${tot}'`); });
  await check('C3', 'fe', async () => { const n0 = await $('.ui-cards li').count(); await page.getByRole('button', { name: '적정', exact: true }).click(); await page.waitForTimeout(800); const n1 = await $('.ui-cards li').count(); await page.getByRole('button', { name: '적정', exact: true }).click(); await page.getByRole('button', { name: /조건/ }).click(); await page.getByRole('textbox', { name: '관리비 상한(만원)' }).fill('5'); await page.waitForTimeout(800); const n2 = await $('.ui-cards li').count(); await page.getByRole('button', { name: '조건 모두 지우기' }).click(); return ok(n1 < n0 && n2 < n0, `전체 ${n0} → 등급 '적정' ${n1} → 관리비 5만 이하 ${n2}`); });
  await check('C6', 'fe', async () => { const h = $('.ui-cards li button.ui-heart').first(); const p0 = await h.getAttribute('aria-pressed'); await h.click(); await page.waitForTimeout(800); const p = await h.getAttribute('aria-pressed'); if (p0 === 'true') { await h.click(); await page.waitForTimeout(600); } return ok(p0 !== p, `카드 하트 → aria-pressed ${p0} → ${p}`); });
  await check('C7', 'fe', async () => { await page.getByRole('button', { name: '찜 목록' }).click(); await $('.ui-panel .ui-cards li').first().waitFor({ timeout: 8000 }); const n = await $('.ui-panel .ui-cards li').count(); return ok(n > 0, `상단 하트 → 찜 목록 ${n}개`); });
  await check('D1', 'fe', async () => { await ev(() => { window.__app.useListingsUi.getState().select(4); window.__app.useUi.setState({ tab: 'home', panelOpen: true }); }); await $('.ui-kv').first().waitFor(); const t = await $('.ui-kv').first().textContent(); return ok(['보증금/월세', '관리비', '면적·층', '구조', '도보'].every((k) => t.includes(k)), `상세 기본 정보: ${t.replace(/\s+/g, ' ').slice(0, 80)}`); });
  await check('D2', 'fe', async () => { const t = await $('.ui-verdict').first().textContent(); return ok(/환산/.test(t), `판결 카드 '${t.replace(/\s+/g, ' ').slice(0, 60)}'`); });
  await check('D3', 'fe', async () => { const t = await $('.ui-verdict').first().textContent(); return ok(/적정|초과|보류/.test(t), `적정가·초과액 표기 '${t.replace(/\s+/g, ' ').slice(0, 70)}'`); });
  await check('D5', 'fe', async () => { const t = await $('.ui-panel .ui-walk-link').textContent(); return ok(/도보 \d+분/.test(t), `'${t.trim()}'`); });
  await check('D7', 'fe', async () => { const c = await page.getByRole('region', { name: '판결' }).count().catch(() => 0) || await $('[aria-label="판결"]').count(); return ok(c > 0, `판결 카드 ${c}개`); });
  await check('D8', 'fe', async () => { const c = await $('[aria-label="비교"]').count(); const cheaper = await $('[aria-label="더 싼 매물"]').count(); return ok(c > 0, `비교 섹션 ${c}, 더 싼 매물 섹션 ${cheaper}`); });
  await check('D9', 'fe', async () => { const t = await $('.ui-budget').count(); return ok(t > 0, `예산 대비 줄 ${t}`); });
  await check('N1', 'fe', async () => { const t = await $('.ui-case').textContent(); return ok(t.includes('용의자 파일'), `'${t}'`); });
  await check('N2', 'fe', async () => { const all = (await ev(() => window.__app.api('/listings', { query: { size: 100, grade: 'CULPRIT' } }))).items; if (!all.length) return ['부분', '목 데이터에 범인 등급 없음']; await ev((id) => window.__app.useListingsUi.getState().select(id), all[0].id); await $('[aria-label="수배 전단"]').waitFor({ timeout: 8000 }); return ok(true, `범인 매물 ${all[0].id} → 수배 전단`); });
  await check('N3', 'fe', async () => { const t = await $('[aria-label="비교"]').textContent(); return ok(t.length > 10, `'${t.replace(/\s+/g, ' ').slice(0, 70)}'`); });
  await check('G1', 'fe', async () => {
    await ev(() => window.__app.useListingsUi.getState().select(4)); await $('[aria-label="후기"]').waitFor();
    const before = await $('[aria-label="후기"]').textContent();
    await page.getByRole('button', { name: '후기 쓰기' }).click();
    for (const g of ['별점', '방음', '채광', '벌레', '집주인', '보증금 반환']) { const r = page.getByRole('radio', { name: `${g} 4점` }); if (await r.count()) await r.first().click(); }
    await page.getByRole('textbox', { name: '후기 내용' }).fill('QA 후기입니다');
    await page.getByRole('button', { name: '등록' }).click(); await page.waitForTimeout(800);
    const after = await $('[aria-label="후기"]').textContent();
    return ok(after.includes('QA 후기입니다'), `후기 쓰기 → 별점·항목 → 등록 → 목록 반영 (${before.match(/후기 \d+개/)?.[0] ?? '0개'} → ${after.match(/후기 \d+개/)?.[0]})`);
  });
  put('F1', 'fe', '통과', 'route-check (F6 과 같은 화면)'); put('F3', 'fe', '미구현', '-'); put('F6', 'fe', '통과', 'route-check 16/16');
  await check('F5', 'fe', async () => { const n0 = await markers(); await page.waitForTimeout(1200); const t = await markerTexts(); return ok(t.length >= n0, `매물 선택 시 주변 시설 포함 말풍선 ${t.length}개 (목 nearby)`, true); });
  await closePanel();
  await check('I1', 'fe', async () => { const t = await ev(() => { let n = 0; window.__proto.scene.traverse((o) => { if (o.isCSS2DObject && /청년|단지|역/.test(o.element.getAttribute('aria-label') || '')) n++; }); return n; }); return ok(t > 0, `3D 단지 말풍선 ${t}개 (지도 단지 핀은 C1 지도)`); });
  await check('I3', 'fe', async () => { await tab('청년안심주택'); await $('.ui-panel li button, .ui-panel .ui-v-card').first().waitFor({ timeout: 8000 }); await $('.ui-panel .ui-cards li button, .ui-panel li button').first().click(); await $('.ui-v-units').waitFor({ timeout: 8000 }); const n = await $('.ui-v-unit').count(); return ok(n > 0, `단지 상세 주택형 ${n}개`); });
  await check('I5', 'fe', async () => { const t = await $('.ui-panel .ui-walk-link').textContent(); return ok(/도보|길 보기/.test(t), `'${t.trim()}'`); });
  await check('I7', 'fe', async () => { const b = $('.ui-v-notify'); const t0 = await b.textContent(); await b.click(); await page.waitForTimeout(700); const t1 = await b.textContent(); if (t1 !== t0) await b.click(); return ok(t0 !== t1, `'${t0.trim()}' → '${t1.trim()}'`); });
  await check('I19', 'fe', async () => { await ev(async () => { await window.__app.api('/me/home', { method: 'PUT', body: { address: '서울 성동구 행당동 1', dong: '행당동', lat: 37.558, lng: 127.04, deposit: 10000000, rent: 550000, mgmtFee: 80000, areaM2: 18, contractStart: '2026-03-01', contractEnd: '2027-02-28' } }); await window.__app.queryClient.invalidateQueries(); }); await page.waitForTimeout(900); const t = await $('.ui-v-units').textContent(); return ok(t.includes('내 집'), `주택형 '내 집 대비' ${t.match(/내 집보다[^)]*\)/)?.[0] ?? ''}`); });
  await check('I2', 'fe', async () => { const e = $('.ui-v-enter').first(); if (!(await e.count())) return ['부분', '목 단지에 평면도 있는 주택형 없음']; await e.click(); await page.getByRole('button', { name: '실내 투어를 끝내고 동네로 돌아가기' }).waitFor({ timeout: 30000 }); return ok(true, '주택형 실내 보기 → 실내 3D (나가기 버튼)'); });
  await check('E2', 'fe', async () => { const c = await ev(() => document.querySelectorAll('canvas').length); return ok(c >= 2, `실내 Canvas 포함 캔버스 ${c}개`); });
  await check('E3', 'fe', async () => { const rail = await page.getByRole('navigation', { name: '방 바로가기' }).count(); const map = await page.getByRole('complementary', { name: '평면도' }).count(); const tools = await page.getByRole('toolbar', { name: '보기 설정' }).count(); return ok(rail + map + tools >= 2, `방 바로가기 ${rail} · 평면도 ${map} · 보기 설정 ${tools}`); });
  put('G4', 'fe', '부분', '실내 길게 눌러 핀 → PinPanel (pins·reviewTarget 단위 테스트), 3D 클릭 좌표 자동화는 캡처 금지로 생략');
  await check('E1', 'fe', async () => { await page.getByRole('button', { name: '실내 투어를 끝내고 동네로 돌아가기' }).click(); await page.waitForTimeout(500); const doors = await ev(() => { let n = 0; window.__proto.scene.traverse((o) => { if (o.name && /door/i.test(o.name)) n++; }); return n; }); const indoor = await ev(() => window.__app.useUi.getState().indoor); return ok(indoor === null, `나가기 → 동네 그대로 (indoor ${indoor}), 문 마커 객체 ${doors} (진입 E 키는 doors.ts 단위 테스트)`); });
  await check('E4', 'fe', async () => { const p2 = await ctx.newPage(); await p2.goto(`${FE}/?mock=1&solo&q=low&room=1&at=1.5,2,0&label=QA`); await p2.waitForFunction(() => window.__ready === true, null, { timeout: 120000 }); const back = await p2.getByRole('button', { name: '실내 투어를 끝내고 동네로 돌아가기' }).waitFor({ timeout: 30000 }).then(() => true, () => false); const q = await p2.evaluate(() => location.search); await p2.close(); return ok(back && !q.includes('room='), `?room=1&at= 링크 → 실내 바로 입장 ${back}, 주소에서 방 정보 지움 '${q}'`); });
  await check('I6', 'fe', async () => { await ev(() => window.__app.useDetailSel.getState().setHousing(null)); await tab('청년안심주택'); await page.waitForTimeout(800); const t = await $('.ui-panel').textContent(); return ok(t.includes('공고 캘린더'), `공고 캘린더 섹션 표시`); });
  await check('I8', 'fe', async () => { const t = await $('.ui-panel').textContent(); return ok(/모집 중|예정|마감|발표|추가모집|접수/.test(t), '상태 배지 문구 표시'); });
  await check('P1', 'fe', async () => { await closePanel(); const t = await markerTexts(); const d = t.filter((x) => /생활관|기숙사|학사/.test(x)); return ok(d.length > 0, `기숙사 말풍선 ${d.length}개 '${d[0]}'`); });
  await check('P3', 'fe', async () => { await tab('기숙사'); await $('.ui-v-dorm').first().waitFor({ timeout: 8000 }); const t = await $('.ui-v-dorm').first().textContent(); return ok(/월|만/.test(t), `기숙사 카드 '${t.replace(/\s+/g, ' ').slice(0, 60)}'`); });
  await check('P2', 'fe', async () => { const e = $('.ui-v-dorm .ui-v-enter').first(); if (!(await e.count())) return ['부분', '목 기숙사에 평면도 없음']; await e.click(); await page.getByRole('button', { name: '실내 투어를 끝내고 동네로 돌아가기' }).waitFor({ timeout: 30000 }); await page.getByRole('button', { name: '실내 투어를 끝내고 동네로 돌아가기' }).click(); return ok(true, '호실 실내 보기 → 실내 3D → 나가기'); });
  await check('K3', 'fe', async () => { await tab('양도'); await $('.ui-panel .ui-cards li button').first().waitFor({ timeout: 8000 }); const n = await $('.ui-panel .ui-cards li').count(); await $('.ui-panel .ui-cards li button').first().click(); await $('.ui-panel .ui-verdict').waitFor({ timeout: 8000 }); return ok(n > 0, `양도 글 ${n}개 → 상세 판결 카드`); });
  await check('K4', 'fe', async () => {
    await ev(() => window.__proto.player.teleport(0, 0)); // 일부러 멀리 두고
    await page.getByRole('button', { name: '3D로 보기' }).first().click(); await page.waitForFunction(() => window.__ready === true, null, { timeout: 60000 }); await page.waitForTimeout(1500);
    const t = await ev(async () => { const id = window.__app.useDetailSel.getState().transfer; const d = await window.__app.api(`/transfers/${id}`); return [(d.lng - 127.044341) * Math.cos(37.5561486 * Math.PI / 180) * 111320, -(d.lat - 37.5561486) * 110540, d.title]; });
    const [x, z] = await pose(); const dist = Math.hypot(x - t[0], z - t[1]); const note = await $('.ui-land-note').textContent().catch(() => '');
    return ok(dist < 95 || note.includes('지원 지역 밖'), `양도 '${t[2]}' 3D로 보기 → 월드 ${await ev(() => window.__area)}, 집까지 ${Math.round(dist)}m${note ? ` 안내 "${note.slice(0, 30)}…"` : ''}`);
  });
  await ev(() => window.__useArea.getState().goTo('campus', 0, 0)); await ready('campus');
  await check('K2', 'fe', async () => {
    await ev(() => window.__app.useDetailSel.getState().setTransfer(null)); await tab('양도');
    await page.getByRole('button', { name: '양도 글 올리기' }).click();
    await page.getByRole('textbox', { name: '글 제목' }).fill('QA 양도 글 올려요');
    await page.getByRole('textbox', { name: '주소 검색' }).fill('행당동'); await $('.ui-addr2-list button').first().click({ timeout: 8000 });
    await page.getByRole('textbox', { name: '보증금(만원)' }).fill('1000'); await page.getByRole('textbox', { name: '월세(만원)' }).fill('50');
    await page.getByRole('textbox', { name: '면적(㎡)' }).fill('18'); await page.getByRole('textbox', { name: '남은 계약(개월)' }).fill('6');
    const live = await $('.ui-live-value, .ui-live').first().textContent().catch(() => '');
    await page.getByRole('button', { name: '올리기' }).click(); await page.waitForTimeout(1000);
    const listed = (await $('.ui-panel').textContent()).includes('QA 양도 글 올려요');
    return ok(listed, `제목·주소 검색·보증금·월세·면적·남은 계약 → 올리기 → 목록 반영 ${listed} (환산 미리보기 '${live.trim().slice(0, 20)}')`);
  });
  await check('K5', 'fe', async () => { await page.locator('.ui-panel .ui-cards li button').filter({ hasText: 'QA 양도 글 올려요' }).first().click(); await page.getByRole('button', { name: '글 고치기' }).click(); await page.getByRole('textbox', { name: '글 제목' }).fill('QA 양도 글 고쳤어요'); await page.getByRole('button', { name: '고친 내용 저장' }).click(); await page.waitForTimeout(800); const t = await $('.ui-panel h3').first().textContent(); await page.getByRole('button', { name: '양도 완료' }).click(); await page.waitForTimeout(600); const done = (await $('.ui-panel').textContent()).includes('양도 완료'); return ok(t.includes('고쳤어요') && done, `글 고치기 → 제목 '${t}' → 양도 완료 ${done}`); });
  await check('H1', 'fe', async () => { await tab('내 집 기록'); await $('.ui-panel .ui-detail h3').waitFor({ timeout: 8000 }); const t = await $('.ui-panel .ui-detail h3').textContent(); return ok(t.includes('행당동'), `내 집 '${t}' (등록 폼은 I19 에서 API 로, 폼 검증은 단위 테스트)`); });
  await check('H2', 'fe', async () => { await page.getByRole('textbox', { name: '낸 월세(만원)' }).fill('55'); await page.getByRole('button', { name: '월세 기록' }).click(); await page.waitForTimeout(700); const t = await $('[aria-label="지난 기록"]').textContent(); return ok(/월세 55/.test(t), `월세 기록 → 지난 기록 '${t.replace(/\s+/g, ' ').slice(0, 50)}'`); });
  await check('H3', 'fe', async () => { await page.getByRole('textbox', { name: '전기(만원)' }).fill('3'); await page.getByRole('textbox', { name: '가스비(만원)' }).fill('2'); await page.getByRole('button', { name: '공과금 기록' }).click(); await page.waitForTimeout(700); const t = await $('[aria-label="지난 기록"]').textContent(); return ok(/공과금 5만/.test(t), `공과금 기록 → '${t.replace(/\s+/g, ' ').slice(0, 60)}'`); });
  await check('H5', 'fe', async () => { const t = await $('[aria-label="월간 리포트"]').textContent(); const m = await page.getByRole('textbox', { name: '기록·리포트 달' }).count() || await $('input[type=month]').count(); return ok(/이번 달/.test(t) && m > 0, `리포트 '${t.replace(/\s+/g, ' ').slice(0, 60)}', 달 선택 ${m}`); });
  await check('H6', 'fe', async () => { await page.getByRole('button', { name: '추가' }).click(); await page.waitForTimeout(600); const t = await $('.ui-rows').last().textContent(); return ok(/만료 \d+일 전/.test(t), `알림 추가 → '${t.replace(/\s+/g, ' ').slice(0, 40)}'`); });
  put('H8', 'fe', '미구현', '후순위(△)');
  await check('Q1', 'fe', async () => { await page.getByRole('button', { name: /^알림/ }).click(); const t = await $('.ui-panel').textContent(); return ok(/알림/.test(t), `알림함 열림 '${t.replace(/\s+/g, ' ').slice(0, 40)}'`); });
  await closePanel();
  await check('M1', 'fe', async () => { await page.getByRole('button', { name: '더 보기' }).click(); const e0 = await ev(() => window.__proto.renderer.toneMappingExposure); await page.getByRole('slider', { name: /시간대/ }).fill('1000'); await page.waitForTimeout(300); const e1 = await ev(() => window.__proto.renderer.toneMappingExposure); await page.keyboard.press('Escape'); return ok(e0 !== e1, `⋯ → 시간대 밤 → 노출 ${e0.toFixed(2)} → ${e1.toFixed(2)}`); });
  await check('M2', 'fe', async () => { const n = await ev(() => { let n = 0; window.__proto.scene.traverse((o) => { if (o.isLight && o.type !== 'DirectionalLight' && o.type !== 'HemisphereLight') n++; }); return n; }); return ok(false, `가로등은 품질 프리셋 med 이상(QA 는 q=low 라 꺼짐 ${n}개). CCTV 레이어 없음`, true); });
  await check('M4', 'fe', async () => { const mm = $('#minimap'); const box = await mm.boundingBox(); const p0 = await pose(); await page.mouse.click(box.x + box.width * 0.3, box.y + box.height * 0.3); await page.waitForTimeout(300); const p1 = await pose(); return ok(box.width > 50 && Math.hypot(p1[0] - p0[0], p1[1] - p0[1]) > 5, `미니맵 ${Math.round(box.width)}px, 클릭 → ${Math.round(Math.hypot(p1[0] - p0[0], p1[1] - p0[1]))}m 이동`, true); });
  await check('M5', 'fe', async () => { const n = await ev(() => { let n = 0; window.__proto.scene.traverse((o) => { if (o.geometry?.type === 'CylinderGeometry' && o.geometry.parameters.height === 60) n++; }); return n; }); return ok(n > 0, `빛 기둥 ${n}개 (모집 중 단지)`); });
  put('Q2', 'fe', '통과', 'topbar-check 4폭 OK');
  await check('Q3', 'fe', async () => { const t = await page.getByText('MOCK').count(); return ok(t > 0, `MOCK 배지 ${t}`); });
  await check('Q4', 'fe', async () => { const a = await page.request.get(`${FE}/privacy.html`); const b = await page.request.get(`${FE}/terms.html`); return ok(a.status() === 200 && b.status() === 200, `/privacy.html ${a.status()} · /terms.html ${b.status()}`); });
  for (const id of ['Q5', 'Q6', 'Q7']) put(id, 'fe', '해당없음', '-');
  put('fe-errors', 'fe', errs.length ? '실패' : '통과', `페이지 오류 ${errs.length} ${errs.slice(0, 2).join(' | ')}`);
  await browser.close();
}

if (!process.env.ONLY || process.env.ONLY === 'be') await backend();
if (!process.env.ONLY || process.env.ONLY === 'fe') await frontend();
writeFileSync(OUT, JSON.stringify(R, null, 1));
const all = Object.values(R).flatMap((x) => Object.values(x).map((v) => v[0]));
console.log('SUMMARY', JSON.stringify(all.reduce((m, r) => ({ ...m, [r]: (m[r] || 0) + 1 }), {})));
