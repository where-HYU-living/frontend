import * as THREE from 'three';

export type V3 = [number, number, number];
export type Pt = [number, number];

/**
 * 재질 키. 같은 키의 조각은 한 지오메트리로 합쳐져 한 번의 draw call 로 그려진다.
 * 색은 정점 색(vertexColors)으로 입혀서, 키가 같으면 색이 달라도 한 덩어리다.
 */
export type MatKey = 'paint' | 'wallTile' | 'concrete' | 'wood' | 'tile' | 'vinyl' | 'ceiling' | 'trim' | 'matte' | 'gloss' | 'metal' | 'glass' | 'lamp';
export type Color = string | number;
export type Face = { key: MatKey; color?: Color };
export type FaceName = 'px' | 'nx' | 'py' | 'ny' | 'pz' | 'nz';

type Bucket = { pos: number[]; nor: number[]; uv: number[]; col: number[]; idx: number[] };

const tmpColor = new THREE.Color();
/** 문자열·hex 색 → 작업 색공간(선형) rgb. 정점 색 속성은 선형값이어야 한다 */
function rgb(c: Color | undefined): V3 {
  tmpColor.set(c ?? '#ffffff');
  return [tmpColor.r, tmpColor.g, tmpColor.b];
}

/** 로컬 → 월드: Y 회전. three 의 mesh.rotation.y 와 같은 방향 (x' = x cos + z sin, z' = -x sin + z cos) */
export function rotY(x: number, z: number, a: number): [number, number] {
  const c = Math.cos(a), s = Math.sin(a);
  return [x * c + z * s, -x * s + z * c];
}

const HALF: Record<FaceName, { n: V3; c: (hx: number, hy: number, hz: number) => V3[] }> = {
  px: { n: [1, 0, 0], c: (x, y, z) => [[x, -y, z], [x, -y, -z], [x, y, -z], [x, y, z]] },
  nx: { n: [-1, 0, 0], c: (x, y, z) => [[-x, -y, -z], [-x, -y, z], [-x, y, z], [-x, y, -z]] },
  py: { n: [0, 1, 0], c: (x, y, z) => [[-x, y, z], [x, y, z], [x, y, -z], [-x, y, -z]] },
  ny: { n: [0, -1, 0], c: (x, y, z) => [[-x, -y, -z], [x, -y, -z], [x, -y, z], [-x, -y, z]] },
  pz: { n: [0, 0, 1], c: (x, y, z) => [[-x, -y, z], [x, -y, z], [x, y, z], [-x, y, z]] },
  nz: { n: [0, 0, -1], c: (x, y, z) => [[x, -y, -z], [-x, -y, -z], [-x, y, -z], [x, y, -z]] },
};
const FACE_NAMES: FaceName[] = ['px', 'nx', 'py', 'ny', 'pz', 'nz'];

export type BoxSpec = {
  center: V3; size: V3; rotY?: number;
  /** 면별 재질. 없는 면은 all, all 도 없으면 그리지 않는다. null 이면 그 면은 건너뜀 */
  faces?: Partial<Record<FaceName, Face | null>>; all?: Face;
  /** 긴 면(±z)의 가로 UV 시작값(m). 벽 조각이 이어져도 무늬가 끊기지 않게 벽 위 거리를 준다 */
  uBase?: number;
};

export type CylSpec = {
  /** 밑면 중심 */ center: V3; rx: number; rz?: number; h: number; seg?: number;
  key: MatKey; color?: Color; rotY?: number; /** 윗면 반지름 비율(0~1, 기본 1) */ top?: number; capTop?: boolean; capBottom?: boolean;
};

/**
 * 재질 키별로 정점을 모아 두었다가 BufferGeometry 로 내보내는 도우미. three 장면 없이도 돌아서 순수 테스트가 된다.
 * UV 는 미터 단위(텍스처 repeat 을 1/타일크기 로 맞춘다).
 */
export class MeshBuilder {
  readonly buckets = new Map<MatKey, Bucket>();

  private bucket(key: MatKey): Bucket {
    let b = this.buckets.get(key);
    if (!b) { b = { pos: [], nor: [], uv: [], col: [], idx: [] }; this.buckets.set(key, b); }
    return b;
  }

  private push(b: Bucket, p: V3, n: V3, uv: Pt, c: V3) {
    b.pos.push(p[0], p[1], p[2]); b.nor.push(n[0], n[1], n[2]); b.uv.push(uv[0], uv[1]); b.col.push(c[0], c[1], c[2]);
    return b.pos.length / 3 - 1;
  }

  /** 네 꼭짓점(바깥에서 봐서 반시계) 사각형 */
  quad(key: MatKey, p: [V3, V3, V3, V3], n: V3, uvs: [Pt, Pt, Pt, Pt], color?: Color) {
    const b = this.bucket(key), c = rgb(color);
    const i = p.map((v, k) => this.push(b, v, n, uvs[k], c));
    b.idx.push(i[0], i[1], i[2], i[0], i[2], i[3]);
  }

  box(s: BoxSpec) {
    const [hx, hy, hz] = [s.size[0] / 2, s.size[1] / 2, s.size[2] / 2];
    if (!(hx > 1e-6 && hy > 1e-6 && hz > 1e-6)) return;
    const a = s.rotY ?? 0;
    const toWorld = (l: V3): V3 => { const [x, z] = rotY(l[0], l[2], a); return [s.center[0] + x, s.center[1] + l[1], s.center[2] + z]; };
    for (const f of FACE_NAMES) {
      const face = s.faces && f in s.faces ? s.faces[f] : s.all;
      if (!face) continue;
      const def = HALF[f];
      const local = def.c(hx, hy, hz);
      const uvOf = (l: V3): Pt => {
        if (f === 'pz' || f === 'nz') return [(s.uBase ?? 0) + l[0] + hx, s.center[1] + l[1]];
        if (f === 'px' || f === 'nx') return [l[2] + hz, s.center[1] + l[1]];
        return [l[0] + hx, l[2] + hz];
      };
      const [nx, nz] = rotY(def.n[0], def.n[2], a);
      this.quad(face.key, local.map(toWorld) as [V3, V3, V3, V3], [nx, def.n[1], nz], local.map(uvOf) as [Pt, Pt, Pt, Pt], face.color);
    }
  }

  /** 세로축 원기둥/타원기둥/원뿔대. 옆면은 매끈한 법선 */
  cyl(s: CylSpec) {
    const seg = s.seg ?? 14, rx = s.rx, rz = s.rz ?? s.rx, top = s.top ?? 1, a = s.rotY ?? 0;
    const b = this.bucket(s.key), c = rgb(s.color);
    const toWorld = (x: number, y: number, z: number): V3 => { const [wx, wz] = rotY(x, z, a); return [s.center[0] + wx, s.center[1] + y, s.center[2] + wz]; };
    const circ = Math.PI * (rx + rz);
    const ring = (y: number, k: number, v: number, i: number): number => {
      const t = (i / seg) * Math.PI * 2, cx = Math.cos(t), sz = Math.sin(t);
      const [nxl, nzl] = [cx / rx, sz / rz]; const l = Math.hypot(nxl, nzl) || 1;
      const [nx, nz] = rotY(nxl / l, nzl / l, a);
      return this.push(b, toWorld(cx * rx * k, y, sz * rz * k), [nx, 0, nz], [(i / seg) * circ, v], c);
    };
    for (let i = 0; i < seg; i++) {
      const b0 = ring(0, 1, s.center[1], i), b1 = ring(0, 1, s.center[1], i + 1);
      const t0 = ring(s.h, top, s.center[1] + s.h, i), t1 = ring(s.h, top, s.center[1] + s.h, i + 1);
      b.idx.push(b0, t1, b1, b0, t0, t1);
    }
    const cap = (y: number, k: number, up: boolean) => {
      const n: V3 = [0, up ? 1 : -1, 0];
      const mid = this.push(b, toWorld(0, y, 0), n, [0, 0], c);
      const vs: number[] = [];
      for (let i = 0; i <= seg; i++) {
        const t = (i / seg) * Math.PI * 2;
        vs.push(this.push(b, toWorld(Math.cos(t) * rx * k, y, Math.sin(t) * rz * k), n, [Math.cos(t) * rx * k, Math.sin(t) * rz * k], c));
      }
      for (let i = 0; i < seg; i++) b.idx.push(...(up ? [mid, vs[i + 1], vs[i]] : [mid, vs[i], vs[i + 1]]));
    };
    if (s.capTop !== false) cap(s.h, top, true);
    if (s.capBottom) cap(0, 1, false);
  }

  /** 평면 다각형(바닥·천장). pts = [x, z] 장면 좌표, up=true 면 위를 보는 면 */
  flat(key: MatKey, pts: Pt[], y: number, up: boolean, color?: Color) {
    if (pts.length < 3) return;
    const tris = THREE.ShapeUtils.triangulateShape(pts.map(([x, z]) => new THREE.Vector2(x, z)), []);
    const b = this.bucket(key), c = rgb(color), n: V3 = [0, up ? 1 : -1, 0];
    const base = b.pos.length / 3;
    pts.forEach(([x, z]) => this.push(b, [x, y, z], n, [x, z], c));
    for (const [i, j, k] of tris) {
      const ny = (pts[j][1] - pts[i][1]) * (pts[k][0] - pts[i][0]) - (pts[j][0] - pts[i][0]) * (pts[k][1] - pts[i][1]);
      b.idx.push(base + i, ...(ny > 0 === up ? [base + j, base + k] : [base + k, base + j]));
    }
  }

  isEmpty(): boolean { return this.buckets.size === 0; }

  /** 재질 키 → 정점·삼각형 수 (테스트·성능 확인용) */
  stats(): Record<string, { verts: number; tris: number }> {
    const out: Record<string, { verts: number; tris: number }> = {};
    for (const [k, b] of this.buckets) out[k] = { verts: b.pos.length / 3, tris: b.idx.length / 3 };
    return out;
  }

  toGeometries(): Partial<Record<MatKey, THREE.BufferGeometry>> {
    const out: Partial<Record<MatKey, THREE.BufferGeometry>> = {};
    for (const [k, b] of this.buckets) {
      if (!b.idx.length) continue;
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(b.pos, 3));
      g.setAttribute('normal', new THREE.Float32BufferAttribute(b.nor, 3));
      g.setAttribute('uv', new THREE.Float32BufferAttribute(b.uv, 2));
      g.setAttribute('color', new THREE.Float32BufferAttribute(b.col, 3));
      g.setIndex(new THREE.Uint32BufferAttribute(b.idx, 1));
      g.computeBoundingSphere();
      out[k] = g;
    }
    return out;
  }
}
