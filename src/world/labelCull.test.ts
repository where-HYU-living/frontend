import { describe, expect, it } from 'vitest';
import { pickLabels, type LabelCandidate } from './labelCull';

const V = { w: 1000, h: 600 };
const c = (o: Partial<LabelCandidate>): LabelCandidate => ({ d: 10, near: 60, sx: 500, sy: 300, w: 80, h: 24, prio: 0, ...o });

describe('pickLabels', () => {
  it('거리 밖·카메라 뒤·화면 밖은 숨긴다', () => {
    expect(pickLabels([c({ d: 61 }), c({ sx: null, sy: null }), c({ sx: 2000 }), c({ sx: 100 })], V)).toEqual([false, false, false, true]);
  });
  it('겹치면 가까운 것만, 우선순위가 높으면 거리보다 먼저', () => {
    expect(pickLabels([c({ d: 30 }), c({ d: 10, sx: 520 })], V)).toEqual([false, true]);
    expect(pickLabels([c({ d: 30, prio: 3 }), c({ d: 10, sx: 520 })], V)).toEqual([true, false]);
  });
  it('최대 개수', () => {
    const many = Array.from({ length: 30 }, (_, i) => c({ d: i, sx: 40 + (i % 10) * 95, sy: 40 + Math.floor(i / 10) * 40 }));
    expect(pickLabels(many, V, 14).filter(Boolean)).toHaveLength(14);
    expect(pickLabels(many, V, 14).slice(0, 14).every(Boolean)).toBe(true); // 가까운 14개
  });
});
