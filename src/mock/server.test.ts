import { beforeEach, expect, test } from 'vitest';
import { mockFetch, resetMockDb, setMockLatency } from './server';
import { LISTINGS } from './fixtures/listings';
import { HOUSING } from './fixtures/housing';
import { FLOORPLANS } from './fixtures/floorplans';
import { toLocal } from '../app/map/geo';

const AUTH = { Authorization: 'Bearer mock-token-1' };
async function call<T = any>(method: string, path: string, body?: unknown, auth = true): Promise<{ status: number; data: T }> {
  const res = await mockFetch(`http://localhost:8080/api/v1${path}`, { method, headers: auth ? AUTH : {}, body: body === undefined ? undefined : JSON.stringify(body) });
  const text = await res.text();
  return { status: res.status, data: (text ? JSON.parse(text) : null) as T };
}
beforeEach(() => { setMockLatency(0); resetMockDb(); });

test('픽스처 수량: 매물 20건·등급 5종·PENDING 포함, 좌표는 캠퍼스 ±1km', () => {
  const { data } = { data: LISTINGS };
  expect(data).toHaveLength(20);
  expect(new Set(data.map((l) => l.grade))).toEqual(new Set(['FAIR', 'SLIGHTLY_HIGH', 'HIGH', 'CULPRIT', 'PENDING']));
  for (const l of data) { const [x, z] = toLocal(l.lat, l.lng); expect(Math.hypot(x, z)).toBeLessThan(1000); }
  expect(HOUSING.map((h) => h.name)).toEqual(['왕십리역 청아진', '라봄성동']);
  expect(FLOORPLANS.map((f) => f.id)).toEqual([1, 2, 3]);
});

test('게스트: 목록·상세·판정·평면도', async () => {
  const list = await call('GET', '/listings?size=100', undefined, false);
  expect(list.data.total).toBe(20);
  expect(list.data.items[0].favorited).toBe(false);
  const pending = await call('GET', '/listings?grade=PENDING', undefined, false);
  expect(pending.data.items.length).toBeGreaterThanOrEqual(1);
  const pc = await call('GET', '/listings/1/price-check', undefined, false);
  expect(pc.data.grade).toBe('HIGH');
  expect(pc.data.budget).toBeNull();
  const fp = await call('GET', '/floorplans/1', undefined, false);
  expect(fp.data.walls.length).toBeGreaterThan(3);
  expect((await call('GET', '/listings/999', undefined, false)).status).toBe(404);
});

test('로그인 필요한 경로는 게스트에게 401', async () => {
  expect((await call('GET', '/me/favorites', undefined, false)).status).toBe(401);
  expect((await call('POST', '/reviews', {}, false)).status).toBe(401);
});

test('인증: 한양대 메일만, 아무 6자리 코드, 구글', async () => {
  expect((await call('POST', '/auth/email/send', { email: 'a@gmail.com' }, false)).data.code).toBe('INVALID_EMAIL_DOMAIN');
  expect((await call('POST', '/auth/email/send', { email: 'a@hanyang.ac.kr' }, false)).status).toBe(204);
  expect((await call('POST', '/auth/email/verify', { email: 'a@hanyang.ac.kr', code: '12' }, false)).data.code).toBe('CODE_MISMATCH');
  const ok = await call('POST', '/auth/email/verify', { email: 'a@hanyang.ac.kr', code: '123456' }, false);
  expect(ok.data.accessToken).toBeTruthy();
  expect(ok.data.user.nickname).toMatch(/^한양\d{4}$/);
  expect((await call('POST', '/auth/google', { idToken: 'x' }, false)).data.expiresIn).toBe(604800);
});

test('프로필: 학과만 보내면 기본 건물, 예산 반영이 판정에 들어간다', async () => {
  const dep = (await call('GET', '/departments')).data[0];
  const p = await call('PUT', '/me/profile', { departmentId: dep.id, budget: { rentCap: 600000, depositCap: 10000000 } });
  expect(p.data.buildingIds).toEqual(dep.defaultBuildingIds);
  const l = await call('GET', '/listings/1');
  expect(l.data.walkMin).toBeGreaterThan(0);
  const pc = await call('GET', '/listings/1/price-check');
  expect(pc.data.budget.rentCap).toBe(600000);
  expect((await call('PUT', '/me/profile', { departmentId: 99999 })).status).toBe(400);
});

test('찜: 추가·중복 409·삭제·목록 반영', async () => {
  const before = (await call('GET', '/me/favorites')).data.length;
  const add = await call('POST', '/me/favorites', { type: 'LISTING', targetId: 7 });
  expect(add.status).toBe(201);
  expect((await call('POST', '/me/favorites', { type: 'LISTING', targetId: 7 })).status).toBe(409);
  expect((await call('GET', '/listings/7')).data.favorited).toBe(true);
  expect((await call('GET', '/me/favorites')).data).toHaveLength(before + 1);
  expect((await call('DELETE', '/me/favorites/LISTING/7')).status).toBe(204);
  expect((await call('GET', '/listings/7')).data.favorited).toBe(false);
  expect((await call('DELETE', '/me/favorites/LISTING/7')).status).toBe(204);
});

test('후기: 매물 5곳 각 2건, 작성하면 평균·건수 갱신, 잘못된 점수는 400', async () => {
  for (let i = 1; i <= 5; i++) expect((await call('GET', `/reviews?targetType=LISTING&targetId=${i}`)).data.count).toBe(2);
  const scores = { noise: 5, light: 5, bugs: 5, landlord: 5, depositReturn: 5 };
  const r = await call('POST', '/reviews', { targetType: 'LISTING', targetId: 1, rating: 5, scores, text: '좋아요', pin: null });
  expect(r.status).toBe(201);
  expect((await call('GET', '/reviews?targetType=LISTING&targetId=1')).data.count).toBe(3);
  expect((await call('POST', '/reviews', { targetType: 'LISTING', targetId: 1, rating: 9, scores, text: '' })).status).toBe(400);
});

test('양도: 3건, 작성 → 내 글(mine)·판정, 완료 처리하면 목록에서 빠진다', async () => {
  expect((await call('GET', '/transfers', undefined, false)).data.total).toBe(3);
  const body = { title: '행당동 오픈형 10개월 양도', address: '서울 성동구 행당동 1', dong: '행당동', lat: 37.557, lng: 127.04, deposit: 5000000, rent: 600000, mgmtFee: 50000, areaM2: 18, roomType: 'OPEN', floor: 2, remainingMonths: 10, availableFrom: null, description: 'x', photoUrls: [] };
  expect((await call('POST', '/transfers', { ...body, title: '' })).status).toBe(400); // 제목이 없으면 못 올린다
  expect((await call('POST', '/transfers', { ...body, title: '가' })).status).toBe(400); // 너무 짧음
  expect((await call('POST', '/transfers', { ...body, title: '가'.repeat(41) })).status).toBe(400); // 너무 김
  const created = await call('POST', '/transfers', { ...body, title: '  행당동 오픈형 10개월 양도  ' });
  expect(created.status).toBe(201);
  expect(created.data.title).toBe('행당동 오픈형 10개월 양도'); // 앞뒤 공백은 지우고 적은 제목 그대로
  expect((await call('GET', '/transfers')).data.items.map((t: { title: string }) => t.title)).toContain('행당동 오픈형 10개월 양도');
  expect(created.data.mine).toBe(true);
  expect(created.data.priceCheck.contractMonths).toBe(10);
  expect((await call('GET', '/transfers')).data.total).toBe(4);
  expect((await call('PATCH', `/transfers/${created.data.id}/status`, { status: 'DONE' })).data.status).toBe('DONE');
  expect((await call('GET', '/transfers')).data.total).toBe(3);
  expect((await call('PUT', '/transfers/1', body)).status).toBe(403);
});

test('청년안심주택: 단지·상세·공고·구독', async () => {
  const list = (await call('GET', '/housing')).data;
  expect(list.map((h: any) => h.name)).toEqual(['왕십리역 청아진', '라봄성동']);
  expect(list[0].recruiting).toBe(true);
  expect(list[0].nextEvent).not.toBeNull();
  const detail = (await call('GET', '/housing/1')).data;
  expect(detail.unitTypes.map((u: any) => u.floorplanId)).toContain(1);
  expect((await call('GET', '/housing/announcements?status=OPEN')).data.length).toBeGreaterThanOrEqual(1);
  expect((await call('POST', '/housing/2/subscribe')).status).toBe(204);
  expect((await call('GET', '/housing')).data[1].subscribed).toBe(true);
  expect((await call('DELETE', '/housing/2/subscribe')).status).toBe(204);
  expect((await call('GET', '/housing')).data[1].subscribed).toBe(false);
});

test('대안: 환산 월세 낮은 순, monthlyDiff 부호', async () => {
  const alt = (await call('GET', '/listings/1/alternatives')).data;
  expect(alt.housing.length).toBeGreaterThan(0);
  expect(alt.dorms[0].type).toBe('DORM');
  const rents = alt.housing.map((a: any) => a.convertedRent);
  expect(rents).toEqual([...rents].sort((a: number, b: number) => a - b));
  const l = (await call('GET', '/listings/1')).data;
  expect(alt.housing[0].monthlyDiff).toBe(l.convertedRent - alt.housing[0].convertedRent);
});

test('알림 읽음, 내 집·리포트·알림 설정', async () => {
  const ns = (await call('GET', '/me/notifications')).data;
  const unread = ns.filter((n: any) => !n.read).length;
  expect(unread).toBeGreaterThan(0);
  expect((await call('PATCH', `/me/notifications/${ns.find((n: any) => !n.read).id}/read`)).status).toBe(204);
  expect((await call('GET', '/me/notifications')).data.filter((n: any) => !n.read)).toHaveLength(unread - 1);

  expect((await call('GET', '/me/home')).data.rent).toBeGreaterThan(0);
  const month = (await call('GET', '/me/payments')).data[0].month;
  const rep = (await call('GET', `/me/report?month=${month}`)).data;
  expect(rep.total).toBeGreaterThan(rep.breakdown.rent);
  const a = await call('POST', '/me/home/alerts', { daysBefore: 30, enabled: true });
  expect(a.status).toBe(201);
  expect((await call('PATCH', `/me/home/alerts/${a.data.id}`, { enabled: false })).data.enabled).toBe(false);
  expect((await call('DELETE', `/me/home/alerts/${a.data.id}`)).status).toBe(204);
  await call('POST', '/me/payments', { month, amount: 1, paidAt: `${month}-01` });
  expect((await call('GET', '/me/payments')).data.filter((p: any) => p.month === month)).toHaveLength(1);
});

test('검색·주소·기숙사·건물·초대·알 수 없는 경로', async () => {
  const s = (await call('GET', '/search?q=행당', undefined, false)).data;
  expect(s.some((r: any) => r.type === 'LISTING')).toBe(true);
  expect((await call('GET', '/search?q=a', undefined, false)).status).toBe(400);
  expect((await call('GET', '/geo/address?q=사근', undefined, false)).data.length).toBeGreaterThan(0);
  expect((await call('GET', '/dorms', undefined, false)).data.length).toBeGreaterThanOrEqual(1);
  const b = (await call('GET', '/buildings', undefined, false)).data;
  expect(b.filter((x: any) => x.type === 'GATE').length).toBeGreaterThanOrEqual(2);
  expect((await call('GET', '/buildings?type=DORM', undefined, false)).data.every((x: any) => x.type === 'DORM')).toBe(true);
  expect((await call('POST', '/invites', { playerId: 'p_1' }, false)).data.token).toMatch(/^inv_/);
  expect((await call('GET', '/nope', undefined, false)).status).toBe(404);
  expect((await call('DELETE', '/listings/1', undefined, false)).status).toBe(405);
});
