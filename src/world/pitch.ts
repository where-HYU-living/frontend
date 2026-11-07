/**
 * 대운동장 축구장 계산 (순수 함수 — 3D 장면 없이 테스트한다). 좌표는 월드 좌표: x=동, z=남 (m), 원점 = 사자상.
 * 그리는 쪽은 src/zones/stadium.js.
 */
export type Pt = [number, number];
export type Area = { cls: string; sub?: string; pts: Pt[] };

/** 경기장의 기준틀: 중심, 긴 변 방향 단위벡터 u=(ux,uz), 긴 변 length, 짧은 변 width. 폭 방향 v = (-uz, ux) */
export type PitchFrame = { cx: number; cz: number; ux: number; uz: number; length: number; width: number };

/**
 * 한양대 대운동장 축구장: OSM way 1068544580 (leisure=pitch, sport=soccer). 월드 데이터(areas)에는 종목 정보가 없어서
 * 4점짜리 pitch 중 이 근처(중심 20m 이내)에 있는 것으로 고른다. 같은 4점 pitch 가 야구장·살곶이체육공원 축구장에도 있어 위치로만 가려낼 수 있다.
 * 실제 모양은 99.8 × 66.8m 직사각형이 동쪽으로 13° 기울어 있다.
 */
export const GRAND_FIELD_NEAR: Pt = [289, 70];

export function findGrandPitch(areas: Area[], near: Pt = GRAND_FIELD_NEAR): PitchFrame | null {
  for (const a of areas) {
    if (a.sub !== 'pitch' || a.pts.length !== 4) continue;
    const cx = a.pts.reduce((s, p) => s + p[0], 0) / 4, cz = a.pts.reduce((s, p) => s + p[1], 0) / 4;
    if (Math.hypot(cx - near[0], cz - near[1]) > 20) continue;
    const e0: Pt = [a.pts[1][0] - a.pts[0][0], a.pts[1][1] - a.pts[0][1]], e1: Pt = [a.pts[2][0] - a.pts[1][0], a.pts[2][1] - a.pts[1][1]];
    const l0 = Math.hypot(...e0), l1 = Math.hypot(...e1);
    const long = l0 >= l1 ? e0 : e1, L = Math.max(l0, l1), W = Math.min(l0, l1);
    let ux = long[0] / L, uz = long[1] / L;
    if (ux < 0) { ux = -ux; uz = -uz; } // 방향은 동쪽을 향하게 통일 (정사각형에 가까워 ux≈0 인 경우는 없다)
    return { cx, cz, ux, uz, length: L, width: W };
  }
  return null;
}

/** 경기장 로컬 좌표(lx: 긴 변 방향, lz: 짧은 변 방향, 중심이 원점) → 월드 좌표 */
export const toWorld = (f: PitchFrame, lx: number, lz: number): Pt => [f.cx + lx * f.ux - lz * f.uz, f.cz + lx * f.uz + lz * f.ux];

export type Line = { pts: Pt[]; w: number };

const arc = (cx: number, cz: number, r: number, a0: number, a1: number, n: number): Pt[] =>
  Array.from({ length: n + 1 }, (_, i) => { const a = a0 + ((a1 - a0) * i) / n; return [cx + Math.cos(a) * r, cz + Math.sin(a) * r] as Pt; });

/**
 * 축구장 라인 (로컬 좌표). 규격(IFAB): 센터서클 반지름 9.15, 페널티 박스 16.5 × 40.32, 골 박스 5.5 × 18.32,
 * 페널티 마크 11m, 페널티 아크 반지름 9.15 (박스 밖 부분), 코너 아크 반지름 1. 라인 폭은 보기 좋게 0.16m.
 * 크기가 달라도 박스·서클은 규격 그대로고 바깥 경계선만 length × width 를 따른다.
 */
export function pitchLines(length: number, width: number): Line[] {
  const L2 = length / 2, W2 = width / 2, w = 0.16, out: Line[] = [];
  out.push({ pts: [[-L2, -W2], [L2, -W2], [L2, W2], [-L2, W2], [-L2, -W2]], w }); // 터치라인·골라인
  out.push({ pts: [[0, -W2], [0, W2]], w }); // 하프라인
  out.push({ pts: arc(0, 0, 9.15, 0, Math.PI * 2, 72), w }); // 센터서클
  out.push({ pts: arc(0, 0, 0.15, 0, Math.PI * 2, 10), w: 0.3 }); // 센터 마크
  for (const s of [-1, 1]) {
    const x0 = s * L2;
    out.push({ pts: [[x0, -20.16], [x0 - s * 16.5, -20.16], [x0 - s * 16.5, 20.16], [x0, 20.16]], w }); // 페널티 박스
    out.push({ pts: [[x0, -9.16], [x0 - s * 5.5, -9.16], [x0 - s * 5.5, 9.16], [x0, 9.16]], w }); // 골 박스
    const px = x0 - s * 11;
    out.push({ pts: arc(px, 0, 0.15, 0, Math.PI * 2, 10), w: 0.3 }); // 페널티 마크
    const half = Math.acos(5.5 / 9.15); // 페널티 아크는 박스 선(16.5m) 바깥, 경기장 안쪽으로 나온 부분만
    const base = s > 0 ? Math.PI : 0;
    out.push({ pts: arc(px, 0, 9.15, base - half, base + half, 24), w });
    for (const t of [-1, 1]) { // 코너 아크: 코너에서 경기장 안쪽 사분원
      const cx = x0, cz = t * W2;
      const a0 = s > 0 ? (t > 0 ? Math.PI : Math.PI * 0.5) : (t > 0 ? Math.PI * 1.5 : 0);
      out.push({ pts: arc(cx, cz, 1, a0, a0 + Math.PI / 2, 8), w: 0.12 });
    }
  }
  return out;
}

const densify = (pts: Pt[], step: number): Pt[] => {
  const out: Pt[] = [pts[0]];
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1], b = pts[i], n = Math.max(1, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / step));
    for (let k = 1; k <= n; k++) out.push([a[0] + ((b[0] - a[0]) * k) / n, a[1] + ((b[1] - a[1]) * k) / n]);
  }
  return out;
};

export type Mesh3 = { position: Float32Array; index: Uint32Array; uv?: Float32Array };

/**
 * 월드 좌표 선들을 지형을 따라가는 띠 메쉬로. 선을 step(m) 이하 조각으로 나눠 조각마다 네 꼭짓점의 높이를 지형에서 읽는다.
 * 각 조각은 양 끝을 폭/2 만큼 늘려서 모서리 틈과 아크의 이음매를 덮는다. 위를 보는 면만 만든다.
 */
export function ribbonMesh(lines: Line[], heightAt: (x: number, z: number) => number, lift = 0.08, step = 1.5): Mesh3 {
  const pos: number[] = [], idx: number[] = [];
  for (const { pts, w } of lines) {
    const d = densify(pts, step);
    for (let i = 1; i < d.length; i++) {
      const a = d[i - 1], b = d[i], dx = b[0] - a[0], dz = b[1] - a[1], L = Math.hypot(dx, dz) || 1;
      const tx = dx / L, tz = dz / L, nx = -tz * (w / 2), nz = tx * (w / 2), ex = tx * (w / 2), ez = tz * (w / 2);
      const A: Pt = [a[0] - ex + nx, a[1] - ez + nz], B: Pt = [a[0] - ex - nx, a[1] - ez - nz], C: Pt = [b[0] + ex - nx, b[1] + ez - nz], D: Pt = [b[0] + ex + nx, b[1] + ez + nz];
      const base = pos.length / 3;
      for (const p of [A, B, C, D]) pos.push(p[0], heightAt(p[0], p[1]) + lift, p[1]);
      // (A,B,C) 가 위를 보도록: n_y = (B-A)×(C-A) 의 y 성분
      const ny = (B[1] - A[1]) * (C[0] - A[0]) - (B[0] - A[0]) * (C[1] - A[1]);
      if (ny > 0) idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
      else idx.push(base, base + 2, base + 1, base, base + 3, base + 2);
    }
  }
  return { position: new Float32Array(pos), index: new Uint32Array(idx) };
}

/** 경기장 잔디 바닥판: cell(m) 격자, 꼭짓점 높이는 지형을 따른다. uv.x 는 긴 변 방향 0→1 (줄무늬용), uv.y 는 폭 방향 */
export function turfMesh(f: PitchFrame, heightAt: (x: number, z: number) => number, lift = 0.05, cell = 2): Mesh3 {
  const nx = Math.max(1, Math.ceil(f.length / cell)), nz = Math.max(1, Math.ceil(f.width / cell));
  const pos: number[] = [], uv: number[] = [], idx: number[] = [];
  for (let j = 0; j <= nz; j++) for (let i = 0; i <= nx; i++) {
    const lx = (i / nx - 0.5) * f.length, lz = (j / nz - 0.5) * f.width, [x, z] = toWorld(f, lx, lz);
    pos.push(x, heightAt(x, z) + lift, z); uv.push(i / nx, j / nz);
  }
  const at = (i: number, j: number) => j * (nx + 1) + i;
  for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) {
    const a = at(i, j), b = at(i + 1, j), c = at(i + 1, j + 1), d = at(i, j + 1);
    // 로컬 (lx, lz) → 월드는 회전만(뒤집힘 없음)이라 (a,d,c)/(a,c,b) 가 위를 본다
    idx.push(a, d, c, a, c, b);
  }
  return { position: new Float32Array(pos), index: new Uint32Array(idx), uv: new Float32Array(uv) };
}

/** 사각형 다각형(월드 좌표). 나무를 심지 않을 영역 등에 쓴다. pad = 바깥으로 넓힐 m */
export function pitchRect(f: PitchFrame, pad = 0): Pt[] {
  const L2 = f.length / 2 + pad, W2 = f.width / 2 + pad;
  return [toWorld(f, -L2, -W2), toWorld(f, L2, -W2), toWorld(f, L2, W2), toWorld(f, -L2, W2)];
}
