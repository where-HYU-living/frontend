import { describe, expect, it } from 'vitest';
import { findGrandPitch, pitchLines, pitchRect, ribbonMesh, toWorld, turfMesh } from './pitch';
import world from '../../public/world.json';

const flat = () => 10;
describe('대운동장 축구장', () => {
  const f = findGrandPitch((world as any).areas)!;
  it('월드 데이터에서 99.8×66.8m 경기장을 찾는다', () => {
    expect(f).not.toBeNull();
    expect(f.length).toBeCloseTo(99.8, 0);
    expect(f.width).toBeCloseTo(66.8, 0);
    expect(Math.hypot(f.cx - 289, f.cz - 70)).toBeLessThan(5);
  });
  it('초대 링크 자리가 경기장 안', () => {
    const r = pitchRect(f);
    const [x0, z0] = r[0], [x1, z1] = r[2];
    expect(Math.min(x0, x1)).toBeLessThan(288.26);
    expect(Math.max(x0, x1)).toBeGreaterThan(288.26);
    expect(Math.min(z0, z1)).toBeLessThan(58.51);
  });
  it('toWorld 는 길이 방향으로 length 만큼 떨어진 두 점을 낸다', () => {
    const a = toWorld(f, -f.length / 2, 0), b = toWorld(f, f.length / 2, 0);
    expect(Math.hypot(a[0] - b[0], a[1] - b[1])).toBeCloseTo(f.length, 5);
  });
  it('라인: 규격 박스와 서클이 경기장 안에 있다', () => {
    const lines = pitchLines(f.length, f.width);
    expect(lines.length).toBeGreaterThan(15);
    for (const l of lines) for (const [x, z] of l.pts) {
      expect(Math.abs(x)).toBeLessThanOrEqual(f.length / 2 + 1e-6);
      expect(Math.abs(z)).toBeLessThanOrEqual(f.width / 2 + 1e-6);
    }
  });
  it('메쉬: 삼각형 법선이 모두 위, 정점 수 유한', () => {
    for (const m of [ribbonMesh(pitchLines(f.length, f.width).map((l) => ({ w: l.w, pts: l.pts.map(([x, z]) => toWorld(f, x, z)) })), flat), turfMesh(f, flat)]) {
      expect(m.position.length / 3).toBeLessThan(20000);
      for (let i = 0; i < m.index.length; i += 3) {
        const p = (k: number) => [m.position[m.index[i + k] * 3], m.position[m.index[i + k] * 3 + 2]];
        const [a, b, c] = [p(0), p(1), p(2)];
        // 위에서 봤을 때 (x 동, z 남) 시계/반시계 중 위를 보는 방향: 외적 y = (b-a)×(c-a) in x,z → >0 이면 법선 -y? 아래 식은 ribbon 과 동일한 규칙
        const ny = (b[1] - a[1]) * (c[0] - a[0]) - (b[0] - a[0]) * (c[1] - a[1]);
        expect(ny).toBeGreaterThanOrEqual(-1e-9);
      }
    }
  });
});
