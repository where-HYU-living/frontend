import type { Grade } from '../api/types';
import { manwon } from './money';

type Meta = { color: string; label: string; verdict: (totalExcessWon: number | null, months?: number) => string };
const span = (months?: number) => (!months || months === 24 ? '2년' : `${months}개월`);

/** 계약 2-2: 등급 색·라벨·판결 문구 */
export const GRADE_META: Record<Grade, Meta> = {
  FAIR: { color: '#3BA55C', label: '적정', verdict: () => '시세대로예요' },
  SLIGHTLY_HIGH: { color: '#F2C94C', label: '조금 비쌈', verdict: (t, m) => `${span(m)}이면 ${manwon(t)} 원 더 내요` },
  HIGH: { color: '#F2994A', label: '비쌈', verdict: () => '이 집이 내 돈을 써버릴 놈일 수 있어요' },
  CULPRIT: { color: '#EB5757', label: '범인', verdict: (t, m) => `찾았다. ${span(m)}간 ${manwon(t)} 원을 써버릴 놈` },
  PENDING: { color: '#9E9E9E', label: '판정 보류', verdict: () => '비교할 거래가 부족해요' },
};

const lin = (v: number) => { const c = v / 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
/**
 * 이 배경색 위에 올릴 글자색. 흰 글자의 대비가 3 이상이면 흰색, 아니면 짙은 갈색(노랑·주황·회색 배지에서 흰 글자가 안 보이는 것을 막는다).
 * 입력은 #rrggbb.
 */
export function inkFor(bg: string): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(bg.trim());
  if (!m) return '#fff';
  const n = parseInt(m[1], 16);
  const L = 0.2126 * lin((n >> 16) & 255) + 0.7152 * lin((n >> 8) & 255) + 0.0722 * lin(n & 255);
  return 1.05 / (L + 0.05) >= 3 ? '#fff' : '#2b2308';
}

/**
 * 패널 안 글자·도장·눈금자용 색 (밝은 유리 배경 위에서 대비 4.5 이상). 3D 마커·지도 핀은 GRADE_META.color 를 그대로 쓴다.
 * 예전 화면은 신호등색 알약 배지를 칠했는데 '색 라벨'만 눈에 띄고 내용(얼마나 비싼지)은 안 읽혔다 → 색은 글자에만, 크기는 4칸 막대로.
 */
export const GRADE_INK: Record<Grade, string> = {
  FAIR: '#1d7048',
  SLIGHTLY_HIGH: '#8a5a00',
  HIGH: '#b4400f',
  CULPRIT: '#b0212b',
  PENDING: '#5d6878',
};
/** 비싼 정도 0~4 (판정 보류 0) */
export const GRADE_LEVEL: Record<Grade, number> = { PENDING: 0, FAIR: 1, SLIGHTLY_HIGH: 2, HIGH: 3, CULPRIT: 4 };
