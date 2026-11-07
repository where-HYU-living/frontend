/** M2: 가로등 위치 — 도로 샘플에서 일정 간격으로, 길 옆으로 비껴서 (순수 함수) */
export type RoadLike = { kind: string; w: number; pts: [number, number][] };

/** 밤 시간대(t>0.5)일 때만 보인다. 켜짐 정도 0~1 (0.5 → 0, 0.7 → 1) */
export const lampGlow = (t: number): number => Math.min(1, Math.max(0, (t - 0.5) / 0.2));

export function sampleLamps(roads: readonly RoadLike[], opt: { spacing?: number; kinds?: string[]; max?: number } = {}): [number, number][] {
  const spacing = opt.spacing ?? 30, kinds = opt.kinds ?? ['road', 'foot'], max = opt.max ?? 500;
  const out: [number, number][] = [];
  let side = 1;
  for (const r of roads) {
    if (!kinds.includes(r.kind) || r.pts.length < 2) continue;
    let carry = spacing / 2; // 길마다 첫 가로등은 절반 간격에서
    for (let i = 1; i < r.pts.length; i++) {
      const [ax, az] = r.pts[i - 1], [bx, bz] = r.pts[i];
      const dx = bx - ax, dz = bz - az, L = Math.hypot(dx, dz);
      if (L < 1e-6) continue;
      const nx = -dz / L, nz = dx / L, off = r.w / 2 + 0.8;
      for (let s = carry; s <= L; s += spacing) {
        if (out.length >= max) return out;
        out.push([ax + (dx * s) / L + nx * off * side, az + (dz * s) / L + nz * off * side]);
        side = -side;
        carry = s + spacing;
      }
      carry -= L;
    }
  }
  return out;
}
