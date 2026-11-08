/**
 * 3D 이름표·말풍선 중 화면에 띄울 것 고르기 (순수 함수).
 *
 * 규칙: ① 플레이어에서 수평 거리 `near` 이내만 ② 카메라 뒤·화면 밖은 뺀다 ③ 우선순위가 높은 것 → 가까운 것 순서로
 * ④ 이미 놓인 것과 화면에서 겹치면 뺀다 ⑤ 최대 `max` 개.
 *
 * 왜 따로 있나: three r180 의 CSS2DRenderer 는 매 프레임 `element.style.display` 를 덮어쓴다.
 * 그래서 예전처럼 display 로 숨기면 무효가 되고(먼 라벨까지 전부 보임 — R3F 이식 후 회귀), `object.visible` 로 숨겨야 한다.
 */
export type LabelCandidate = {
  /** 플레이어에서 수평 거리(m) */
  d: number;
  /** 이 라벨이 보일 수 있는 최대 거리(m) */
  near: number;
  /** 화면 좌표(px, 라벨 가운데 — CSS2DObject 기본 center 0.5,0.5). 카메라 뒤·범위 밖이면 null */
  sx: number | null;
  sy: number | null;
  /** 화면 크기(px) — 모르면 어림값 */
  w: number;
  h: number;
  /** 클수록 먼저 자리를 차지 (내 집·내 과 건물 > 랜드마크 > 매물) */
  prio: number;
};

export const LABEL_MAX = 14;

export function pickLabels(items: LabelCandidate[], view: { w: number; h: number }, max = LABEL_MAX): boolean[] {
  const show = items.map(() => false);
  const order = items
    .map((it, i) => ({ it, i }))
    .filter(({ it }) => it.d <= it.near && it.sx != null && it.sy != null && it.sx >= -it.w / 2 && it.sx <= view.w + it.w / 2 && it.sy >= -it.h / 2 && it.sy <= view.h + it.h / 2)
    .sort((a, b) => b.it.prio - a.it.prio || a.it.d - b.it.d);
  const placed: [number, number, number, number][] = [];
  for (const { it, i } of order) {
    if (placed.length >= max) break;
    const r: [number, number, number, number] = [it.sx! - it.w / 2, it.sy! - it.h / 2, it.sx! + it.w / 2, it.sy! + it.h / 2];
    if (placed.some((q) => r[0] < q[2] && r[2] > q[0] && r[1] < q[3] && r[3] > q[1])) continue;
    placed.push(r);
    show[i] = true;
  }
  return show;
}
