// 개발용 목 서버: fetch 한 번을 메모리 DB 로 응답한다. 계약 문서(api-contract.md) 5장 전체.
// VITE_USE_MOCK=true 또는 ?mock=1 일 때만 client.ts 가 동적 import 로 불러온다.
import type {
  Alternative, Announcement, AppNotification, CampusBuilding, FavoriteItem, FavoriteType, Grade, HomeAlert, ListingDetail, ListingSummary, MyHome, Nearby,
  Payment, Profile, Report, Review, ReviewScores, SearchResult, TransferBody, TransferDetail, TransferSummary, Utility,
} from '../api/types';
import { buildPriceCheck, convertedRent, gradeOf } from './pricing';
import { distanceM, monthOffset, monthsBetween, nowIso, placeholderImage, walkRoute, ym, dayOffset } from './util';
import { DEPARTMENTS, makeBuildings } from './fixtures/buildings';
import { ADDRESSES, TRANSFERS, makeAlerts, makeHome, makeNotifications, makePayments, makeReviews, makeUtilities, type StoredReview, type StoredTransfer } from './fixtures/community';
import { DORMS } from './fixtures/dorms';
import { FLOORPLANS } from './fixtures/floorplans';
import { HOUSING, makeAnnouncements, unitWithConverted } from './fixtures/housing';
import { LISTINGS } from './fixtures/listings';
import { marketFor } from './fixtures/market';

export class HttpError extends Error {
  constructor(public status: number, public code: string, message: string, public details: unknown = null) { super(message); }
}
const bad = (details: Record<string, string>) => new HttpError(400, 'VALIDATION_FAILED', '입력값을 확인해 주세요.', details);
const notFound = (what = '대상') => new HttpError(404, 'NOT_FOUND', `${what}을(를) 찾을 수 없어요.`);

type Favorite = { type: FavoriteType; targetId: number; createdAt: string };

export function createDb() {
  const home = makeHome();
  return {
    user: { id: 1, email: 'demo@hanyang.ac.kr', nickname: '한양0000' },
    profile: { departmentId: null as number | null, buildingIds: [] as number[], budget: null as Profile['budget'] },
    buildings: makeBuildings() as CampusBuilding[],
    announcements: makeAnnouncements() as Announcement[],
    subscribed: new Set<number>([1]),
    favorites: [{ type: 'LISTING', targetId: 4, createdAt: nowIso() }, { type: 'HOUSING', targetId: 1, createdAt: nowIso() }] as Favorite[],
    reviews: makeReviews() as StoredReview[],
    transfers: structuredClone(TRANSFERS) as StoredTransfer[],
    home: home as MyHome | null,
    payments: makePayments(home) as Payment[],
    utilities: makeUtilities() as Utility[],
    alerts: makeAlerts() as HomeAlert[],
    notifications: makeNotifications() as AppNotification[],
    nextId: { review: 100, transfer: 100, alert: 100 },
  };
}
export type MockDb = ReturnType<typeof createDb>;

let db = createDb();
export const resetMockDb = () => { db = createDb(); };
export const getMockDb = () => db;

let latencyMs = 120;
export const setMockLatency = (ms: number) => { latencyMs = ms; };

// ---------- 공통 계산 ----------
type Ctx = { q: URLSearchParams; body: any; authed: boolean; params: string[] };
type Result = { status?: number; body?: unknown };

const num = (v: string | null): number | undefined => (v == null || v === '' || Number.isNaN(Number(v)) ? undefined : Number(v));
const buildingOf = (id: number | undefined) => (id == null ? undefined : db.buildings.find((b) => b.id === id));
const walkBuilding = (q: URLSearchParams, authed: boolean) => buildingOf(num(q.get('buildingId'))) ?? (authed ? buildingOf(db.profile.buildingIds[0]) : undefined);
const walkTo = (b: CampusBuilding | undefined, lat: number, lng: number): number | null => (b ? walkRoute(lat, lng, b.lat, b.lng).minutes : null);
const requireAuth = (c: Ctx) => { if (!c.authed) throw new HttpError(401, 'UNAUTHORIZED', '로그인이 필요해요.'); };
const pageOf = <T,>(items: T[], q: URLSearchParams) => {
  const page = Math.max(0, num(q.get('page')) ?? 0);
  const size = Math.min(100, Math.max(1, num(q.get('size')) ?? 20));
  return { items: items.slice(page * size, page * size + size), page, size, total: items.length };
};
const isFav = (type: FavoriteType, id: number) => db.favorites.some((f) => f.type === type && f.targetId === id);

function inBbox(q: URLSearchParams, lat: number, lng: number): boolean {
  const raw = q.get('bbox');
  if (!raw) return true;
  const [minLng, minLat, maxLng, maxLat] = raw.split(',').map(Number);
  return lng >= minLng && lng <= maxLng && lat >= minLat && lat <= maxLat;
}

const toSummary = (l: ListingDetail, wb: CampusBuilding | undefined): ListingSummary => {
  const { options: _o, photos: _p, floorplanId: _f, builtYear: _b, description: _d, ...s } = l;
  return { ...s, walkMin: walkTo(wb, l.lat, l.lng), favorited: isFav('LISTING', l.id) };
};
const toDetail = (l: ListingDetail, wb: CampusBuilding | undefined): ListingDetail => ({ ...l, walkMin: walkTo(wb, l.lat, l.lng), favorited: isFav('LISTING', l.id) });
const listing = (id: number) => LISTINGS.find((l) => l.id === id) ?? (() => { throw notFound('매물'); })();

const budgetOrNull = (authed: boolean) => (authed ? db.profile.budget : null);

function listingPriceCheck(l: ListingDetail, authed: boolean) {
  return buildPriceCheck({ rent: l.rent, mgmtFee: l.mgmtFee, deposit: l.deposit, contractMonths: 24, market: marketFor(l.dong, l.areaM2), budget: budgetOrNull(authed) });
}

const cheapestUnit = (h: (typeof HOUSING)[number]) => h.units.map(unitWithConverted).sort((a, b) => a.convertedRent - b.convertedRent)[0];
const cheapestRoom = (d: (typeof DORMS)[number]) => [...d.roomTypes].sort((a, b) => a.monthlyCost - b.monthlyCost)[0];

function housingSummary(h: (typeof HOUSING)[number]) {
  const anns = db.announcements.filter((a) => a.housingId === h.id);
  const today = dayOffset(0);
  const next = anns.flatMap((a) => a.events).filter((e) => e.date >= today).sort((a, b) => a.date.localeCompare(b.date))[0] ?? null;
  return {
    id: h.id, name: h.name, address: h.address, lat: h.lat, lng: h.lng,
    recruiting: anns.some((a) => a.status === 'OPEN' || a.status === 'ADDITIONAL'),
    nextEvent: next ? { type: next.type, date: next.date } : null, subscribed: db.subscribed.has(h.id),
  };
}

function transferSummary(t: StoredTransfer, wb: CampusBuilding | undefined): TransferSummary {
  const conv = convertedRent(t.rent, t.mgmtFee, t.deposit);
  const pc = buildPriceCheck({ rent: t.rent, mgmtFee: t.mgmtFee, deposit: t.deposit, contractMonths: t.remainingMonths, market: marketFor(t.dong, t.areaM2) });
  return {
    id: t.id, title: t.title, address: t.address, dong: t.dong, lat: t.lat, lng: t.lng, deposit: t.deposit, rent: t.rent, mgmtFee: t.mgmtFee,
    areaM2: t.areaM2, floor: t.floor, roomType: t.roomType, convertedRent: conv, grade: pc.grade, walkMin: walkTo(wb, t.lat, t.lng),
    thumbnailUrl: t.photos[0] ?? null, favorited: isFav('TRANSFER', t.id), remainingMonths: t.remainingMonths, availableFrom: t.availableFrom, status: t.status, authorNickname: t.authorNickname,
  };
}
function transferDetail(t: StoredTransfer, wb: CampusBuilding | undefined, authed: boolean): TransferDetail {
  const pc = buildPriceCheck({ rent: t.rent, mgmtFee: t.mgmtFee, deposit: t.deposit, contractMonths: t.remainingMonths, market: marketFor(t.dong, t.areaM2), budget: budgetOrNull(authed) });
  return { ...transferSummary(t, wb), description: t.description, photos: t.photos, priceCheck: pc, mine: t.mine };
}

function favoriteItem(f: Favorite, wb: CampusBuilding | undefined): FavoriteItem | null {
  const base = { type: f.type, targetId: f.targetId, createdAt: f.createdAt };
  if (f.type === 'LISTING') {
    const l = LISTINGS.find((x) => x.id === f.targetId);
    return l ? { ...base, name: l.title, lat: l.lat, lng: l.lng, convertedRent: l.convertedRent, grade: l.grade, walkMin: walkTo(wb, l.lat, l.lng) } : null;
  }
  if (f.type === 'TRANSFER') {
    const t = db.transfers.find((x) => x.id === f.targetId);
    if (!t) return null;
    const s = transferSummary(t, wb);
    return { ...base, name: s.title, lat: s.lat, lng: s.lng, convertedRent: s.convertedRent, grade: s.grade, walkMin: s.walkMin };
  }
  if (f.type === 'HOUSING') {
    const h = HOUSING.find((x) => x.id === f.targetId);
    return h ? { ...base, name: h.name, lat: h.lat, lng: h.lng, convertedRent: cheapestUnit(h).convertedRent, grade: null, walkMin: walkTo(wb, h.lat, h.lng) } : null;
  }
  const d = DORMS.find((x) => x.id === f.targetId);
  return d ? { ...base, name: d.name, lat: d.lat, lng: d.lng, convertedRent: cheapestRoom(d).monthlyCost, grade: null, walkMin: walkTo(wb, d.lat, d.lng) } : null;
}

const profileOut = (): Profile => ({ id: db.user.id, email: db.user.email, nickname: db.user.nickname, ...db.profile });

function loginResult() {
  return { accessToken: `mock-token-${db.user.id}`, expiresIn: 604800, user: { ...db.user } };
}
function loginAs(email: string) {
  db.user.email = email;
  let h = 0;
  for (const ch of email) h = (h * 31 + ch.charCodeAt(0)) % 9000;
  db.user.nickname = `한양${String(1000 + h)}`;
  return loginResult();
}

function reviewList(type: string, id: number) {
  const items = db.reviews.filter((r) => r.targetType === type && r.targetId === id).sort((a, b) => b.id - a.id);
  const average = items.length ? Math.round((items.reduce((s, r) => s + r.rating, 0) / items.length) * 10) / 10 : null;
  return { average, count: items.length, items: items.map(({ targetType: _t, targetId: _i, ...r }): Review => r) };
}

const int15 = (v: unknown) => typeof v === 'number' && Number.isInteger(v) && v >= 1 && v <= 5;

function validateTransferBody(b: Partial<TransferBody>): TransferBody {
  const errs: Record<string, string> = {};
  const title = typeof b.title === 'string' ? b.title.trim() : '';
  if (title.length < 2 || title.length > 40) errs.title = '제목은 2자 이상 40자 이하로 적어 주세요.';
  if (!b.address) errs.address = '주소를 입력해 주세요.';
  if (typeof b.lat !== 'number' || typeof b.lng !== 'number') errs.lat = '위치를 골라 주세요.';
  if (typeof b.deposit !== 'number' || b.deposit < 0) errs.deposit = '보증금을 확인해 주세요.';
  if (typeof b.rent !== 'number' || b.rent <= 0) errs.rent = '월세를 확인해 주세요.';
  if (typeof b.areaM2 !== 'number' || b.areaM2 <= 0) errs.areaM2 = '면적을 확인해 주세요.';
  if (typeof b.remainingMonths !== 'number' || b.remainingMonths < 1) errs.remainingMonths = '남은 개월 수를 확인해 주세요.';
  if (!b.roomType) errs.roomType = '방 구조를 골라 주세요.';
  if (Object.keys(errs).length) throw bad(errs);
  return { dong: '', mgmtFee: null, floor: null, availableFrom: null, description: '', photoUrls: [], ...b, title } as TransferBody;
}

function nearbyFor(l: ListingDetail, radius: number): Nearby[] {
  const spec: [Nearby['category'], string, number, number][] = [
    ['CONVENIENCE', 'GS25 한양점', 0.0006, 0.0004], ['CONVENIENCE', 'CU 행당역점', -0.0009, 0.0011], ['LAUNDRY', '빨래방 워시앤', 0.0012, -0.0008],
    ['BUS_STOP', '한양대 정문 정류장', -0.0004, -0.0014], ['SUBWAY', '한양대역 2번 출구', -0.0016, 0.0019],
  ];
  return spec
    .map(([category, name, dLat, dLng]) => {
      const lat = l.lat + dLat, lng = l.lng + dLng;
      return { category, name, lat, lng, distanceM: Math.round(distanceM(l.lat, l.lng, lat, lng)) };
    })
    .filter((n) => n.distanceM <= radius);
}

// ---------- 라우트 ----------
type Handler = (c: Ctx) => Result | Promise<Result>;
const routes: [string, RegExp, Handler][] = [];
const route = (method: string, pattern: string, h: Handler) =>
  routes.push([method, new RegExp(`^${pattern.replace(/:[a-zA-Z]+/g, '([^/]+)')}$`), h]);
const ok = (body: unknown, status = 200): Result => ({ status, body });
const noContent = (): Result => ({ status: 204 });
const idParam = (c: Ctx, i = 0) => { const n = Number(c.params[i]); if (!Number.isFinite(n)) throw notFound(); return n; };

// 인증·내 정보
route('POST', '/auth/email/send', (c) => {
  const email = String(c.body?.email ?? '').trim();
  if (!/^[^@\s]+@hanyang\.ac\.kr$/i.test(email)) throw new HttpError(400, 'INVALID_EMAIL_DOMAIN', '한양대 메일(@hanyang.ac.kr)만 쓸 수 있어요.');
  return noContent();
});
route('POST', '/auth/email/verify', (c) => {
  const code = String(c.body?.code ?? '');
  if (!/^\d{6}$/.test(code)) throw new HttpError(400, 'CODE_MISMATCH', '인증 코드가 맞지 않아요.');
  return ok(loginAs(String(c.body?.email ?? 'demo@hanyang.ac.kr')));
});
route('POST', '/auth/google', (c) => {
  if (!c.body?.idToken) throw new HttpError(401, 'UNAUTHORIZED', '구글 로그인을 확인하지 못했어요.');
  return ok(loginAs('google-demo@hanyang.ac.kr'));
});
route('GET', '/me/profile', (c) => { requireAuth(c); return ok(profileOut()); });
route('PUT', '/me/profile', (c) => {
  requireAuth(c);
  const b = c.body ?? {};
  if (b.departmentId != null) {
    const dep = DEPARTMENTS.find((d) => d.id === b.departmentId);
    if (!dep) throw bad({ departmentId: '없는 학과예요.' });
    db.profile.departmentId = dep.id;
    if (b.buildingIds == null) db.profile.buildingIds = [...dep.defaultBuildingIds];
  }
  if (b.buildingIds != null) {
    if (!Array.isArray(b.buildingIds) || b.buildingIds.some((id: number) => !buildingOf(id))) throw bad({ buildingIds: '없는 건물이 있어요.' });
    db.profile.buildingIds = [...b.buildingIds];
  }
  if (b.budget !== undefined && b.budget !== null) {
    const { rentCap = null, depositCap = null } = b.budget;
    db.profile.budget = rentCap == null && depositCap == null ? null : { rentCap, depositCap };
  }
  return ok(profileOut());
});
route('GET', '/departments', () => ok(DEPARTMENTS));
route('GET', '/buildings', (c) => { const t = c.q.get('type'); return ok(t ? db.buildings.filter((b) => b.type === t) : db.buildings); });

// 매물·판정
route('GET', '/listings', (c) => {
  const q = c.q;
  const wb = walkBuilding(q, c.authed);
  const grades = q.get('grade')?.split(',').filter(Boolean) as Grade[] | undefined;
  const maxRent = num(q.get('maxRent')), maxDeposit = num(q.get('maxDeposit')), maxMgmt = num(q.get('maxMgmtFee')), maxWalk = num(q.get('maxWalkMin'));
  const room = q.get('roomType')?.split(',').filter(Boolean);
  const items = LISTINGS.map((l) => toSummary(l, wb)).filter((l) =>
    inBbox(q, l.lat, l.lng) &&
    (maxRent == null || l.rent <= maxRent) && (maxDeposit == null || l.deposit <= maxDeposit) && (maxMgmt == null || (l.mgmtFee ?? 0) <= maxMgmt) &&
    (!grades?.length || grades.includes(l.grade)) && (!room?.length || room.includes(l.roomType)) &&
    (maxWalk == null || !wb || (l.walkMin != null && l.walkMin <= maxWalk)));
  return ok(pageOf(items, q));
});
route('GET', '/listings/:id', (c) => ok(toDetail(listing(idParam(c)), walkBuilding(c.q, c.authed))));
route('GET', '/listings/:id/price-check', (c) => ok(listingPriceCheck(listing(idParam(c)), c.authed)));
route('GET', '/listings/:id/alternatives', (c) => {
  const l = listing(idParam(c));
  const wb = walkBuilding(c.q, c.authed);
  const alt = (type: 'HOUSING' | 'DORM', id: number, name: string, conv: number, lat: number, lng: number): Alternative => ({
    type, id, name, convertedRent: conv, monthlyDiff: l.convertedRent - conv, twoYearDiff: (l.convertedRent - conv) * 24, walkMin: walkTo(wb, lat, lng),
  });
  const housing = HOUSING.map((h) => { const u = cheapestUnit(h); return alt('HOUSING', h.id, `${h.name} ${u.name.replace(/^\S+\s/, '')}`, u.convertedRent, h.lat, h.lng); });
  const dorms = DORMS.map((d) => { const r = cheapestRoom(d); return alt('DORM', d.id, `${d.name} ${r.name}`, r.monthlyCost, d.lat, d.lng); });
  const top = (a: Alternative[]) => a.sort((x, y) => x.convertedRent - y.convertedRent).slice(0, 3);
  return ok({ housing: top(housing), dorms: top(dorms) });
});
route('GET', '/listings/:id/nearby', (c) => ok(nearbyFor(listing(idParam(c)), Math.min(500, num(c.q.get('radius')) ?? 300))));
route('GET', '/walk', (c) => {
  const lat = num(c.q.get('fromLat')), lng = num(c.q.get('fromLng')), b = buildingOf(num(c.q.get('buildingId')));
  if (lat == null || lng == null || !b) throw bad({ buildingId: '출발 좌표와 건물이 필요해요.' });
  return ok({ ...walkRoute(lat, lng, b.lat, b.lng), gateId: null });
});

// 검색·주소
route('GET', '/search', (c) => {
  const q = (c.q.get('q') ?? '').trim();
  if (q.length < 2) throw bad({ q: '두 글자 이상 입력해 주세요.' });
  const limit = num(c.q.get('limit')) ?? 10;
  const has = (...s: (string | null | undefined)[]) => s.some((x) => x?.includes(q));
  const out: SearchResult[] = [
    ...LISTINGS.filter((l) => has(l.title, l.address, l.dong)).map((l): SearchResult => ({ type: 'LISTING', id: l.id, name: l.title, address: l.address, lat: l.lat, lng: l.lng })),
    ...HOUSING.filter((h) => has(h.name, h.address)).map((h): SearchResult => ({ type: 'HOUSING', id: h.id, name: h.name, address: h.address, lat: h.lat, lng: h.lng })),
    ...DORMS.filter((d) => has(d.name)).map((d): SearchResult => ({ type: 'DORM', id: d.id, name: d.name, address: null, lat: d.lat, lng: d.lng })),
    ...db.transfers.filter((t) => has(t.address, t.dong)).map((t): SearchResult => ({ type: 'TRANSFER', id: t.id, name: `${t.dong} 양도`, address: t.address, lat: t.lat, lng: t.lng })),
    ...db.buildings.filter((b) => has(b.name)).map((b): SearchResult => ({ type: 'BUILDING', id: b.id, name: b.name, address: null, lat: b.lat, lng: b.lng })),
  ];
  if (out.length < limit) out.push(...ADDRESSES.filter((a) => has(a.address, a.roadAddress, a.dong)).map((a): SearchResult => ({ type: 'ADDRESS', id: null, name: a.roadAddress ?? a.address, address: a.address, lat: a.lat, lng: a.lng })));
  return ok(out.slice(0, limit));
});
route('GET', '/geo/address', (c) => {
  const q = (c.q.get('q') ?? '').trim();
  return ok(ADDRESSES.filter((a) => !q || [a.address, a.roadAddress, a.dong].some((s) => s?.includes(q))));
});

// 청년안심주택
route('GET', '/housing', () => ok(HOUSING.map(housingSummary)));
route('GET', '/housing/announcements', (c) => {
  const status = c.q.get('status'), hid = num(c.q.get('housingId'));
  return ok(db.announcements.filter((a) => (!status || a.status === status) && (hid == null || a.housingId === hid)));
});
route('GET', '/housing/:id', (c) => {
  const h = HOUSING.find((x) => x.id === idParam(c));
  if (!h) throw notFound('단지');
  return ok({ ...housingSummary(h), unitTypes: h.units.map(unitWithConverted), floorLayoutImageUrl: h.floorLayoutImageUrl, contact: h.contact, walkMin: walkTo(walkBuilding(c.q, c.authed), h.lat, h.lng) });
});
route('POST', '/housing/:id/subscribe', (c) => { requireAuth(c); const id = idParam(c); if (!HOUSING.some((h) => h.id === id)) throw notFound('단지'); db.subscribed.add(id); return noContent(); });
route('DELETE', '/housing/:id/subscribe', (c) => { requireAuth(c); db.subscribed.delete(idParam(c)); return noContent(); });

// 기숙사
route('GET', '/dorms', () => ok(DORMS));
route('GET', '/dorms/:id', (c) => {
  const d = DORMS.find((x) => x.id === idParam(c));
  if (!d) throw notFound('기숙사');
  return ok({ ...d, walkMin: walkTo(walkBuilding(c.q, c.authed), d.lat, d.lng) });
});

// 찜
route('GET', '/me/favorites', (c) => {
  requireAuth(c);
  const type = c.q.get('type'), wb = walkBuilding(c.q, true);
  return ok(db.favorites.filter((f) => !type || f.type === type).map((f) => favoriteItem(f, wb)).filter(Boolean).reverse());
});
route('POST', '/me/favorites', (c) => {
  requireAuth(c);
  const { type, targetId } = c.body ?? {};
  if (!['LISTING', 'HOUSING', 'DORM', 'TRANSFER'].includes(type) || typeof targetId !== 'number') throw bad({ type: '찜 종류와 대상이 필요해요.' });
  if (isFav(type, targetId)) throw new HttpError(409, 'ALREADY_EXISTS', '이미 찜했어요.');
  const f: Favorite = { type, targetId, createdAt: nowIso() };
  const item = favoriteItem(f, walkBuilding(c.q, true));
  if (!item) throw notFound();
  db.favorites.push(f);
  return ok(item, 201);
});
route('DELETE', '/me/favorites/:type/:id', (c) => {
  requireAuth(c);
  db.favorites = db.favorites.filter((f) => !(f.type === c.params[0] && f.targetId === Number(c.params[1])));
  return noContent();
});

// 양도
route('GET', '/transfers', (c) => {
  const status = c.q.get('status') ?? 'OPEN', wb = walkBuilding(c.q, c.authed);
  return ok(pageOf(db.transfers.filter((t) => t.status === status && inBbox(c.q, t.lat, t.lng)).map((t) => transferSummary(t, wb)), c.q));
});
route('GET', '/transfers/:id', (c) => {
  const t = db.transfers.find((x) => x.id === idParam(c));
  if (!t) throw notFound('양도 글');
  return ok(transferDetail(t, walkBuilding(c.q, c.authed), c.authed));
});
route('POST', '/transfers', (c) => {
  requireAuth(c);
  const b = validateTransferBody(c.body ?? {});
  const t: StoredTransfer = { ...b, id: db.nextId.transfer++, authorNickname: db.user.nickname, mine: true, status: 'OPEN', photos: b.photoUrls.length ? b.photoUrls : [placeholderImage('양도 사진', '#a58a6f')] };
  db.transfers.push(t);
  return ok(transferDetail(t, walkBuilding(c.q, true), true), 201);
});
route('PUT', '/transfers/:id', (c) => {
  requireAuth(c);
  const t = db.transfers.find((x) => x.id === idParam(c));
  if (!t) throw notFound('양도 글');
  if (!t.mine) throw new HttpError(403, 'FORBIDDEN', '내 글만 고칠 수 있어요.');
  const b = validateTransferBody(c.body ?? {});
  Object.assign(t, b, { photos: b.photoUrls.length ? b.photoUrls : t.photos });
  return ok(transferDetail(t, walkBuilding(c.q, true), true));
});
route('PATCH', '/transfers/:id/status', (c) => {
  requireAuth(c);
  const t = db.transfers.find((x) => x.id === idParam(c));
  if (!t) throw notFound('양도 글');
  if (!t.mine) throw new HttpError(403, 'FORBIDDEN', '내 글만 바꿀 수 있어요.');
  if (c.body?.status !== 'OPEN' && c.body?.status !== 'DONE') throw bad({ status: 'OPEN 또는 DONE' });
  t.status = c.body.status;
  return ok(transferDetail(t, walkBuilding(c.q, true), true));
});
route('POST', '/uploads', (c) => { requireAuth(c); return ok({ url: placeholderImage('업로드 사진', '#8a6fa5') }); });

// 후기
route('GET', '/reviews', (c) => {
  const type = c.q.get('targetType'), id = num(c.q.get('targetId'));
  if (!type || id == null) throw bad({ targetType: '대상을 지정해 주세요.' });
  return ok(reviewList(type, id));
});
route('POST', '/reviews', (c) => {
  requireAuth(c);
  const { targetType, targetId, rating, scores, text = '', pin = null } = c.body ?? {};
  const errs: Record<string, string> = {};
  if (!['LISTING', 'HOUSING', 'DORM'].includes(targetType) || typeof targetId !== 'number') errs.targetType = '후기 대상을 확인해 주세요.';
  if (!int15(rating)) errs.rating = '별점은 1~5 정수예요.';
  const keys: (keyof ReviewScores)[] = ['noise', 'light', 'bugs', 'landlord', 'depositReturn'];
  for (const k of keys) if (!int15(scores?.[k])) errs[`scores.${k}`] = '1~5 정수예요.';
  if (typeof text !== 'string' || text.length > 500) errs.text = '500자 이하로 써 주세요.';
  if (Object.keys(errs).length) throw bad(errs);
  const r: StoredReview = { id: db.nextId.review++, targetType, targetId, rating, scores, text, pin, authorNickname: db.user.nickname, createdAt: nowIso() };
  db.reviews.push(r);
  const { targetType: _t, targetId: _i, ...out } = r;
  return ok(out, 201);
});

// 내 집
route('GET', '/me/home', (c) => { requireAuth(c); if (!db.home) throw notFound('내 집 기록'); return ok(db.home); });
route('PUT', '/me/home', (c) => {
  requireAuth(c);
  const b = c.body as Partial<MyHome>;
  if (!b?.address || typeof b.rent !== 'number' || typeof b.deposit !== 'number' || !b.contractStart || !b.contractEnd) throw bad({ address: '주소·보증금·월세·계약 기간이 필요해요.' });
  db.home = { dong: '', lat: 0, lng: 0, mgmtFee: null, areaM2: 0, ...b } as MyHome;
  return ok(db.home);
});
const sortDesc = <T extends { month: string }>(a: T[]) => [...a].sort((x, y) => y.month.localeCompare(x.month));
const MONTH = /^\d{4}-(0[1-9]|1[0-2])$/;
route('GET', '/me/payments', (c) => { requireAuth(c); return ok(sortDesc(db.payments)); });
route('POST', '/me/payments', (c) => {
  requireAuth(c);
  const b = c.body as Payment;
  if (!MONTH.test(b?.month ?? '') || typeof b.amount !== 'number') throw bad({ month: 'YYYY-MM 과 금액이 필요해요.' });
  db.payments = [...db.payments.filter((p) => p.month !== b.month), { month: b.month, amount: b.amount, paidAt: b.paidAt }];
  return ok(b, 201);
});
route('GET', '/me/utilities', (c) => { requireAuth(c); return ok(sortDesc(db.utilities)); });
route('POST', '/me/utilities', (c) => {
  requireAuth(c);
  const b = c.body as Utility;
  if (!MONTH.test(b?.month ?? '')) throw bad({ month: 'YYYY-MM 형식이에요.' });
  const u: Utility = { month: b.month, electricity: b.electricity ?? null, gas: b.gas ?? null, water: b.water ?? null, internet: b.internet ?? null };
  db.utilities = [...db.utilities.filter((x) => x.month !== b.month), u];
  return ok(u, 201);
});
route('GET', '/me/home/alerts', (c) => { requireAuth(c); return ok(db.alerts); });
route('POST', '/me/home/alerts', (c) => {
  requireAuth(c);
  const d = c.body?.daysBefore;
  if (!Number.isInteger(d) || d < 1 || d > 365) throw bad({ daysBefore: '1~365 사이예요.' });
  const a: HomeAlert = { id: db.nextId.alert++, daysBefore: d, enabled: c.body?.enabled !== false };
  db.alerts.push(a);
  return ok(a, 201);
});
route('PATCH', '/me/home/alerts/:id', (c) => {
  requireAuth(c);
  const a = db.alerts.find((x) => x.id === idParam(c));
  if (!a) throw notFound('알림');
  if (typeof c.body?.enabled === 'boolean') a.enabled = c.body.enabled;
  return ok(a);
});
route('DELETE', '/me/home/alerts/:id', (c) => { requireAuth(c); db.alerts = db.alerts.filter((x) => x.id !== idParam(c)); return noContent(); });

export function buildReport(month: string): Report {
  const home = db.home;
  if (!home) throw notFound('내 집 기록');
  const totalOf = (m: string) => {
    const pay = db.payments.find((p) => p.month === m), u = db.utilities.find((x) => x.month === m);
    const breakdown = { rent: pay?.amount ?? home.rent, mgmtFee: home.mgmtFee, electricity: u?.electricity ?? null, gas: u?.gas ?? null, water: u?.water ?? null, internet: u?.internet ?? null };
    const total = Object.values(breakdown).reduce<number>((s, v) => s + (v ?? 0), 0);
    return { breakdown, total, hasRecord: !!(pay || u) };
  };
  const cur = totalOf(month);
  const [y, m] = month.split('-').map(Number);
  const prevMonth = ym(new Date(y, m - 2, 1));
  const prev = totalOf(prevMonth);
  let topIncrease: Report['topIncrease'] = null;
  if (prev.hasRecord) {
    const items = ['rent', 'mgmtFee', 'electricity', 'gas', 'water', 'internet'] as const;
    const best = items
      .map((k) => ({ item: k as string, diff: (cur.breakdown[k] ?? 0) - (prev.breakdown[k] ?? 0) }))
      .sort((a, b) => b.diff - a.diff)[0];
    topIncrease = best && best.diff > 0 ? best : null;
  }
  const pc = buildPriceCheck({ rent: home.rent, mgmtFee: home.mgmtFee, deposit: home.deposit, contractMonths: Math.max(1, monthsBetween(home.contractStart.slice(0, 7), home.contractEnd.slice(0, 7))), market: marketFor(home.dong, home.areaM2) });
  const elapsed = Math.max(0, monthsBetween(home.contractStart.slice(0, 7), month) + 1);
  return {
    month, total: cur.total, breakdown: cur.breakdown,
    prevTotal: prev.hasRecord ? prev.total : null, diff: prev.hasRecord ? cur.total - prev.total : null, topIncrease,
    excess: pc.monthlyExcess == null ? null : { monthly: pc.monthlyExcess, cumulative: pc.monthlyExcess * elapsed, grade: gradeOf(pc.excessRate) },
  };
}
route('GET', '/me/report', (c) => {
  requireAuth(c);
  const month = c.q.get('month') ?? monthOffset(-1);
  if (!MONTH.test(month)) throw bad({ month: 'YYYY-MM 형식이에요.' });
  return ok(buildReport(month));
});

// 알림·평면도·초대
route('GET', '/me/notifications', (c) => { requireAuth(c); return ok([...db.notifications].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 50)); });
route('PATCH', '/me/notifications/:id/read', (c) => {
  requireAuth(c);
  const n = db.notifications.find((x) => x.id === idParam(c));
  if (!n) throw notFound('알림');
  n.read = true;
  return noContent();
});
route('GET', '/floorplans/:id', (c) => { const f = FLOORPLANS.find((x) => x.id === idParam(c)); if (!f) throw notFound('평면도'); return ok(f); });
route('POST', '/invites', (c) => {
  if (!c.body?.playerId) throw bad({ playerId: '필요해요.' });
  const token = `inv_${Math.random().toString(36).slice(2, 6)}`;
  return ok({ token, url: `${typeof location !== 'undefined' ? location.origin : ''}/?invite=${token}`, expiresAt: new Date(Date.now() + 86400000).toISOString() });
});

// ---------- fetch 진입점 ----------
const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

export async function mockFetch(input: string, init: { method?: string; headers?: Record<string, string>; body?: unknown; signal?: AbortSignal } = {}): Promise<Response> {
  if (latencyMs > 0) await new Promise((r) => setTimeout(r, latencyMs));
  if (init.signal?.aborted) throw new DOMException('Aborted', 'AbortError');
  const url = new URL(input, 'http://mock.local');
  const path = url.pathname.replace(/^.*\/api\/v1/, '') || '/';
  const method = (init.method ?? 'GET').toUpperCase();
  let body: unknown = init.body;
  if (typeof body === 'string') { try { body = JSON.parse(body); } catch { body = null; } }
  const authed = /^Bearer\s+\S+/.test(init.headers?.Authorization ?? '');
  let pathMatched = false;
  try {
    for (const [m, re, h] of routes) {
      const hit = re.exec(path);
      if (!hit) continue;
      pathMatched = true;
      if (m !== method) continue;
      const r = await h({ q: url.searchParams, body, authed, params: hit.slice(1).map(decodeURIComponent) });
      return r.status === 204 ? new Response(null, { status: 204 }) : json(r.status ?? 200, r.body ?? null);
    }
    if (pathMatched) throw new HttpError(405, 'METHOD_NOT_ALLOWED', '지원하지 않는 메서드예요.');
    throw notFound('경로');
  } catch (e) {
    if (e instanceof HttpError) return json(e.status, { code: e.code, message: e.message, details: e.details });
    console.error('[mock] 내부 오류', e);
    return json(500, { code: 'INTERNAL_ERROR', message: '목 서버 내부 오류', details: null });
  }
}
