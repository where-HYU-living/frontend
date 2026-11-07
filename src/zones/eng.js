// 구역 4 — 공대 구역 (201~213, 305)
// 로드뷰 사진(campus-data/campus/<번호>/photos)과 appearance.json 을 보고 손으로 만든 매스.
//  대표: 201 재성토목관(배 모양 역계단 테라스) · 305 IT/BT관(오목 곡면 유리 커튼월) · 213 구자겸기계관(원기둥 필로티 + 짙은 격자 + FTC 구름다리)
//  나머지(202·203·204·206·207·208·210·211·212)는 매스 단계·파사드 텍스처·파라펫·옥상 설비 수준.
//  209 노천극장은 별도 조형(amph)이 맡으므로 건드리지 않는다.
import * as THREE from 'three';
import { facadeTexture, plainTexture } from '../facade.js';
import { pointInPoly, rng } from '../util.js';

// ---------- 공통 도구 (hero.js 패턴 복사·확장)
const V2 = (x, z) => new THREE.Vector2(x, z);
const std = (o) => new THREE.MeshStandardMaterial({ roughness: 0.85, metalness: 0, ...o });

// 부호 있는 넓이 (x,z 평면)
function sArea(pts) { let a = 0; for (let i = 0; i < pts.length; i++) { const p = pts[i], q = pts[(i + 1) % pts.length]; a += p[0] * q[1] - q[0] * p[1]; } return a / 2; }
// 너무 짧은 변 제거
function clean(pts, minL = 0.4) {
  const out = [];
  for (const p of pts) { const l = out[out.length - 1]; if (!l || Math.hypot(p[0] - l[0], p[1] - l[1]) >= minL) out.push(p); }
  while (out.length > 3 && Math.hypot(out[0][0] - out[out.length - 1][0], out[0][1] - out[out.length - 1][1]) < minL) out.pop();
  return out;
}
// 변 i 의 안쪽 단위 법선
function inNormal(pts, i, sgn) {
  const a = pts[i], b = pts[(i + 1) % pts.length];
  const L = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1, ex = (b[0] - a[0]) / L, ez = (b[1] - a[1]) / L;
  return sgn > 0 ? [-ez, ex] : [ez, -ex];
}
// 다각형 오프셋: d>0 안쪽으로 들임, d<0 바깥으로 내밈 (마이터, 뾰족한 각은 제한)
function inset(pts, d) {
  const n = pts.length, sgn = Math.sign(sArea(pts)) || 1, out = [];
  for (let i = 0; i < n; i++) {
    const n1 = inNormal(pts, (i - 1 + n) % n, sgn), n2 = inNormal(pts, i, sgn);
    const k = Math.max(0.35, 1 + n1[0] * n2[0] + n1[1] * n2[1]);
    out.push([pts[i][0] + (d * (n1[0] + n2[0])) / k, pts[i][1] + (d * (n1[1] + n2[1])) / k]);
  }
  return out;
}
// 반평면 자르기: a*x + b*z + c >= 0 쪽만 남김 (Sutherland–Hodgman)
function clipHalf(pts, a, b, c) {
  const f = (p) => a * p[0] + b * p[1] + c, out = [];
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i], q = pts[(i + 1) % pts.length], fp = f(p), fq = f(q);
    if (fp >= 0) out.push(p);
    if (fp >= 0 !== fq >= 0) { const t = fp / (fp - fq); out.push([p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t]); }
  }
  return out;
}
// 최소 면적 사각형 → 중심 c, 긴 축 U, 짧은 축 V, 길이 lu, lv
function obb(pts) {
  let best = null;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i], b = pts[(i + 1) % pts.length];
    const L = Math.hypot(b[0] - a[0], b[1] - a[1]); if (L < 0.5) continue;
    const ux = (b[0] - a[0]) / L, uz = (b[1] - a[1]) / L, vx = -uz, vz = ux;
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
  return { c, U, V, lu, lv };
}
// 압출: 윤곽(x,z) → y0 ~ y0+h. holes 는 안쪽 구멍
function extrudeGeo(pts, y0, h, holes = []) {
  const shape = new THREE.Shape(pts.map(([x, z]) => V2(x, -z)));
  for (const hp of holes) shape.holes.push(new THREE.Path(hp.map(([x, z]) => V2(x, -z))));
  const geo = new THREE.ExtrudeGeometry(shape, { depth: h, bevelEnabled: false });
  geo.rotateX(-Math.PI / 2);
  geo.translate(0, y0, 0);
  return geo;
}
function slice(geo, grp) {
  const g = new THREE.BufferGeometry();
  for (const n of ['position', 'normal', 'uv']) { const a = geo.attributes[n]; g.setAttribute(n, new THREE.BufferAttribute(a.array.slice(grp.start * a.itemSize, (grp.start + grp.count) * a.itemSize), a.itemSize)); }
  return g;
}
// 옆면 uv 를 미터 단위로: u = 변 방향 거리, v = 높이 - vBase  (사선 변에서도 창이 늘어나지 않게)
function wallUV(g, vBase) {
  const p = g.attributes.position, uv = g.attributes.uv;
  for (let t = 0; t + 2 < p.count; t += 3) {
    let best = 0, dx = 1, dz = 0;
    for (let i = 0; i < 3; i++) for (let j = i + 1; j < 3; j++) { const ax = p.getX(t + i) - p.getX(t + j), az = p.getZ(t + i) - p.getZ(t + j), L = ax * ax + az * az; if (L > best) { best = L; dx = ax; dz = az; } }
    const L = Math.sqrt(best) || 1; dx /= L; dz /= L;
    if (dx < -1e-6 || (Math.abs(dx) < 1e-6 && dz < 0)) { dx = -dx; dz = -dz; }
    for (let k = 0; k < 3; k++) uv.setXY(t + k, p.getX(t + k) * dx + p.getZ(t + k) * dz, p.getY(t + k) - vBase);
  }
}
// 매스 하나: 벽(wall) + 지붕판(cap) 을 따로 메시로 (재질별 합치기가 되도록)
function mass(parent, pts, y0, y1, wall, cap, { vBase = y0, cast = true, holes = [] } = {}) {
  const geo = extrudeGeo(pts, y0, y1 - y0, holes);
  const capG = slice(geo, geo.groups[0]), sideG = slice(geo, geo.groups[1]);
  wallUV(sideG, vBase);
  const s = new THREE.Mesh(sideG, wall); s.castShadow = cast; s.receiveShadow = true; parent.add(s);
  if (cap) { const c = new THREE.Mesh(capG, cap); c.receiveShadow = true; parent.add(c); }
  geo.dispose();
}
// 세로 띠(난간·곡면 유리): 점 열을 따라 y0~y0+h 사각면, uv 미터
function ribbon(pts, y0, h, closed = true) {
  const pos = [], uv = []; let u = 0;
  const n = pts.length, m = closed ? n : n - 1;
  for (let i = 0; i < m; i++) {
    const a = pts[i], b = pts[(i + 1) % n], L = Math.hypot(b[0] - a[0], b[1] - a[1]);
    pos.push(a[0], y0, a[1], b[0], y0, b[1], b[0], y0 + h, b[1], a[0], y0, a[1], b[0], y0 + h, b[1], a[0], y0 + h, a[1]);
    uv.push(u, 0, u + L, 0, u + L, h, u, 0, u + L, h, u, h);
    u += L;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.computeVertexNormals();
  return g;
}
// 상자 (uv 미터)
function boxM(w, h, d) {
  const g = new THREE.BoxGeometry(w, h, d), uv = g.attributes.uv;
  const dims = [[d, h], [d, h], [w, d], [w, d], [w, h], [w, h]];
  for (let f = 0; f < 6; f++) for (let k = 0; k < 4; k++) { const i = f * 4 + k; uv.setXY(i, uv.getX(i) * dims[f][0], uv.getY(i) * dims[f][1]); }
  return g;
}
// 박공 프리즘: 폭 w(X), 높이 h, 깊이 d(Z)
function gablePrism(w, h, d) {
  const s = new THREE.Shape([V2(-w / 2, 0), V2(w / 2, 0), V2(0, h)]);
  const g = new THREE.ExtrudeGeometry(s, { depth: d, bevelEnabled: false });
  g.translate(0, 0, -d / 2);
  return g;
}
function canvasTex(w, h, draw) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  return t;
}
// 메시 하나 놓기 (월드 좌표, 회전 ry)
function put(parent, geo, mat, x, y, z, ry = 0, cast = false) {
  const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.rotation.y = ry; m.castShadow = cast; m.receiveShadow = true; parent.add(m); return m;
}
const angOf = (U) => Math.atan2(-U[1], U[0]); // 로컬 X 를 U 방향으로 돌리는 rotation.y

// ---------- 재질 (구역 전체 공유, 키별 하나)
const matCache = new Map();
async function M(key, make) { if (!matCache.has(key)) matCache.set(key, make()); return matCache.get(key); }
// 벽 텍스처 재질
const facade = (key, o, extra = {}) => M('f:' + key, async () => std({ map: await facadeTexture(o), roughness: 0.75, ...extra }));

export default async function (ctx) {
  const { world, heightAt } = ctx;
  const t0 = performance.now();
  const group = new THREE.Group(); group.name = 'zone-eng';
  const skipIds = [], footprints = [], clear = [];
  const rnd = rng(2013);
  const byNo = (no) => world.buildings.find((b) => b.no === no);
  const gr = (pts) => { let lo = Infinity, hi = -Infinity; for (const [x, z] of pts) { const y = heightAt(x, z); lo = Math.min(lo, y); hi = Math.max(hi, y); } return [lo, hi]; };

  // 공용 재질
  const roofMat = await M('roof', async () => std({ map: await plainTexture('#8e8f8b', 'concwall', 3), roughness: 0.95 }));
  const coping = await M('coping', async () => std({ color: 0xc4c1b8, roughness: 0.8 }));
  const equip = await M('equip', async () => std({ color: 0xa9adab, roughness: 0.55, metalness: 0.35 }));
  const metalLight = await M('metalLight', async () => std({ map: await plainTexture('#b9bcbd', 'concwall', 2.5), roughness: 0.5, metalness: 0.3 }));
  const stoneBeige = await M('stoneBeige', async () => std({ map: await plainTexture('#d4cabb', 'granite', 2), roughness: 0.8 }));
  const whiteCol = await M('whiteCol', async () => std({ map: await plainTexture('#e6e4dd', 'plaster', 2), roughness: 0.7 }));
  const darkGlass = await M('darkGlass', async () => std({ color: 0x3d5866, roughness: 0.12, metalness: 0.55 }));
  const lightGlass = await M('lightGlass', async () => new THREE.MeshStandardMaterial({ color: 0x9fc0cf, roughness: 0.08, metalness: 0.5, transparent: true, opacity: 0.72 }));
  const greenery = await M('greenery', async () => std({ color: 0x4f7a3c, roughness: 0.95, flatShading: true }));
  const railTex = canvasTex(256, 64, (g, w, h) => { g.clearRect(0, 0, w, h); g.fillStyle = '#5f6466'; g.fillRect(0, 0, w, 6); g.fillRect(0, h - 5, w, 5); for (let x = 4; x < w; x += 16) g.fillRect(x, 0, 3, h); });
  railTex.wrapS = THREE.RepeatWrapping; railTex.repeat.set(1 / 2, 1 / 1.1);
  const railMat = await M('rail', async () => std({ map: railTex, alphaTest: 0.5, side: THREE.DoubleSide, metalness: 0.5, roughness: 0.5 }));

  // 옥상: 파라펫(난간벽) + 설비 상자 + 옥탑
  function roofKit(pts, top, { para = 1.0, boxes = 3, pent = true } = {}) {
    const inner = inset(pts, 0.35);
    const pg = extrudeGeo(pts, top, para, [inner]); pg.clearGroups();
    put(group, pg, coping, 0, 0, 0);
    const safe = inset(pts, 2.0);
    const o = obb(safe);
    const inside = (cx, cz, w, d, U) => { const V = [-U[1], U[0]]; for (const [a, b] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) { const x = cx + U[0] * a * w / 2 + V[0] * b * d / 2, z = cz + U[1] * a * w / 2 + V[1] * b * d / 2; if (!pointInPoly(x, z, safe)) return false; } return true; };
    const ry = angOf(o.U);
    if (pent) {
      const w = Math.min(9, o.lu * 0.3), d = Math.min(6, o.lv * 0.5), h = 3.4;
      if (inside(o.c[0], o.c[1], w, d, o.U)) put(group, boxM(w, h, d), coping, o.c[0], top + h / 2, o.c[1], ry, true);
    }
    for (let k = 0, tries = 0; k < boxes && tries < 20; tries++) {
      const a = (rnd() - 0.5) * 0.75 * o.lu, b = (rnd() - 0.5) * 0.6 * o.lv;
      const x = o.c[0] + o.U[0] * a + o.V[0] * b, z = o.c[1] + o.U[1] * a + o.V[1] * b;
      const w = 2 + rnd() * 3.5, d = 1.6 + rnd() * 2.2, h = 1.2 + rnd() * 1.5;
      if (!inside(x, z, w, d, o.U)) continue;
      put(group, boxM(w, h, d), equip, x, top + h / 2, z, ry); k++;
    }
  }
  const register = (b, pts, top) => { skipIds.push(b.id); footprints.push({ id: b.id, pts: b.pts, top }); clear.push(b.pts); };

  // =====================================================================
  // 201 재성토목관 — "거친 바다를 헤쳐 가는 배". 쐐기(뱃머리 = 남쪽) 평면,
  //   3층부터 위로 갈수록 층마다 바깥으로 내미는 역계단 + 층별 테라스 난간·녹색 띠창,
  //   북쪽은 작은 정사각 창이 흩어진 막힌 금속 패널 벽, 저층은 베이지 화강석 기단.
  {
    const b = byNo('201');
    if (b) {
      const pts = clean(b.pts.filter((_, i) => i !== 6), 1); // 북동 모서리 작은 홈은 무시
      const [gLo, gHi] = gr(pts);
      const FH = 3.6, N = 7, base = gHi, top = base + N * FH;
      const band = await facade('201band', { color: '#B7BABB', mat: '금속 패널', img: 'concwall', bay: 3.0, floor: FH - 0.55, frame: '#8C9091', glass: '#6F9E99', win: { w: 0.96, h: 0.78, y: 0.1, mull: 2 } }, { roughness: 0.4, metalness: 0.2 });
      const plinth = await facade('201plinth', { color: '#CFC9BD', img: 'granite', bay: 3.4, floor: FH, frame: '#8C9091', glass: '#56807c', win: { w: 0.7, h: 0.6, y: 0.18, mull: 2 } });
      const spine = await facade('201spine', { color: '#B7BABB', img: 'concwall', bay: 4.2, floor: FH, frame: '#7c8082', glass: '#3b4a4c', win: { w: 0.2, h: 0.28, y: 0.38, mull: 0 } }, { roughness: 0.55, metalness: 0.2 });
      // 기단(1~2층 + 남쪽 반지하): 깊게 들인 화강석·유리
      mass(group, inset(pts, 3.2), gLo - 1.5, base + 2 * FH, plinth, roofMat, { vBase: base });
      // 3~7층: 층마다 0.75m씩 더 내밀어 위가 넓은 배 모양
      for (let k = 2; k < N; k++) {
        const y = base + k * FH, d = (N - 1 - k) * 0.75;
        const slab = inset(pts, d);
        mass(group, slab, y, y + 0.55, metalLight, roofMat, { cast: k === N - 1 });
        mass(group, inset(pts, d + 1.7), y + 0.55, y + FH, band, null, { vBase: y + 0.55, cast: false });
        put(group, ribbon(inset(slab, 0.12), y + 0.55, 1.1), railMat, 0, 0, 0);
      }
      // 지붕 슬래브 + 난간 + 퍼걸러(금속 루버) + 옥상 녹화
      mass(group, pts, top, top + 0.6, metalLight, roofMat, { cast: false });
      put(group, ribbon(inset(pts, 0.12), top + 0.6, 1.1), railMat, 0, 0, 0);
      // 북쪽 막힌 벽(작은 정사각 펀칭창): 북쪽 변을 따라 두께 7m 띠, 바깥으로 0.3 m
      const sgn = Math.sign(sArea(pts));
      let ni = 0, nz = Infinity; // 가장 북쪽(z 작은) 변
      for (let i = 0; i < pts.length; i++) { const a = pts[i], q = pts[(i + 1) % pts.length], mz = (a[1] + q[1]) / 2; if (Math.hypot(q[0] - a[0], q[1] - a[1]) > 15 && mz < nz) { nz = mz; ni = i; } }
      const A = pts[ni], B = pts[(ni + 1) % pts.length], inn = inNormal(pts, ni, sgn);
      const A0 = [A[0] - inn[0] * 0.3, A[1] - inn[1] * 0.3], B0 = [B[0] - inn[0] * 0.3, B[1] - inn[1] * 0.3];
      const strip = [A0, B0, [B0[0] + inn[0] * 7, B0[1] + inn[1] * 7], [A0[0] + inn[0] * 7, A0[1] + inn[1] * 7]];
      mass(group, strip, gLo - 1.5, top + 1.7, spine, roofMat, { vBase: base });
      // '201' 파란 번호판 (북쪽 벽 위)
      const sign = canvasTex(128, 64, (g, w, h) => { g.fillStyle = '#7f9fc8'; g.fillRect(0, 0, w, h); g.fillStyle = '#fff'; g.font = 'bold 40px sans-serif'; g.textAlign = 'center'; g.fillText('201', w / 2, 47); });
      const sMat = await M('201sign', async () => std({ map: sign, roughness: 0.5 }));
      const mx = (A0[0] + B0[0]) / 2 - inn[0] * 0.05, mz = (A0[1] + B0[1]) / 2 - inn[1] * 0.05;
      put(group, new THREE.PlaneGeometry(3.2, 1.6), sMat, mx, base + 3 * FH + 1.6, mz, Math.atan2(-inn[0], -inn[1]));
      // 퍼걸러: 지붕 남쪽(뱃머리) 위 가는 보
      const o = obb(pts), ry = angOf(o.U);
      const south = o.U[1] > 0 ? 1 : -1; // U 축에서 남쪽(+z) 방향
      for (let k = 0; k < 9; k++) {
        const a = south * (k * 1.4 - 2), x = o.c[0] + o.U[0] * a, z = o.c[1] + o.U[1] * a;
        if (!pointInPoly(x, z, inset(pts, 3))) continue;
        put(group, boxM(0.25, 0.35, o.lv * 0.4), equip, x, top + 3.6, z, ry);
      }
      for (const s of [-1, 1]) { const a = south * 4, x = o.c[0] + o.U[0] * a + o.V[0] * s * o.lv * 0.18, z = o.c[1] + o.U[1] * a + o.V[1] * s * o.lv * 0.18; put(group, boxM(0.3, 3, 0.3), equip, x, top + 2.1, z, ry); }
      for (let k = 0; k < 6; k++) { const a = (rnd() - 0.6) * o.lu * 0.5, bb = (rnd() - 0.5) * o.lv * 0.3; const x = o.c[0] + o.U[0] * a + o.V[0] * bb, z = o.c[1] + o.U[1] * a + o.V[1] * bb; if (pointInPoly(x, z, inset(pts, 2))) put(group, new THREE.IcosahedronGeometry(1.1, 0), greenery, x, top + 1.1, z); }
      register(b, pts, top + 1.7);
    }
  }

  // =====================================================================
  // 305 IT/BT관 — 베이지 석재 12층 판상 타워, 동쪽(대로 쪽)은 오목하게 휜 청록 유리 커튼월
  //   (양 끝 석재 기둥 탑 사이, 2개 층마다 가는 띠), 1층은 석재 기둥 사이 창, 서쪽은 흰 저층동.
  {
    const b = byNo('305');
    if (b) {
      const pts = clean(b.pts, 0.5);
      const [gLo, gHi] = gr(pts);
      const FH = 3.9, top = gHi + 47.5 - 0.7;
      const CUT = 455; // x ≥ 455 = 타워, 나머지 = 흰 저층동
      const tower = clipHalf(pts, 1, 0, -CUT), wing = clipHalf(pts, -1, 0, CUT);
      const towerMat = await facade('305tower', { color: '#D6CCBC', img: 'granite', bay: 3.3, floor: FH, frame: '#3E4A4E', glass: '#5aa9ab', win: { w: 0.62, h: 0.48, y: 0.26, mull: 1 } });
      const wingMat = await facade('305wing', { color: '#ECEAE4', img: 'plaster', bay: 3.4, floor: 3.8, frame: '#6c7477', glass: '#4f8c95', win: { w: 0.7, h: 0.45, y: 0.28, mull: 2 } });
      const curtain = await facade('305curtain', { color: '#6CC1C1', mat: '유리 커튼월', bay: 1.7, floor: FH, frame: '#a9b7b8', glass: '#5fb6b9', win: { w: 0.96, h: 0.9, y: 0.05, mull: 1, curtain: true } }, { roughness: 0.15, metalness: 0.45, side: THREE.DoubleSide });
      mass(group, tower, gLo - 1.5, top, towerMat, roofMat, { vBase: gHi });
      mass(group, wing, gLo - 1.5, gHi + 4 * 3.8, wingMat, roofMat, { vBase: gHi });
      roofKit(tower, top, { para: 1.4, boxes: 4 });
      roofKit(wing, gHi + 4 * 3.8, { para: 1.0, boxes: 3, pent: false });
      // 곡면 커튼월: 원래 윤곽에서 동쪽 오목 곡선 점열을 찾아 0.35 m 바깥으로
      const sgn = Math.sign(sArea(pts));
      const curveIdx = []; for (let i = 0; i < pts.length; i++) if (pts[i][0] > 472.5 && pts[i][1] > 18 && pts[i][1] < 44) curveIdx.push(i);
      const curve = curveIdx.map((i) => { const n = pts.length, a = inNormal(pts, (i - 1 + n) % n, sgn), c = inNormal(pts, i, sgn); const nx = a[0] + c[0], nz = a[1] + c[1], L = Math.hypot(nx, nz) || 1; return [pts[i][0] - (nx / L) * 0.35, pts[i][1] - (nz / L) * 0.35, nx / L, nz / L]; });
      if (curve.length > 3) {
        const cp = curve.map((p) => [p[0], p[1]]);
        const y0 = gHi + FH, y1 = top - 1.8;
        put(group, ribbon(cp, y0, y1 - y0, false), curtain, 0, 0, 0);
        // 2개 층마다 가로 띠(얇은 금속 차양)
        const ledge = curve.map((p) => [p[0] - p[2] * 0.35, p[1] - p[3] * 0.35]);
        for (let f = 2; f < 12; f += 2) put(group, ribbon(ledge, gHi + f * FH - 0.15, 0.3, false), metalLight, 0, 0, 0);
        // 양 끝 석재 기둥 탑 (북쪽 탑에 'IT' 글씨)
        const itTex = canvasTex(128, 256, (g, w, h) => { g.fillStyle = '#d6ccbc'; g.fillRect(0, 0, w, h); g.fillStyle = '#4a4f52'; g.font = 'bold 110px serif'; g.textAlign = 'center'; g.fillText('I', w / 2, 112); g.fillText('T', w / 2, 230); });
        const itMat = await M('305it', async () => std({ map: itTex, roughness: 0.8 }));
        for (const [end, nb] of [[curve[0], 1], [curve[curve.length - 1], -1]]) {
          // 기둥 방향: 곡선 끝에서 이어지는 타워 변 방향
          const i = curveIdx[nb > 0 ? 0 : curveIdx.length - 1], j = nb > 0 ? (i - 1 + pts.length) % pts.length : (i + 1) % pts.length;
          const ex = pts[j][0] - pts[i][0], ez = pts[j][1] - pts[i][1], L = Math.hypot(ex, ez) || 1;
          const ry = Math.atan2(-ez / L, ex / L);
          const cx = pts[i][0] + (ex / L) * 2.2, cz = pts[i][1] + (ez / L) * 2.2;
          put(group, boxM(4.4, top + 2.5 - (gLo - 1.5), 4.4), stoneBeige, cx, (top + 2.5 + gLo - 1.5) / 2, cz, ry, true);
          if (nb > 0) { // 바깥(동북) 면에 IT
            const inn = inNormal(pts, (i - 1 + pts.length) % pts.length, sgn);
            put(group, new THREE.PlaneGeometry(3.6, 7.2), itMat, cx - inn[0] * 2.25, top - 6, cz - inn[1] * 2.25, Math.atan2(-inn[0], -inn[1]));
          }
        }
      }
      register(b, pts, top + 1.4);
    }
  }

  // =====================================================================
  // 213 구자겸기계관 (2026 준공, 윤곽 자료 없음 → 조사 중심점에 FTC 와 나란히 38×20 m 로 둠)
  //   높은 원기둥 필로티(아래로 차량 통행) 위 8개 층 상부 매스, 짙은 회갈색 깊은 격자 프레임 안 유리,
  //   모서리 유리 계단실, 밝은 패널 코어, 필로티 아래 파란 매스, FTC 로 가는 유리 구름다리.
  {
    const ftc = byNo('208');
    const c = [339.6, 144.5];
    let U = [0.957, -0.29];
    if (ftc) { // FTC 남쪽 긴 변과 나란히
      let best = 0; for (let i = 0; i < ftc.pts.length; i++) { const a = ftc.pts[i], q = ftc.pts[(i + 1) % ftc.pts.length], L = Math.hypot(q[0] - a[0], q[1] - a[1]); if (L > best) { best = L; U = [(q[0] - a[0]) / L, (q[1] - a[1]) / L]; } }
      if (U[0] < 0) U = [-U[0], -U[1]];
    }
    const V = [-U[1], U[0]];
    const L = 38, D = 20, P = 10.5, FH = 4.1, NF = 8;
    const g0 = heightAt(c[0], c[1]);
    const y0 = g0 + P, y1 = y0 + NF * FH;
    const F = new THREE.Group(); F.position.set(c[0], 0, c[1]); F.rotation.y = angOf(U); group.add(F);
    const loc = (x, z) => [c[0] + U[0] * x + V[0] * z, c[1] + U[1] * x + V[1] * z];
    const glass = await facade('213glass', { color: '#9FB7C6', mat: '유리 커튼월', bay: 2.1, floor: FH, frame: '#4B4A4C', glass: '#8fb0c2', win: { w: 0.94, h: 0.84, y: 0.08, mull: 1 } }, { roughness: 0.15, metalness: 0.4 });
    const frame = await M('213frame', async () => std({ map: await plainTexture('#4d4b4c', 'concwall', 2), roughness: 0.55, metalness: 0.25 }));
    const blue = await M('213blue', async () => std({ color: 0x2a49b8, roughness: 0.5 }));
    const box = (w, h, d, mat, x, y, z, cast = false) => { const m = new THREE.Mesh(boxM(w, h, d), mat); m.position.set(x, y, z); m.castShadow = cast; m.receiveShadow = true; F.add(m); return m; };
    // 상부 매스: 유리 몸체 + 바닥판(짙은 하부) + 깊은 격자
    box(L - 1.2, NF * FH, D - 1.2, glass, 0, y0 + (NF * FH) / 2, 0, true);
    box(L + 1.6, 1.2, D + 1.6, frame, 0, y0 - 0.6 + 0.6, 0, true); // 필로티 위 두꺼운 바닥(짙은 소핏)
    for (let f = 1; f <= NF; f++) box(L + 1.6, 0.55, D + 1.6, frame, 0, y0 + f * FH, 0);
    for (let x = -L / 2 + 0.4; x <= L / 2 + 0.01; x += (L - 0.8) / 9) for (const s of [-1, 1]) box(0.7, NF * FH, 0.9, frame, x, y0 + (NF * FH) / 2, s * (D / 2 + 0.35));
    for (let z = -D / 2 + 0.4; z <= D / 2 + 0.01; z += (D - 0.8) / 4) for (const s of [-1, 1]) box(0.9, NF * FH, 0.7, frame, s * (L / 2 + 0.35), y0 + (NF * FH) / 2, z);
    // 최상층 유리 + 옥탑 + 유리 난간
    box(L * 0.45, 3.6, D * 0.55, coping, L * 0.15, y1 + 0.55 + 1.8, 0, true);
    for (const s of [-1, 1]) { box(L + 1.4, 1.2, 0.08, lightGlass, 0, y1 + 1.15, s * (D / 2 + 0.7)); box(0.08, 1.2, D + 1.4, lightGlass, s * (L / 2 + 0.7), y1 + 1.15, 0); }
    // 필로티: 높은 원기둥 2열 × 5
    const colG = new THREE.CylinderGeometry(0.55, 0.55, P + 1.5, 18);
    for (let k = 0; k < 5; k++) for (const s of [-1, 1]) { const x = -L / 2 + 4 + k * ((L - 8) / 4); const m = new THREE.Mesh(colG, whiteCol); m.position.set(x, g0 + (P + 1.5) / 2 - 1.5, s * (D / 2 - 2.5)); m.castShadow = true; F.add(m); }
    // 필로티 아래: 서쪽 유리 로비(FTC·산학기술관 쪽 입구), 동쪽 밝은 패널 코어 + 파란 매스
    box(13, 5, 9, darkGlass, -L / 2 + 8.5, g0 + 2.5 - 0.5, -1.5);
    box(7, P + NF * FH + 1.5, 8, metalLight, L / 2 - 4.5, g0 + (P + NF * FH + 1.5) / 2 - 1.5, 2.5, true);
    box(9, 6, 6, blue, L / 2 - 12, g0 + 3 - 1, 5);
    // 모서리 유리 계단실 (북서)
    box(5.5, P + NF * FH + 2.5, 5.5, glass, -L / 2 + 1.5, g0 + (P + NF * FH + 2.5) / 2 - 1.5, -D / 2 - 1.5, true);
    // FTC 로 가는 유리 구름다리 (가장 가까운 FTC 윤곽 점까지)
    if (ftc) {
      const s0 = loc(-L / 2 - 1, -D / 2 + 5);
      let best = null;
      for (let i = 0; i < ftc.pts.length; i++) {
        const a = ftc.pts[i], q = ftc.pts[(i + 1) % ftc.pts.length], ex = q[0] - a[0], ez = q[1] - a[1], LL = ex * ex + ez * ez || 1;
        const t = Math.max(0, Math.min(1, ((s0[0] - a[0]) * ex + (s0[1] - a[1]) * ez) / LL));
        const p = [a[0] + ex * t, a[1] + ez * t], d = Math.hypot(p[0] - s0[0], p[1] - s0[1]);
        if (!best || d < best.d) best = { p, d };
      }
      if (best && best.d < 80) {
        const dx = best.p[0] - s0[0], dz = best.p[1] - s0[1], len = best.d + 1.5;
        const by = y0 - 3.2; // 필로티 상부 높이쯤
        const mx = (s0[0] + best.p[0]) / 2, mz = (s0[1] + best.p[1]) / 2, ry = Math.atan2(dx, dz);
        put(group, boxM(4, 3.2, len), lightGlass, mx, by + 1.6 + 0.5, mz, ry);
        put(group, boxM(4.4, 0.7, len), frame, mx, by + 0.15, mz, ry, true);
        put(group, boxM(4.4, 0.45, len), frame, mx, by + 3.45 + 0.5, mz, ry);
        const gm = heightAt(mx, mz);
        put(group, new THREE.CylinderGeometry(0.3, 0.3, by - gm + 1, 10), frame, mx, (by + gm - 1) / 2, mz, 0);
      }
    }
    // 충돌·라벨: 로비 + 코어만 (필로티 아래 길은 지나다닐 수 있게)
    const rect = (x0, x1, z0, z1) => [loc(x0, z0), loc(x1, z0), loc(x1, z1), loc(x0, z1)];
    footprints.push({ id: 'eng-213', name: '구자겸기계관', pts: rect(-L / 2 - 1.5, -L / 2 + 15, -D / 2 - 4.3, 3), top: y1 + 4 });
    footprints.push({ id: 'eng-213b', pts: rect(L / 2 - 16.5, L / 2 - 1, -1.5, 8), top: y1 + 1.8 });
    clear.push(rect(-L / 2 - 4, L / 2 + 2, -D / 2 - 5, D / 2 + 2));
  }

  // =====================================================================
  // 208 퓨전테크센터 — 청록 유리 커튼월 12층, 층마다 내민 수평 차양 띠, 1~2층은 석재 기둥 필로티
  {
    const b = byNo('208');
    if (b) {
      const pts = clean(b.pts, 1.5);
      const [gLo, gHi] = gr(pts);
      const FH = 3.9, P = 2 * FH, top = gHi + 49.08;
      const cw = await facade('208cw', { color: '#6DAFAC', mat: '유리 커튼월', bay: 1.8, floor: FH, frame: '#8E9696', glass: '#5ea6a6', win: { w: 0.95, h: 0.78, y: 0.16, mull: 1 } }, { roughness: 0.18, metalness: 0.4 });
      const lobby = await facade('208lobby', { color: '#CFCBC4', mat: '유리 커튼월', bay: 3, floor: P, frame: '#6d7676', glass: '#3f5d63', win: { w: 0.92, h: 0.85, y: 0.05, mull: 2 } }, { roughness: 0.2, metalness: 0.3 });
      mass(group, inset(pts, 3.5), gLo - 1.5, gHi + P, lobby, roofMat, { vBase: gHi });
      mass(group, pts, gHi + P, top, cw, roofMat, { vBase: gHi + P });
      const fin = inset(pts, -0.7);
      for (let f = 0; f < 11; f++) mass(group, fin, gHi + P + f * FH - 0.12, gHi + P + f * FH + 0.18, metalLight, metalLight, { cast: false });
      // 필로티 석재 사각 기둥 (둘레 8 m 간격)
      const ring = inset(pts, 1.0);
      for (let i = 0; i < ring.length; i++) {
        const a = ring[i], q = ring[(i + 1) % ring.length], Lg = Math.hypot(q[0] - a[0], q[1] - a[1]), n = Math.max(1, Math.round(Lg / 8));
        for (let j = 0; j < n; j++) { const t = j / n, x = a[0] + (q[0] - a[0]) * t, z = a[1] + (q[1] - a[1]) * t; const yb = heightAt(x, z) - 0.6, hc = gHi + P - yb; put(group, boxM(1.2, hc, 1.2), stoneBeige, x, yb + hc / 2, z, Math.atan2(-(q[1] - a[1]), q[0] - a[0])); }
      }
      roofKit(pts, top, { para: 1.3, boxes: 5 });
      register(b, pts, top + 1.3);
    }
  }

  // =====================================================================
  // 나머지 건물: 매스 단계 + 파사드 텍스처 + 파라펫·설비
  // 202 건축관 — 타일 고층부(깊게 판 정사각 격자창) + 유리 포디움
  {
    const b = byNo('202');
    if (b) {
      const pts = clean(b.pts, 1);
      const [gLo, gHi] = gr(pts);
      const FH = 3.7, top = gHi + 9 * FH;
      const body = await facade('202body', { color: '#D4CFC6', img: 'granite', bay: 2.6, floor: FH, frame: '#5A6466', glass: '#4E6E70', win: { w: 0.5, h: 0.55, y: 0.22, mull: 0 } });
      const pod = await facade('202pod', { color: '#4E8A86', mat: '유리 커튼월', bay: 2.2, floor: FH, frame: '#5A6466', glass: '#4E8A86' }, { roughness: 0.2, metalness: 0.35 });
      mass(group, inset(pts, 0.8), gLo - 1.5, gHi + FH, pod, roofMat, { vBase: gHi });
      mass(group, pts, gHi + FH, top, body, roofMat, { vBase: gHi });
      roofKit(pts, top, { boxes: 2 });
      register(b, pts, top + 1);
    }
  }
  // 203 과학기술관 — 9층 석재 타워(남쪽) + 북쪽으로 내려가는 발코니 날개동(노출콘크리트 난간 띠)
  {
    const b = byNo('203');
    if (b) {
      const pts = clean(b.pts, 1);
      const [gLo, gHi] = gr(pts);
      const FH = 3.6, top = gHi + 32.5;
      const tw = await facade('203tower', { color: '#C8B9A5', img: 'granite', bay: 3.2, floor: FH, frame: '#7D7468', glass: '#7FA699', win: { w: 0.32, h: 0.5, y: 0.24, mull: 0 } });
      const wg = await facade('203wing', { color: '#9D9284', img: 'concwall', bay: 3.2, floor: FH, frame: '#6a6157', glass: '#4f6660', win: { w: 1.0, h: 0.5, y: 0.36, mull: 3 } });
      const towerP = clipHalf(pts, 0, 1, -213.5), wing = clipHalf(pts, 0, -1, 213.5);
      const wingA = clipHalf(wing, 0, 1, -205), wingB = clipHalf(wing, 0, -1, 205);
      mass(group, towerP, gLo - 1.5, top, tw, roofMat, { vBase: gHi });
      roofKit(towerP, top, { boxes: 3 });
      for (const [p, nf] of [[wingA, 7], [wingB, 5]]) {
        if (p.length < 3) continue;
        mass(group, p, gLo - 1.5, gHi + nf * FH, wg, roofMat, { vBase: gHi });
        put(group, ribbon(inset(p, -0.05), gHi + nf * FH, 1.1), railMat, 0, 0, 0);
      }
      // 타워 동쪽 면 연녹색 유리 세로 띠 2개
      const o = obb(towerP);
      for (const s of [-0.22, 0.22]) { const x = o.c[0] + o.U[0] * s * o.lu, z = o.c[1] + o.U[1] * s * o.lu; put(group, boxM(2.2, top - gHi - 4, o.lv + 0.3), await M('203strip', async () => std({ color: 0x7fa699, roughness: 0.15, metalness: 0.4 })), x, gHi + 2 + (top - gHi - 4) / 2, z, angOf(o.U)); }
      register(b, pts, top + 1);
    }
  }
  // 204 신소재공학관 — 베이지 화강석 7층, 격자 개별창, 1층 유리 로비
  {
    const b = byNo('204');
    if (b) {
      const pts = clean(b.pts, 1);
      const [gLo, gHi] = gr(pts);
      const FH = 3.6, top = gHi + 25.2;
      const body = await facade('204body', { color: '#CCC8C0', img: 'granite', bay: 3.4, floor: FH, frame: '#9AA0A4', glass: '#6EA3C6', win: { w: 0.58, h: 0.5, y: 0.25, mull: 1 } });
      const lob = await facade('204lobby', { color: '#CCC8C0', img: 'granite', bay: 3.4, floor: FH, frame: '#9AA0A4', glass: '#4f7f9c', win: { w: 0.86, h: 0.78, y: 0.06, mull: 2 } });
      mass(group, inset(pts, 0.6), gLo - 1.5, gHi + FH, lob, roofMat, { vBase: gHi });
      mass(group, pts, gHi + FH, top, body, roofMat, { vBase: gHi });
      roofKit(pts, top, { boxes: 5 });
      register(b, pts, top + 1);
    }
  }
  // 206 공업센터 — 화강석 세로 기둥 + 2~3연 띠창 7층, 서쪽 현관 흰 원기둥 포르티코 + 박공 ("ENGINEERING CENTER")
  {
    const b = byNo('206');
    if (b) {
      const pts = clean(b.pts, 1);
      const [gLo, gHi] = gr(pts);
      const FH = 3.6, top = gHi + 25.2;
      const body = await facade('206body', { color: '#CFCCC4', img: 'granite', bay: 5.2, floor: FH, frame: '#4F5A5C', glass: '#6F9C9E', win: { w: 0.78, h: 0.4, y: 0.34, mull: 2 } });
      mass(group, pts, gLo - 1.5, top, body, roofMat, { vBase: gHi });
      roofKit(pts, top, { boxes: 4 });
      // 포르티코: 서쪽을 보는 가장 긴 변 가운데
      const sgn = Math.sign(sArea(pts));
      let bi = -1, bl = 0;
      for (let i = 0; i < pts.length; i++) { const a = pts[i], q = pts[(i + 1) % pts.length], Lg = Math.hypot(q[0] - a[0], q[1] - a[1]), n = inNormal(pts, i, sgn); if (n[0] > 0.5 && Lg > bl) { bl = Lg; bi = i; } }
      if (bi >= 0) {
        const a = pts[bi], q = pts[(bi + 1) % pts.length], n = inNormal(pts, bi, sgn);
        const T = new THREE.Group(); const mx = (a[0] + q[0]) / 2, mz = (a[1] + q[1]) / 2;
        T.position.set(mx, heightAt(mx - n[0] * 4, mz - n[1] * 4), mz); T.rotation.y = Math.atan2(-n[0], -n[1]); group.add(T);
        const colG = new THREE.CylinderGeometry(0.45, 0.5, 7.2, 16);
        for (const x of [-7, -3.6, 3.6, 7]) { const m = new THREE.Mesh(colG, whiteCol); m.position.set(x, 3.6, 5); m.castShadow = true; T.add(m); }
        const ent = new THREE.Mesh(boxM(18, 1.4, 6.4), whiteCol); ent.position.set(0, 7.9, 3); T.add(ent);
        const ped = new THREE.Mesh(gablePrism(18.6, 2.6, 6.8), whiteCol); ped.position.set(0, 8.6, 3); T.add(ped);
        const step = new THREE.Mesh(boxM(17, 0.5, 6.5), stoneBeige); step.position.set(0, 0.0, 3.2); T.add(step);
        const sign = canvasTex(256, 32, (g, w, h) => { g.fillStyle = '#e6e4dd'; g.fillRect(0, 0, w, h); g.fillStyle = '#7d7a72'; g.font = '18px serif'; g.textAlign = 'center'; g.fillText('ENGINEERING  CENTER', w / 2, 23); });
        const sm = new THREE.Mesh(new THREE.PlaneGeometry(9, 1.1), await M('206sign', async () => std({ map: sign }))); sm.position.set(0, 7.9, 6.21); T.add(sm);
      }
      register(b, pts, top + 1);
    }
  }
  // 207 공업센터 별관 — 흰 도장 4층, 작은 정사각 개별창, 휘어진 금속 처마
  {
    const b = byNo('207');
    if (b) {
      const pts = clean(b.pts, 1);
      const [gLo, gHi] = gr(pts);
      const FH = 3.7, top = gHi + 4 * FH;
      const body = await facade('207body', { color: '#E3E4E2', img: 'plaster', bay: 3.6, floor: FH, frame: '#3F4A48', glass: '#3F6E66', win: { w: 0.28, h: 0.36, y: 0.32, mull: 0 } });
      mass(group, pts, gLo - 1.5, top, body, roofMat, { vBase: gHi });
      const eave = extrudeGeo(inset(pts, -0.5), top, 0.7, [inset(pts, 0.4)]); eave.clearGroups(); put(group, eave, metalLight, 0, 0, 0);
      roofKit(inset(pts, 0.4), top, { para: 0.3, boxes: 3, pent: false });
      register(b, pts, top + 0.7);
    }
  }
  // 210 정몽구 미래자동차연구센터 — 화강석 기단 + 캔틸레버 아래 짙은 유리 띠 + 가로줄 금속 패널 상부 매스
  {
    const b = byNo('210');
    if (b) {
      const pts = clean(b.pts, 1.2);
      const [gLo, gHi] = gr(pts);
      const FH = 4.0, top = gHi + 20.1;
      const baseM = await facade('210base', { color: '#CFCAC0', img: 'granite', bay: 4, floor: FH, frame: '#6E7375', glass: '#3E4A55', win: { w: 0.4, h: 0.4, y: 0.3, mull: 0 } });
      const band = await facade('210band', { color: '#3E4A55', mat: '유리 커튼월', bay: 2.4, floor: FH, frame: '#6E7375', glass: '#3E4A55' }, { roughness: 0.2, metalness: 0.4 });
      const metal = await M('210metal', async () => {
        const t = canvasTex(256, 256, (g, w, h) => { g.fillStyle = '#a8aaaa'; g.fillRect(0, 0, w, h); g.fillStyle = 'rgba(70,74,76,.45)'; for (let y = 0; y < h; y += 16) g.fillRect(0, y, w, 2); g.fillStyle = '#3e4a55'; g.fillRect(110, 40, 22, 170); g.fillStyle = 'rgba(255,255,255,.25)'; g.fillRect(110, 40, 22, 30); });
        t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(1 / 7, 1 / 4);
        return std({ map: t, roughness: 0.45, metalness: 0.35 });
      });
      mass(group, inset(pts, 2.5), gLo - 1.5, gHi + FH, baseM, roofMat, { vBase: gHi });
      mass(group, inset(pts, 3.2), gHi + FH, gHi + 2 * FH, band, roofMat, { vBase: gHi + FH });
      mass(group, pts, gHi + 2 * FH, top, metal, roofMat, { vBase: gHi + 2 * FH });
      roofKit(pts, top, { para: 0.6, boxes: 3 });
      register(b, pts, top + 0.6);
    }
  }
  // 211 제2공학관 — 베이지 화강석 7층, 깊이 들어간 개별창 + 창 아래 석재 띠
  {
    const b = byNo('211');
    if (b) {
      const pts = clean(b.pts, 1);
      const [gLo, gHi] = gr(pts);
      const FH = 3.9, top = gHi + 27.3;
      const body = await facade('211body', { color: '#D8D2C5', img: 'granite', bay: 3.6, floor: FH, frame: '#4C5556', glass: '#5E8E8C', win: { w: 0.66, h: 0.46, y: 0.3, mull: 2 } });
      mass(group, pts, gLo - 1.5, top, body, roofMat, { vBase: gHi });
      roofKit(pts, top, { boxes: 4 });
      // 골진 금속 계단실 탑 (서쪽 끝)
      const o = obb(pts), x = o.c[0] - o.U[0] * (o.lu / 2 - 3), z = o.c[1] - o.U[1] * (o.lu / 2 - 3);
      if (pointInPoly(x, z, pts)) put(group, boxM(5, top - gLo + 3.5, 5), equip, x, (top + 3.5 + gLo - 1.5) / 2 - 0.75, z, angOf(o.U), true);
      register(b, pts, top + 1);
    }
  }
  // 212 제1공학관 — 크림색 도장 5층, 상자형 프레임의 깊은 개별창, 검은 현관 캐노피
  {
    const b = byNo('212');
    if (b) {
      const pts = clean(b.pts, 1);
      const [gLo, gHi] = gr(pts);
      const FH = 3.6, top = gHi + 18;
      const body = await facade('212body', { color: '#E4DDC9', img: 'plaster', bay: 3.0, floor: FH, frame: '#cfc7b1', glass: '#5F99B5', win: { w: 0.42, h: 0.46, y: 0.28, mull: 0 } });
      mass(group, pts, gLo - 1.5, top - FH, body, roofMat, { vBase: gHi });
      mass(group, inset(pts, 1.2), top - FH, top, body, roofMat, { vBase: gHi }); // 최상층 살짝 들임
      roofKit(inset(pts, 1.2), top, { boxes: 3 });
      register(b, pts, top + 1);
    }
  }

  // 그림자: 작은 부재는 끄고 큰 매스만 (위에서 cast 지정)
  let tris = 0;
  group.traverse((m) => { if (m.isMesh) { const g = m.geometry; tris += (g.index ? g.index.count : g.attributes.position.count) / 3; } });
  console.log(`zone eng: ${skipIds.length} buildings, ${Math.round(tris)} tris, ${matCache.size} mats, ${Math.round(performance.now() - t0)}ms`);
  return { group, skipIds, footprints, clear, merge: true, occlude: true };
}
