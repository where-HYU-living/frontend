import type { Alternative, Grade, PriceCheck } from '../../api/types';
import { manwon } from '../../lib/money';

/** N1: 사건 번호 (매물 id 로 만든다. 계약에 없는 값이라 화면 장식용) */
export const caseNumber = (id: number): string => `사건 No. ${String(Math.max(0, Math.trunc(id))).padStart(4, '0')}`;

export type Gauge = { fairPct: number; rentPct: number; over: boolean; excessPct: number };

/** 환산 월세 vs 적정가 막대. 둘 중 큰 값 +10% 를 100% 로 본다. 적정가가 없으면 null */
export function gaugeRatios(convertedRent: number | null | undefined, fairRent: number | null | undefined): Gauge | null {
  if (convertedRent == null || fairRent == null || !(convertedRent > 0) || !(fairRent > 0)) return null;
  const scale = Math.max(convertedRent, fairRent) * 1.1;
  const pct = (v: number) => Math.round((v / scale) * 1000) / 10;
  const rentPct = pct(convertedRent), fairPct = pct(fairRent);
  const over = convertedRent > fairRent;
  return { fairPct, rentPct, over, excessPct: over ? Math.round((rentPct - fairPct) * 10) / 10 : 0 };
}

/** 초과율 문구: 0.62 -> "+62%" */
export function excessRateLabel(rate: number | null | undefined): string {
  if (rate == null || Number.isNaN(rate)) return '-';
  const p = Math.round(rate * 100);
  return `${p > 0 ? '+' : ''}${p}%`;
}

/** 카드 한 줄: 초과액(원 단위 입력). 서버 값이 없으면 null */
export function excessLine(monthlyExcessWon: number | null | undefined, totalExcessWon: number | null | undefined, months = 24): string | null {
  if (monthlyExcessWon == null || totalExcessWon == null) return null;
  const span = months === 24 ? '2년' : `${months}개월`;
  if (monthlyExcessWon <= 0) return '적정가 이하예요';
  return `월 ${manwon(monthlyExcessWon)} 초과 · ${span} ${manwon(totalExcessWon)}`;
}

/** 등급만 아는 목록 카드용 보조 문구 (숫자를 지어내지 않는다) */
export const GRADE_HINT: Record<Grade, string> = {
  FAIR: '시세 범위 안이에요',
  SLIGHTLY_HIGH: '시세보다 조금 높아요',
  HIGH: '시세보다 꽤 높아요',
  CULPRIT: '시세를 크게 넘어요',
  PENDING: '비교할 거래가 부족해요',
};

/** D9: 예산 대비 한 줄 */
export function budgetLine(b: PriceCheck['budget'] | undefined): { text: string; over: boolean } | null {
  if (!b) return null;
  const parts: string[] = [];
  let over = false;
  if (b.overRent != null) { if (b.overRent > 0) { over = true; parts.push(`월세 예산보다 ${manwon(b.overRent)} 초과`); } else parts.push('월세 예산 안'); }
  if (b.overDeposit != null) { if (b.overDeposit > 0) { over = true; parts.push(`보증금 예산보다 ${manwon(b.overDeposit)} 초과`); } else parts.push('보증금 예산 안'); }
  return parts.length ? { text: parts.join(' · '), over } : null;
}

/** 근거: 비교 거래 수·범위 */
export function evidenceLine(s: PriceCheck['sample'] | undefined): string | null {
  if (!s || s.count <= 0) return null;
  const area = s.areaMinM2 != null && s.areaMaxM2 != null ? `${s.areaMinM2}~${s.areaMaxM2}㎡` : null;
  const period = s.from && s.to ? `${s.from.slice(0, 7)}~${s.to.slice(0, 7)}` : null;
  return [`${s.dongs.join('·')} 실거래 ${s.count}건`, s.scope === 'ADJACENT' ? '인접 동 포함' : null, area, period].filter(Boolean).join(' · ');
}

/** N3: 비교 문구. twoYearDiff 양수 = 대안이 더 쌈 (계약 5-2) */
export function compareLine(a: Pick<Alternative, 'name' | 'twoYearDiff'>): { text: string; phrase: string; cheaper: boolean | null } {
  const d = a.twoYearDiff;
  if (d === 0 || Number.isNaN(d)) return { text: `${a.name}, 2년 비용이 비슷해요`, phrase: '2년 비용이 비슷해요', cheaper: null };
  const phrase = `2년 ${manwon(Math.abs(d))} ${d > 0 ? '덜 들어요' : '더 들어요'}`;
  return { text: `${a.name}, ${phrase}`, phrase, cheaper: d > 0 };
}

export const TYPE_NAME: Record<Alternative['type'], string> = { HOUSING: '청년안심주택', DORM: '기숙사', LISTING: '자취방', TRANSFER: '양도' };

/** N2: 수배 전단 대상 (범인 등급 + 판정 수치 존재) */
export const isWanted = (grade: Grade | undefined): boolean => grade === 'CULPRIT';

// ───── 가격 눈금자 (판결 카드) ─────
/** 눈금자 범위·눈금: 값들(원)을 다 담고 양옆에 여유. 폭에 따라 5만/10만/20만 간격 */
export function lineupScale(values: number[]): { min: number; max: number; ticks: number[] } {
  const v = values.filter((x) => Number.isFinite(x) && x > 0);
  const lo = Math.min(...v), hi = Math.max(...v), range = Math.max(hi - lo, 50_000);
  const step = range <= 250_000 ? 50_000 : range <= 700_000 ? 100_000 : 200_000;
  const min = Math.max(0, Math.floor((lo - range * 0.18) / step) * step);
  const max = Math.ceil((hi + range * 0.18) / step) * step;
  const ticks: number[] = [];
  for (let t = min; t <= max + 1; t += step) ticks.push(t);
  return { min, max, ticks };
}

export type LineupLabel = { key: string; at: number; text: string; /** 빈자리가 없으면 빼도 되는 이름표 (겹치느니 안 그린다) */ optional?: boolean };
export type Lane = 'top' | 'above' | 'below';
export type PlacedLabel = LineupLabel & { lane: Lane; left: number; align: 'start' | 'center' | 'end' };
/**
 * 눈금자 이름표 자리: 위·아래 줄 중 겹치지 않는 쪽에 놓고, 셋이 몰려 있으면 맨 위 한 줄을 더 쓴다(먼저 온 것이 우선). 양 끝에서는 안쪽으로 정렬해 잘리지 않게.
 * at·결과 left 는 %. width 는 눈금자 폭(px) 어림 — 글자 폭을 % 로 바꾸는 데만 쓴다.
 */
export function placeLabels(items: LineupLabel[], width = 300): PlacedLabel[] {
  const used: Record<Lane, [number, number][]> = { top: [], above: [], below: [] };
  const out: PlacedLabel[] = [];
  for (const it of items) {
    const w = ((it.text.length * 12 + 10) / width) * 100;
    const align: PlacedLabel['align'] = it.at - w / 2 < 0 ? 'start' : it.at + w / 2 > 100 ? 'end' : 'center';
    const a = align === 'start' ? 0 : align === 'end' ? 100 - w : it.at - w / 2;
    const span: [number, number] = [a - 1.5, a + w + 1.5];
    const free = (lane: Lane) => used[lane].every(([s, e]) => span[1] <= s || span[0] >= e);
    const pref: Lane[] = it.key === 'house' ? ['below', 'above', 'top'] : ['above', 'below', 'top'];
    const found = pref.find(free);
    if (!found && it.optional) continue;
    const lane = found ?? pref[0];
    used[lane].push(span);
    out.push({ ...it, lane, align, left: align === 'start' ? 0 : align === 'end' ? 100 : it.at });
  }
  return out;
}
