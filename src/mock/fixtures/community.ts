import type { AddressResult, AppNotification, HomeAlert, MyHome, Payment, Review, TransferBody, Utility } from '../../api/types';
import { at, dayOffset, monthOffset, placeholderImage } from '../util';
import { LISTINGS } from './listings';

export type ReviewTarget = 'LISTING' | 'HOUSING' | 'DORM';
export type StoredReview = Review & { targetType: ReviewTarget; targetId: number };
export type StoredTransfer = TransferBody & { id: number; authorNickname: string; mine: boolean; status: 'OPEN' | 'DONE'; photos: string[] };

const REVIEW_TEXTS = [
  '방음이 생각보다 괜찮고 햇빛이 잘 들어요.', '밤에 옆방 소리가 조금 들려요. 그래도 위치는 최고.', '집주인분이 친절하세요. 보증금도 제때 돌려받았어요.',
  '겨울에 외풍이 있어요. 창문 단열 필름 추천합니다.', '벌레가 가끔 나와요. 방역은 해주십니다.', '역에서 가까워서 통학이 편해요.',
];
const NICKS = ['한양1024', '한양3377', '한양5810', '한양7042'];

function review(id: number, targetType: ReviewTarget, targetId: number, rating: number, i: number): StoredReview {
  const clamp = (n: number) => Math.min(5, Math.max(1, n));
  return {
    id, targetType, targetId, rating,
    scores: { noise: clamp(rating + (i % 2 ? -1 : 0)), light: clamp(rating + 1), bugs: clamp(rating - (i % 3 === 0 ? 1 : 0)), landlord: clamp(rating), depositReturn: clamp(rating + (i % 2)) },
    text: REVIEW_TEXTS[i % REVIEW_TEXTS.length], pin: i === 0 ? [1.2, 1.0, 2.4] : null, authorNickname: NICKS[i % NICKS.length], createdAt: `2026-0${(i % 9) + 1}-1${i % 9}T10:00:00+09:00`,
  };
}

/** 매물 5곳(1~5) × 2건 + 단지/기숙사 몇 건 */
export function makeReviews(): StoredReview[] {
  const out: StoredReview[] = [];
  let id = 1;
  for (let l = 1; l <= 5; l++) for (let k = 0; k < 2; k++) out.push(review(id++, 'LISTING', l, 5 - ((l + k) % 4), id));
  out.push(review(id++, 'HOUSING', 1, 5, 1), review(id++, 'HOUSING', 1, 4, 2), review(id++, 'DORM', 1, 4, 3));
  return out;
}

export const ADDRESSES: AddressResult[] = [
  { address: '서울 성동구 행당동 17-3', roadAddress: '서울 성동구 행당로 63', dong: '행당동', ...at(-200, 320) },
  { address: '서울 성동구 행당동 236', roadAddress: '서울 성동구 왕십리로 222', dong: '행당동', ...at(-100, 400) },
  { address: '서울 성동구 사근동 8-12', roadAddress: '서울 성동구 사근로 15', dong: '사근동', ...at(100, -240) },
  { address: '서울 성동구 사근동 52', roadAddress: '서울 성동구 마조로 30', dong: '사근동', ...at(200, -200) },
  { address: '서울 성동구 마장동 780', roadAddress: '서울 성동구 마장로 134', dong: '마장동', ...at(450, -60) },
  { address: '서울 성동구 성수동1가 685', roadAddress: '서울 성동구 성수이로 20', dong: '성수동', ...at(-60, -600) },
  { address: '서울 성동구 도선동 61', roadAddress: '서울 성동구 도선로 22', dong: '도선동', ...at(-450, 150) },
  { address: '서울 성동구 송정동 73-1', roadAddress: '서울 성동구 송정길 9', dong: '송정동', ...at(720, -320) },
];

const TR = (id: number, listingId: number, remainingMonths: number, authorNickname: string, title: string, description: string): StoredTransfer => {
  const l = LISTINGS[listingId - 1];
  return {
    id, title, address: l.address, dong: l.dong, lat: l.lat + 0.0004, lng: l.lng - 0.0004, deposit: l.deposit, rent: l.rent, mgmtFee: l.mgmtFee, areaM2: l.areaM2,
    roomType: l.roomType, floor: l.floor, remainingMonths, availableFrom: dayOffset(14 + id * 7), description, photoUrls: [], photos: [placeholderImage(`양도 ${id}`, '#a58a6f')],
    authorNickname, mine: false, status: 'OPEN',
  };
};

export const TRANSFERS: StoredTransfer[] = [
  TR(1, 2, 14, '한양2210', '입대로 급하게 양도해요, 가구 다 두고 가요', '군 입대로 양도해요. 가구 일체 두고 갑니다. 관리비 포함 금액이에요.'),
  TR(2, 5, 9, '한양9051', '교환학생 가는 동안 9개월 양도', '교환학생 가게 되어 남은 계약 양도합니다. 협의 가능해요.'),
  TR(3, 13, 20, '한양4408', '졸업해서 이사해요, 에어컨 새것', '졸업 후 이사 예정이라 양도합니다. 에어컨 새것이에요.'),
];

export function makeHome(): MyHome {
  const l = LISTINGS[2];
  return { address: l.address, dong: l.dong, lat: l.lat, lng: l.lng, deposit: l.deposit, rent: l.rent, mgmtFee: l.mgmtFee, areaM2: l.areaM2, contractStart: dayOffset(-300), contractEnd: dayOffset(430) };
}
export const makePayments = (home: MyHome): Payment[] => [monthOffset(-1), monthOffset(-2)].map((month) => ({ month, amount: home.rent, paidAt: `${month}-05` }));
export const makeUtilities = (): Utility[] => [
  { month: monthOffset(-1), electricity: 42000, gas: 38000, water: 12000, internet: 20000 },
  { month: monthOffset(-2), electricity: 36000, gas: 17000, water: 11000, internet: 20000 },
];
export const makeAlerts = (): HomeAlert[] => [{ id: 1, daysBefore: 60, enabled: true }];

export function makeNotifications(): AppNotification[] {
  const t = (d: number) => `${dayOffset(d)}T09:00:00+09:00`;
  return [
    { id: 1, type: 'HOUSING_DDAY', title: '청아진 접수 마감 D-5', body: '왕십리역 청아진 입주자 모집 접수가 5일 뒤 마감돼요.', targetType: 'HOUSING', targetId: 1, createdAt: t(0), read: false },
    { id: 2, type: 'HOUSING_DDAY', title: '청아진 서류 제출 D-7', body: '서류 제출 마감이 일주일 남았어요.', targetType: 'HOUSING', targetId: 1, createdAt: t(-1), read: false },
    { id: 3, type: 'CONTRACT_EXPIRY', title: '계약 만료 60일 전', body: '내 집 계약이 곧 끝나요. 재계약 여부를 정해 보세요.', targetType: null, targetId: null, createdAt: t(-3), read: true },
  ];
}
