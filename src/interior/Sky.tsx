import { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import { MeshBuilder } from './meshBuilder';

type Phase = { top: number; horizon: number; skyline: number };
const PHASES: { day: Phase; evening: Phase; night: Phase } = {
  day: { top: 0x74abea, horizon: 0xe3eef8, skyline: 0xb4c0cc },
  evening: { top: 0x5a76a4, horizon: 0xf4bb92, skyline: 0x85727a },
  night: { top: 0x070c1a, horizon: 0x26304b, skyline: 0x151b2c },
};
const mix = (a: number, b: number, k: number) => new THREE.Color(a).lerp(new THREE.Color(b), k);

/** 시간대 슬라이더 t(0 낮 → 0.5 저녁 → 1 밤) 의 하늘 색 */
export function skyAt(t: number) {
  const x = Math.min(1, Math.max(0, t)), [a, b, k] = x < 0.5 ? [PHASES.day, PHASES.evening, x / 0.5] as const : [PHASES.evening, PHASES.night, (x - 0.5) / 0.5] as const;
  return { top: mix(a.top, b.top, k), horizon: mix(a.horizon, b.horizon, k), skyline: mix(a.skyline, b.skyline, k) };
}

/** 창밖 도시 느낌: 사방에 흩어진 건물 덩어리 (정점 색으로 명암만, 한 번에 그린다) */
export function buildSkylineGeometry(): THREE.BufferGeometry {
  const mb = new MeshBuilder();
  let a = 7;
  const r = () => { a = (a * 1664525 + 1013904223) >>> 0; return a / 4294967296; };
  const N = 44;
  for (let i = 0; i < N; i++) {
    const ang = (i / N) * Math.PI * 2 + (r() - 0.5) * 0.12, dist = 24 + r() * 22;
    const w = 3 + r() * 6, d = 3 + r() * 6, h = 6 + r() * 34 + (dist > 38 ? 8 : 0);
    const shade = 0.62 + r() * 0.34;
    const col = new THREE.Color(shade, shade, shade).getHex();
    mb.box({ center: [Math.cos(ang) * dist, h / 2 - 28, Math.sin(ang) * dist], size: [w, h + 28, d], rotY: r() * Math.PI, all: { key: 'matte', color: col }, faces: { ny: null } });
  }
  return mb.toGeometries().matte!;
}

/** 하늘 돔 + 창밖 스카이라인. 방 중심에 놓고 시간대에 따라 색을 바꾼다 */
export function Sky({ center, t }: { center: [number, number]; t: number }) {
  const c = useMemo(() => skyAt(t), [t]);
  const dome = useMemo(() => {
    const g = new THREE.SphereGeometry(60, 24, 14);
    g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(g.getAttribute('position').count * 3), 3));
    return g;
  }, []);
  const skyline = useMemo(buildSkylineGeometry, []);

  useEffect(() => {
    const pos = dome.getAttribute('position'), col = dome.getAttribute('color') as THREE.BufferAttribute, tmp = new THREE.Color();
    for (let i = 0; i < pos.count; i++) {
      const k = THREE.MathUtils.smoothstep(pos.getY(i) / 60, -0.02, 0.7);
      tmp.copy(c.horizon).lerp(c.top, k);
      if (pos.getY(i) < 0) tmp.multiplyScalar(0.88); // 지평선 아래는 안개 낀 지면
      col.setXYZ(i, tmp.r, tmp.g, tmp.b);
    }
    col.needsUpdate = true;
  }, [dome, c]);
  useEffect(() => () => { dome.dispose(); skyline.dispose(); }, [dome, skyline]);

  return (
    <group position={[center[0], 0, center[1]]}>
      <mesh geometry={dome} renderOrder={-10} frustumCulled={false}>
        <meshBasicMaterial vertexColors side={THREE.BackSide} depthWrite={false} fog={false} />
      </mesh>
      <mesh geometry={skyline} frustumCulled={false}>
        <meshBasicMaterial vertexColors color={c.skyline} fog={false} />
      </mesh>
    </group>
  );
}
