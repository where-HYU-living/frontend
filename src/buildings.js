import * as THREE from 'three';
import { loadTex, hash, rng, polyArea, pointInPoly, PolyIndex } from './util.js';
import { facadeTexture as lookFacade } from './facade.js';

// 손으로 만들지 않은 모든 건물을 그리는 범용 렌더러.
//  - 벽: 외관 조사(look) 의 색·재질·창 패턴 텍스처, 조사 없는 건물은 이름·종류·위치로 정한 결정적 외관
//  - 경사지: 아래쪽에 드러난 기단(화강석/콘크리트)을 깔고, 창 격자는 위쪽 출입 레벨에서 시작
//  - 지붕: 평지붕(파라펫 + 큰 지붕엔 옥탑·설비 상자) / 박공 / 모임
// 성능: 건물마다 메시를 두지 않고 (재질 × 150m 칸) 단위로 정점 배열을 모아 한 메시로 만든다.

const FLOOR = 3.6;
const PARAPET = 0.9; // 평지붕 난간 높이
const CELL = 150; // 고유 외관 재질
const CELL_SHARED = 300; // 여러 건물이 함께 쓰는 재질(지붕·기단·자동 외관): 삼각형이 적어 큰 칸으로 묶어 호출 수를 줄인다
const WALL_V = 0.04; // 파라펫·박공벽 uv(v, m): 파사드 타일 맨 아래 "창 없는 벽" 줄

// ---------- 조사 없는 건물의 결정적 외관 (이름·종류·위치 → 팔레트 → 해시로 고름)
// 지역 범위는 campus-data site.json 중심 좌표 기준
const REGIONS = [
  { cat: 'hospital', x0: -275, x1: 75, z0: -470, z1: -295 }, // 604~614 의료원·병원
  { cat: 'dorm', x0: 90, x1: 245, z0: -405, z1: -325 }, // 801·802·803 생활관
  { cat: 'dorm', x0: 375, x1: 505, z0: -545, z1: -370 }, // 804~807 테크노·개나리·한누리·게스트하우스
  { cat: 'dorm', x0: 80, x1: 140, z0: -780, z1: -620 }, // 809·810
  { cat: 'hywu', x0: 365, x1: 565, z0: -345, z1: -160 }, // 한양여대·한양초
];
const L = (mat, color, pattern, frame, glass, floorH = null) => ({ wall: { mat, color }, window: { pattern, frame, glass, floorH } });
const AUTO = {
  hospital: [
    L('타일', '#e8e6e0', '흰 벽 + 진회색 가로 띠, 층마다 개별 사각창 반복(병실창)', '#8f9aa0', '#3d5c5a', 3.8),
    L('금속 패널', '#dcdfe0', '가로 띠창, 슬래브 띠', '#7d868b', '#3f5f6b', 3.8),
  ],
  dorm: [
    L('붉은 벽돌', '#9b5b45', '격자 개별창(층마다 작은 창 1~2개씩), 창 밖 실외기', '#e6e2da', '#3a4652', 3.0),
    L('도장(페인트)', '#e4d9c2', '격자 개별창, 창 밖 실외기', '#6b6a66', '#3a4652', 3.0),
  ],
  hywu: [
    L('베이지 화강석', '#dcd3c1', '격자 개별창(세로로 긴 창)', '#4a4f55', '#3c5560'),
    L('도장(페인트)', '#ece6d8', '가로 띠창, 슬래브 띠', '#5a5f63', '#3c5560'),
  ],
  house: [
    L('붉은 벽돌', '#8e5442', '작은 정사각 개별창', '#e8e4dc', '#36414c', 2.9),
    L('도장(페인트)', '#e9e1cf', '격자 개별창, 창 위 차양', '#7a756c', '#36414c', 2.9),
  ],
  campus: [
    L('베이지 화강석', '#d8d0bf', '격자 개별창(가로로 긴 사각창)', '#4a4f55', '#3f5a66'),
    L('도장(페인트)', '#e4ddcf', '가로 띠창', '#5a5f63', '#3f5a66'),
    L('붉은 벽돌', '#a0634a', '격자 개별창, 창 아래 석재 띠', '#e3ded3', '#36444f'),
    L('타일', '#cfc3ac', '격자 개별창(세로로 긴 창)', '#5d5a54', '#35424e'),
  ],
  city: [
    L('도장(페인트)', '#e7e1d4', '격자 개별창, 창 밖 실외기', '#6b6a66', '#34424f', 3.0),
    L('붉은 벽돌', '#93594a', '격자 개별창', '#e6e2da', '#34424f', 3.0),
    L('타일', '#d4c8b2', '가로로 긴 개별창', '#5d5a54', '#34424f', 3.2),
    L('노출 콘크리트', '#b7b4ac', '가로 띠창', '#55595c', '#3a4a55'),
  ],
  station: [L('금속 패널', '#c4c8ca', '가로 띠창, 층마다 수평 차양', '#7d868b', '#3f5f6b', 4.2)],
  tower: [L('유리 커튼월', '#5d7480', '유리 커튼월(가로 멀리언 강조)', '#9aa3a8', '#5d7480', 3.8)],
};
const PITCH_COLORS = ['#5a5f66', '#7b4434', '#4e6a5a', '#8a6a4a'];

function autoCategory(b, cx, cz, h) {
  const n = b.name || '';
  if (/병원|의료|의학/.test(n)) return 'hospital';
  if (/기숙|생활관|학사|숙사|게스트하우스/.test(n)) return 'dorm';
  if (/여자대학|여대/.test(n)) return 'hywu';
  if (b.kind === 'train_station') return 'station';
  for (const r of REGIONS) if (cx >= r.x0 && cx <= r.x1 && cz >= r.z0 && cz <= r.z1) return r.cat;
  if (b.kind === 'house' || b.kind === 'residential') return 'house';
  if (/school|university|public/.test(b.kind)) return 'campus';
  if (h > 30 && hash(b.id % 9973) < 0.5) return 'tower';
  return 'city';
}
function autoLook(b, cx, cz, h, area, fill) {
  const cat = autoCategory(b, cx, cz, h);
  const pal = AUTO[cat];
  const look = { ...pal[Math.floor(hash(b.id % 100000) * pal.length)], auto: cat };
  // 작은 단독주택은 박공·모임지붕 (사각형에 가까울 때만)
  if (b.kind === 'house' && area < 300 && fill > 0.8) {
    const r = hash((b.id % 7919) + 3);
    look.roof = r < 0.5 ? 'gable' : 'hip';
    look.roofColor = PITCH_COLORS[Math.floor(r * 2 * PITCH_COLORS.length) % PITCH_COLORS.length];
  }
  return look;
}
function roofKind(look) {
  const r = String(look?.roof || '');
  if (/gable|박공|맞배/.test(r)) return 'gable';
  if (/hip|모임|우진각|pyramid|mansard|맨사드/.test(r)) return 'hip';
  return 'flat';
}

// ---------- 기하 도구
// 최소 면적 사각형 (hero.js 와 같은 방법) → 중심 c, 긴 축 U, 짧은 축 V, 길이 lu ≥ lv
function obb(pts) {
  let best = null;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i], b = pts[(i + 1) % pts.length];
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]); if (len < 0.5) continue;
    const ux = (b[0] - a[0]) / len, uz = (b[1] - a[1]) / len, vx = -uz, vz = ux;
    let u0 = Infinity, u1 = -Infinity, v0 = Infinity, v1 = -Infinity;
    for (const [x, z] of pts) { const pu = x * ux + z * uz, pv = x * vx + z * vz; u0 = Math.min(u0, pu); u1 = Math.max(u1, pu); v0 = Math.min(v0, pv); v1 = Math.max(v1, pv); }
    const area = (u1 - u0) * (v1 - v0);
    if (!best || area < best.area) best = { area, ux, uz, vx, vz, u0, u1, v0, v1 };
  }
  const { ux, uz, vx, vz, u0, u1, v0, v1 } = best;
  let lu = u1 - u0, lv = v1 - v0, U = [ux, uz], V = [vx, vz];
  const cu = (u0 + u1) / 2, cv = (v0 + v1) / 2;
  const c = [ux * cu + vx * cv, uz * cu + vz * cv];
  if (lv > lu) { [lu, lv] = [lv, lu]; U = [vx, vz]; V = [-ux, -uz]; }
  return { c, U, V, lu, lv, area: best.area };
}
// 중복점·닫는 점 제거, 바깥 벽 사각형이 밖을 보도록 감는 방향 통일
function cleanRing(pts) {
  const out = [];
  for (const p of pts) { const q = out[out.length - 1]; if (!q || Math.hypot(p[0] - q[0], p[1] - q[1]) > 0.05) out.push(p); }
  while (out.length > 2 && Math.hypot(out[0][0] - out[out.length - 1][0], out[0][1] - out[out.length - 1][1]) < 0.05) out.pop();
  let s = 0;
  for (let i = 0; i < out.length; i++) { const a = out[i], b = out[(i + 1) % out.length]; s += a[0] * b[1] - b[0] * a[1]; }
  return s > 0 ? out.reverse() : out;
}

// 정점 모음 (재질 × 칸 하나). 법선은 면마다 평평하게.
class Acc {
  constructor(mat) { this.mat = mat; this.pos = []; this.nrm = []; this.uv = []; this.col = mat.vertexColors ? [] : null; }
  tri(p, q, r, ta, tb, tc, col, up = false) {
    const ux = q[0] - p[0], uy = q[1] - p[1], uz = q[2] - p[2], vx = r[0] - p[0], vy = r[1] - p[1], vz = r[2] - p[2];
    let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    const l = Math.hypot(nx, ny, nz); if (l < 1e-9) return;
    if (up && ny < 0) { [q, r] = [r, q]; [tb, tc] = [tc, tb]; nx = -nx; ny = -ny; nz = -nz; }
    nx /= l; ny /= l; nz /= l;
    this.pos.push(...p, ...q, ...r); this.nrm.push(nx, ny, nz, nx, ny, nz, nx, ny, nz); this.uv.push(...ta, ...tb, ...tc);
    if (this.col) for (let k = 0; k < 3; k++) this.col.push(col.r, col.g, col.b);
  }
  quad(a, b, c, d, ta, tb, tc, td, col, up = false) { this.tri(a, b, c, ta, tb, tc, col, up); this.tri(a, c, d, ta, tc, td, col, up); }
  geometry() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nrm, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    if (this.col) g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
    g.computeBoundingSphere();
    return g;
  }
}
// 벽 띠: y0~y1, uv = (둘레 길이 m, vFn(y) m). inner=true 면 안쪽을 보는 면(파라펫 안쪽)
function wallBand(A, ring, y0, y1, v0, v1, inner = false) {
  let u = 0;
  for (let i = 0; i < ring.length; i++) {
    const P = ring[i], Q = ring[(i + 1) % ring.length];
    const len = Math.hypot(Q[0] - P[0], Q[1] - P[1]);
    const a = [P[0], y0, P[1]], b = [Q[0], y0, Q[1]], c = [Q[0], y1, Q[1]], d = [P[0], y1, P[1]];
    if (!inner) A.quad(a, b, c, d, [u, v0], [u + len, v0], [u + len, v1], [u, v1]);
    else A.quad(b, a, d, c, [u + len, v0], [u, v0], [u, v1], [u + len, v1]);
    u += len;
  }
}
// 지붕 면 uv: 면 안에서 가로 방향(용마루와 나란히) × 경사 길이 (m)
function roofUV(p, q, r) {
  const ux = q[0] - p[0], uy = q[1] - p[1], uz = q[2] - p[2], vx = r[0] - p[0], vy = r[1] - p[1], vz = r[2] - p[2];
  let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
  const l = Math.hypot(nx, ny, nz) || 1; nx /= l; ny /= l; nz /= l;
  if (ny < 0) { nx = -nx; nz = -nz; ny = -ny; }
  const s = Math.hypot(nx, nz);
  if (s < 1e-3) return [p, q, r].map((v) => [v[0], v[2]]);
  const hx = -nz / s, hz = nx / s; // 수평 방향
  return [p, q, r].map((v) => [v[0] * hx + v[2] * hz, v[1] / s]);
}
function roofTri(A, p, q, r, col, soffit) {
  // 위를 보도록 감김 정리 (y 성분 = (q-p)×(r-p) 의 y)
  if ((q[2] - p[2]) * (r[0] - p[0]) - (q[0] - p[0]) * (r[2] - p[2]) < 0) [q, r] = [r, q];
  const [ta, tb, tc] = roofUV(p, q, r);
  A.tri(p, q, r, ta, tb, tc, col);
  if (soffit) A.tri(p, r, q, ta, tc, tb, soffit); // 처마 밑면 (아래에서 보일 때)
}
// 상자 (바닥 없음): 중심 (x,z), 축 U, 크기 su×sv×sy, 바닥 y0
function roofBox(A, x, z, U, su, sv, sy, y0, col) {
  const [ux, uz] = U, vx = -uz, vz = ux;
  const P = (a, b, y) => [x + ux * a * su / 2 + vx * b * sv / 2, y, z + uz * a * su / 2 + vz * b * sv / 2];
  const c = [P(-1, -1, 0), P(1, -1, 0), P(1, 1, 0), P(-1, 1, 0)];
  const y1 = y0 + sy;
  const lens = [su, sv, su, sv];
  for (let i = 0; i < 4; i++) {
    const a = c[i], b = c[(i + 1) % 4], len = lens[i];
    const A0 = [a[0], y0, a[2]], B0 = [b[0], y0, b[2]], B1 = [b[0], y1, b[2]], A1 = [a[0], y1, a[2]];
    // 바깥을 보도록: 위에서 본 c 순서의 감김에 따라 맞춘다
    A.quad(B0, A0, A1, B1, [len, 0], [0, 0], [0, sy], [len, sy], col);
  }
  const t = c.map((p) => [p[0], y1, p[2]]);
  A.quad(t[0], t[1], t[2], t[3], [0, 0], [su, 0], [su, sv], [0, sv], col, true);
}

// 기와/슬레이트 줄무늬 캔버스 (경사지붕용, 1장 = 2m)
function tileTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const g = c.getContext('2d');
  g.fillStyle = '#bdbdbd'; g.fillRect(0, 0, 128, 128);
  for (let row = 0; row < 8; row++) {
    const y = row * 16;
    g.fillStyle = 'rgba(255,255,255,.18)'; g.fillRect(0, y, 128, 5);
    g.fillStyle = 'rgba(0,0,0,.35)'; g.fillRect(0, y + 13, 128, 3);
    g.fillStyle = 'rgba(0,0,0,.18)';
    for (let k = 0; k < 4; k++) g.fillRect(((k * 32 + (row % 2) * 16) % 128), y, 2, 16);
  }
  for (let k = 0; k < 600; k++) { g.fillStyle = `rgba(0,0,0,${(Math.random() * 0.08).toFixed(3)})`; g.fillRect(Math.random() * 128, Math.random() * 128, 2, 2); }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(1 / 2, 1 / 2);
  t.anisotropy = 8;
  return t;
}

export async function makeBuildings(world, heightAt, special = {}) {
  const flatTex = await loadTex('/tex/concpave_diff.jpg');
  flatTex.repeat.set(1 / 5, 1 / 5);
  const std = (o) => new THREE.MeshStandardMaterial({ roughness: 0.88, metalness: 0, ...o });
  // 지붕은 색을 정점색으로 넣어 재질 2개로 모두 처리 (그리기 호출 절약)
  const roofFlat = std({ map: flatTex, vertexColors: true, roughness: 0.95 });
  const roofTile = std({ map: tileTexture(), vertexColors: true, roughness: 0.8 });
  // 경사지 기단: 화강석(캠퍼스·병원) / 콘크리트(그 밖) — 작은 창이 띄엄띄엄
  const plinthWin = { w: 0.3, h: 0.32, y: 0.34, mull: 0 };
  const plinthMats = {
    granite: std({ map: await lookFacade({ color: '#bdb6a8', mat: '화강석', win: plinthWin, frame: '#5a5853', glass: '#2f3a44' }) }),
    conc: std({ map: await lookFacade({ color: '#a9a69f', mat: '노출 콘크리트', win: plinthWin, frame: '#55534f', glass: '#2f3a44' }) }),
  };

  // 같은 외관은 재질 공유
  const lookMats = new Map();
  async function lookMaterial(look) {
    const w = look.wall || {};
    const key = JSON.stringify([w.color, w.mat, look.window?.pattern, look.window?.frame, look.window?.glass, look.window?.floorH]);
    if (!lookMats.has(key)) {
      const floor = floorOf(look);
      const tex = await lookFacade({ color: w.color || '#cfc8bb', mat: w.mat || '', pattern: look.window?.pattern || '', frame: look.window?.frame, glass: look.window?.glass, floor });
      const glassy = /유리/.test(w.mat || '');
      lookMats.set(key, std(glassy ? { map: tex, roughness: 0.35, metalness: 0.25 } : { map: tex }));
    }
    return lookMats.get(key);
  }
  const floorOf = (look) => Math.min(4.5, Math.max(2.9, look?.window?.floorH || FLOOR));

  const group = new THREE.Group();
  group.name = 'buildings';
  const index = new PolyIndex(24);
  const info = new Map();
  const batches = new Map();
  const shared = new Set([roofFlat, roofTile, plinthMats.granite, plinthMats.conc]);
  const acc = (mat, [x, z]) => {
    const cs = shared.has(mat) ? CELL_SHARED : CELL;
    const k = mat.uuid + '|' + Math.floor(x / cs) + ',' + Math.floor(z / cs);
    if (!batches.has(k)) batches.set(k, new Acc(mat));
    return batches.get(k);
  };
  const C = (hex) => new THREE.Color(hex);
  const stats = { gable: 0, hip: 0, flat: 0, plinth: 0, boxes: 0, auto: {} };

  for (const b of world.buildings) {
    if (special.skip && special.skip.has(b.id)) continue;
    const area = polyArea(b.pts);
    if (area < 12) continue;
    const ring = cleanRing(b.pts);
    if (ring.length < 3) continue;
    const r = hash(b.id % 100000);
    const cx = ring.reduce((a, p) => a + p[0], 0) / ring.length, cz = ring.reduce((a, p) => a + p[1], 0) / ring.length;
    const box = obb(ring);
    const fill = area / box.area;
    let h = b.h;
    if (!h) h = area < 120 ? 6.5 + r * 2 : area < 600 ? 10 + r * 7 : 15 + r * 12;

    const look = b.look?.wall ? b.look : { ...autoLook(b, cx, cz, h, area, fill), ...(b.look?.roof ? { roof: b.look.roof, roofColor: b.look.roofColor } : {}) };
    if (look.auto) stats.auto[look.auto] = (stats.auto[look.auto] || 0) + 1;
    const fh = floorOf(look);

    let hMin = Infinity, hMax = -Infinity;
    for (const [x, z] of ring) { const y = heightAt(x, z); hMin = Math.min(hMin, y); hMax = Math.max(hMax, y); }
    const baseY = hMin - 1.2;
    // 경사지: 낮은 쪽에서 위쪽 지면(출입 레벨)까지 드러난 기단. 단, 위로 최소 2층은 남긴다
    const slope = hMax - hMin;
    const plinthH = slope > 1.5 ? Math.min(slope, Math.max(0, h - 2 * fh)) : 0;
    const entry = hMin + plinthH; // 창 격자가 시작하는 높이
    const floors = Math.max(1, Math.round((h - plinthH) / fh));
    const top = entry + floors * fh + 0.5;

    const sideMat = await lookMaterial(look);
    if (look.auto) shared.add(sideMat);
    const cellKey = ring[0];
    const W = acc(sideMat, cellKey);

    // 벽: 기단 + 몸체
    if (plinthH > 0.3) {
      const pm = look.auto === 'city' || look.auto === 'house' || /콘크리트/.test(look.wall?.mat || '') ? plinthMats.conc : plinthMats.granite;
      wallBand(acc(pm, cellKey), ring, baseY, entry, baseY - hMin, plinthH);
      wallBand(W, ring, entry, top, 0, top - entry);
      stats.plinth++;
    } else wallBand(W, ring, baseY, top, baseY - hMin, top - hMin);

    // 지붕
    let kind = roofKind(look);
    if (kind !== 'flat' && fill < 0.78) kind = 'flat'; // ㄱ·ㄷ자 평면엔 경사지붕을 씌우지 않는다
    const roofCol = C(look.roofColor || (kind === 'flat' ? '#cbc9c3' : PITCH_COLORS[0]));
    if (kind === 'flat') {
      if (roofCol && !look.roofColor) roofCol.multiplyScalar(0.92 + r * 0.14);
      // 파라펫: 바깥면은 벽 그대로 위로, 안쪽면은 뒤집어서 (uv 는 창 없는 벽 줄)
      wallBand(W, ring, top, top + PARAPET, WALL_V, WALL_V);
      wallBand(W, ring, top, top + PARAPET, WALL_V, WALL_V, true);
      const R = acc(roofFlat, cellKey);
      const tris = THREE.ShapeUtils.triangulateShape(ring.map(([x, z]) => new THREE.Vector2(x, z)), []);
      for (const [i, j, k] of tris) {
        const p = [ring[i][0], top, ring[i][1]], q = [ring[j][0], top, ring[j][1]], s = [ring[k][0], top, ring[k][1]];
        R.tri(p, q, s, [p[0], p[2]], [q[0], q[2]], [s[0], s[2]], roofCol, true);
      }
      // 옥탑(계단·승강기 기계실) + 설비 상자 — 큰 지붕에만, 위치는 건물 id 로 결정
      const nBox = area > 450 ? Math.min(5, Math.floor(area / 600) + 1) : 0;
      if (nBox) {
        const rand = rng(b.id % 2147483647);
        const { c, U, V, lu, lv } = box;
        const wallCol = C(look.wall?.color || '#c8c4bb');
        for (let n = 0, tries = 0; n < nBox && tries < 24; tries++) {
          const pent = n === 0 && h >= 12;
          const su = pent ? Math.min(9, lu * 0.25) : 1.8 + rand() * 3.5, sv = pent ? Math.min(5.5, lv * 0.4) : 1.4 + rand() * 2.4;
          const sy = pent ? 3.0 : 1.0 + rand() * 1.4;
          const a = (rand() - 0.5) * (lu - su - 3), d = (rand() - 0.5) * (lv - sv - 3);
          const x = c[0] + U[0] * a + V[0] * d, z = c[1] + U[1] * a + V[1] * d;
          let ok = true;
          for (const [ea, eb] of [[-1, -1], [1, -1], [1, 1], [-1, 1], [0, 0]]) {
            const px = x + U[0] * ea * (su / 2 + 1) + V[0] * eb * (sv / 2 + 1), pz = z + U[1] * ea * (su / 2 + 1) + V[1] * eb * (sv / 2 + 1);
            if (!pointInPoly(px, pz, ring)) { ok = false; break; }
          }
          if (!ok) continue;
          roofBox(R, x, z, U, su, sv, sy, top, pent ? wallCol : C(rand() < 0.5 ? '#a9aaa6' : '#8f9394'));
          n++; stats.boxes++;
        }
      }
      stats.flat++;
    } else {
      // 박공 / 모임: 최소 사각형 기준. 처마는 0.5m 내밀고, 벽 윗선에서 지붕면이 만나도록 처마를 살짝 내린다
      const { c, U, V, lu, lv } = box;
      const P = (u, v, y) => [c[0] + U[0] * u + V[0] * v, top + y, c[1] + U[1] * u + V[1] * v];
      const t = Math.tan(kind === 'gable' ? 0.5 : 0.48), o = 0.5;
      const a = lu / 2, bb = lv / 2, A = a + o, B = bb + o, e = o * t, Rh = bb * t;
      const R = acc(roofTile, cellKey);
      const soff = C('#4a4642');
      if (kind === 'gable') {
        const quads = [
          [P(-A, -B, -e), P(A, -B, -e), P(A, 0, Rh), P(-A, 0, Rh)],
          [P(A, B, -e), P(-A, B, -e), P(-A, 0, Rh), P(A, 0, Rh)],
        ];
        for (const [q0, q1, q2, q3] of quads) { roofTri(R, q0, q1, q2, roofCol, soff); roofTri(R, q0, q2, q3, roofCol, soff); }
        // 박공벽 삼각형 (벽 재질, 창 없는 줄)
        for (const s of [-1, 1]) {
          const g0 = P(s * a, -bb, 0), g1 = P(s * a, bb, 0), g2 = P(s * a, 0, Rh);
          const out = [U[0] * s, U[1] * s];
          const tri = [g0, g1, g2];
          // 바깥(U*s) 을 보도록 감김 결정
          const ux = g1[0] - g0[0], uz = g1[2] - g0[2], vx = g2[0] - g0[0], vy = g2[1] - g0[1], vz = g2[2] - g0[2];
          const nx = 0 * vz - uz * vy, nz = ux * vy - 0 * vx;
          if (nx * out[0] + nz * out[1] < 0) [tri[1], tri[2]] = [tri[2], tri[1]];
          W.tri(tri[0], tri[1], tri[2], [0, WALL_V], [lv, WALL_V], [lv / 2, WALL_V], null);
        }
        stats.gable++;
      } else {
        const r0 = Math.max(0, a - bb);
        const E = [P(-A, -B, -e), P(A, -B, -e), P(A, B, -e), P(-A, B, -e)], R0 = P(-r0, 0, Rh), R1 = P(r0, 0, Rh);
        const faces = [[E[0], E[1], R1], [E[0], R1, R0], [E[2], E[3], R0], [E[2], R0, R1], [E[1], E[2], R1], [E[3], E[0], R0]];
        for (const [p, q, s] of faces) roofTri(R, p, q, s, roofCol, soff);
        stats.hip++;
      }
    }
    index.add(b.pts, { id: b.id, name: b.name });
    info.set(b.id, { top, pts: b.pts });
  }
  for (const a of batches.values()) {
    if (!a.pos.length) continue;
    const mesh = new THREE.Mesh(a.geometry(), a.mat);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
  }
  console.log('buildings', JSON.stringify(stats), 'meshes', group.children.length);
  return { group, index, info };
}
