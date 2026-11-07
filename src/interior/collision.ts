import type { Box } from './buildInterior';

/**
 * 벽 조각(Y회전 직육면체)과 반경 r 원의 충돌.
 * 바닥에서 0.9m 위에서 시작하는 조각(문 위 인방·창 위)과 낮은 조각(0.5m 미만)은 막지 않는다.
 */
export function isBlocked(pieces: Box[], x: number, z: number, radius = 0.25): boolean {
  return pieces.some((b) => {
    if (b.size[1] < 0.5 || b.center[1] - b.size[1] / 2 > 0.9) return false;
    const c = Math.cos(b.rotationY), s = Math.sin(b.rotationY);
    const dx = x - b.center[0], dz = z - b.center[2];
    const lx = dx * c - dz * s, lz = dx * s + dz * c; // 박스 로컬 (Y회전 역변환)
    return Math.abs(lx) < b.size[0] / 2 + radius && Math.abs(lz) < b.size[2] / 2 + radius;
  });
}

/** 축마다 따로 막아 벽을 따라 미끄러지게 */
export function slideMove(pieces: Box[], from: [number, number], to: [number, number], radius = 0.25): [number, number] {
  let [x, z] = from;
  if (!isBlocked(pieces, to[0], z, radius)) x = to[0];
  if (!isBlocked(pieces, x, to[1], radius)) z = to[1];
  return [x, z];
}
