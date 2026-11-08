import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { SITES, neighborhoodUrl } from './neighborhood';

const dir = path.resolve(__dirname, '../../public/neighborhoods');
const has = fs.existsSync(dir);

describe.skipIf(!has)('동네 월드 파일', () => {
  for (const s of SITES) {
    it(`${s.id} ${s.name}: 파일·구조·크기`, () => {
      const f = path.join(dir, `${s.id}.json`);
      expect(fs.existsSync(f), `${neighborhoodUrl(s.id)} 없음`).toBe(true);
      expect(fs.statSync(f).size).toBeLessThan(1.5 * 1024 * 1024);
      const w = JSON.parse(fs.readFileSync(f, 'utf8'));
      expect(w.site.id).toBe(s.id);
      expect(w.terrain.data.length).toBe(w.terrain.w * w.terrain.h);
      expect(w.terrain.data.every((v: number) => Number.isFinite(v) && v >= 0)).toBe(true);
      expect(w.buildings.length).toBeGreaterThan(20);
      expect(w.roads.length).toBeGreaterThan(0);
      expect(w.landmarks).toEqual([]);
      // 집 좌표는 조각 안쪽, 대상 건물이 있다
      const { minX, maxX, minZ, maxZ } = w.bounds;
      expect(s.x).toBeGreaterThan(minX + 50); expect(s.x).toBeLessThan(maxX - 50);
      expect(s.z).toBeGreaterThan(minZ + 50); expect(s.z).toBeLessThan(maxZ - 50);
      expect(w.site.target.buildingId).toBeTruthy();
      // 반쪽 건물 금지: 모든 건물 꼭짓점이 조각 + 20m 안
      for (const b of w.buildings) for (const [x, z] of b.pts) { expect(x).toBeGreaterThan(minX - 21); expect(x).toBeLessThan(maxX + 21); expect(z).toBeGreaterThan(minZ - 21); expect(z).toBeLessThan(maxZ + 21); }
    });
  }
});
