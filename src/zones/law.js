// 구역 2 — 법대·경영 광장: 407 제1법학관 · 408 제2법학관 · 409 제3법학관 · 410 경제금융대학·법학학술정보관 · 706 경영관
// 로드뷰 사진(campus-data/campus/<번호>-<이름>/photos)과 appearance.json 을 보고 손으로 만든 모델.
//  · 407: 베이지 화강석 판상동 + 모서리 거친 돌 기둥 + 코니스·맨사드풍 최상층 + 북쪽 끝 녹색 유리 커튼월 타워
//  · 408: 흰 에그크레이트(깊은 격자 차양) 판상동 + 최상층 유리 띠
//  · 409: 남쪽으로 볼록한 곡면 판상동 — 층마다 녹색 유리 띠/석재 띠, 들어간 1층 유리 로비 + 원기둥 회랑, 돌출 석재 박스
//  · 410: 고전풍 석조 — 가운데 박공 현관동(반원 부채창·청록 유리 띠·원기둥 캐노피), 거친 돌 기단, 코니스·난간, 동쪽 큰 기둥
//  · 706: 신고전풍 8층 석조 — 거친 돌 기단 + 2층 높이 아치창 열, 원기둥 포치 2곳(동쪽은 박공), 서쪽 끝 유리 커튼월 매스
//  · 바닥: 408·409 사이 붉은 벽돌 광장, 407·410 앞 베이지 판석 광장, 706 남쪽 회색 블록 보행로 (지형을 따라 +3cm)
import { facadeTexture, plainTexture, loadImg } from '../facade.js';
import { loadTex, pointInPoly } from '../util.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

let THREE;
const NOS = ['407', '408', '409', '410', '706'];

// ---------- 기하 도구 ----------
const sArea = (p) => { let a = 0; for (let i = 0; i < p.length; i++) { const [x0, z0] = p[i], [x1, z1] = p[(i + 1) % p.length]; a += x0 * z1 - x1 * z0; } return a / 2; };
// 변 a→b 의 바깥 법선 (sg = 원 다각형 넓이 부호)
const outN = (a, b, sg) => { const dx = b[0] - a[0], dz = b[1] - a[1], L = Math.hypot(dx, dz) || 1; return [(sg * dz) / L, (-sg * dx) / L]; };
// 꼭짓점을 바깥으로 d 만큼 (마이터) — closed 다각형 또는 열린 폴리라인
function offsetPts(pts, d, sg, closed = true) {
  const n = pts.length, out = [];
  for (let i = 0; i < n; i++) {
    const hasP = closed || i > 0, hasN = closed || i < n - 1;
    const nP = hasP ? outN(pts[(i - 1 + n) % n], pts[i], sg) : null;
    const nN = hasN ? outN(pts[i], pts[(i + 1) % n], sg) : null;
    let mx, mz, k = 1;
    if (nP && nN) { mx = nP[0] + nN[0]; mz = nP[1] + nN[1]; const l = Math.hypot(mx, mz) || 1; mx /= l; mz /= l; k = 1 / Math.max(0.35, mx * nN[0] + mz * nN[1]); }
    else [mx, mz] = nP || nN;
    out.push([pts[i][0] + mx * d * k, pts[i][1] + mz * d * k]);
  }
  return out;
}
const lerp2 = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];

// 삼각형 버퍼 (position·normal·uv) — 사각형을 원하는 법선 방향으로 감아서 넣는다
class Buf {
  constructor() { this.p = []; this.n = []; this.u = []; }
  tri(A, B, C, ua, ub, uc, n) {
    const e1 = [B[0] - A[0], B[1] - A[1], B[2] - A[2]], e2 = [C[0] - A[0], C[1] - A[1], C[2] - A[2]];
    const cx = e1[1] * e2[2] - e1[2] * e2[1], cy = e1[2] * e2[0] - e1[0] * e2[2], cz = e1[0] * e2[1] - e1[1] * e2[0];
    if (cx * n[0] + cy * n[1] + cz * n[2] < 0) { [B, C] = [C, B]; [ub, uc] = [uc, ub]; }
    this.p.push(...A, ...B, ...C); this.u.push(...ua, ...ub, ...uc);
    for (let k = 0; k < 3; k++) this.n.push(...n);
  }
  quad(A, B, C, D, ua, ub, uc, ud, n) { this.tri(A, B, C, ua, ub, uc, n); this.tri(A, C, D, ua, uc, ud, n); }
  geo() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.p, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.n, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.u, 2));
    return g;
  }
}

// 벽: 변마다 사각형. uv = (변 따라 m, (y - vBase) * vScale). bay 를 주면 변마다 창 칸이 딱 떨어지게 늘임
function wallGeo(pts, { sg, y0, y1, closed = true, edges = null, vBase = 0, vScale = 1, bay = 0, off = 0, buf = null }) {
  const B = buf || new Buf();
  const P = off ? offsetPts(pts, off, sg, closed) : pts;
  const m = closed ? pts.length : pts.length - 1;
  for (let i = 0; i < m; i++) {
    if (edges && !edges.includes(i)) continue;
    const a = P[i], b = P[(i + 1) % pts.length];
    const L = Math.hypot(b[0] - a[0], b[1] - a[1]); if (L < 0.05) continue;
    const n = outN(pts[i], pts[(i + 1) % pts.length], sg);
    const U = bay ? Math.max(1, Math.round(L / bay)) * bay : L;
    const ya = typeof y0 === 'function' ? y0(a) : y0, yb = typeof y0 === 'function' ? y0(b) : y0;
    const v = (y) => (y - vBase) * vScale;
    B.quad([a[0], ya, a[1]], [b[0], yb, b[1]], [b[0], y1, b[1]], [a[0], y1, a[1]], [0, v(ya)], [U, v(yb)], [U, v(y1)], [0, v(y1)], [n[0], 0, n[1]]);
  }
  return B;
}
// 띠(코니스·난간·처마·층띠): 윤곽에서 o1~o2 만큼 바깥, y~y+h 높이의 사각 단면을 윤곽 따라 쓸기
function bandGeo(pts, { sg, o1, o2, y, h, closed = true, buf = null, top = true, bottom = true, inner = true }) {
  const B = buf || new Buf();
  const A = offsetPts(pts, o1, sg, closed), C = offsetPts(pts, o2, sg, closed);
  const m = closed ? pts.length : pts.length - 1;
  let s = 0;
  for (let i = 0; i < m; i++) {
    const j = (i + 1) % pts.length;
    const n = outN(pts[i], pts[j], sg);
    const L = Math.hypot(C[j][0] - C[i][0], C[j][1] - C[i][1]);
    const y1 = y + h, w = o2 - o1;
    B.quad([C[i][0], y, C[i][1]], [C[j][0], y, C[j][1]], [C[j][0], y1, C[j][1]], [C[i][0], y1, C[i][1]], [s, 0], [s + L, 0], [s + L, h], [s, h], [n[0], 0, n[1]]);
    if (inner) B.quad([A[i][0], y, A[i][1]], [A[j][0], y, A[j][1]], [A[j][0], y1, A[j][1]], [A[i][0], y1, A[i][1]], [s, 0], [s + L, 0], [s + L, h], [s, h], [-n[0], 0, -n[1]]);
    if (top) B.quad([A[i][0], y1, A[i][1]], [A[j][0], y1, A[j][1]], [C[j][0], y1, C[j][1]], [C[i][0], y1, C[i][1]], [s, 0], [s + L, 0], [s + L, w], [s, w], [0, 1, 0]);
    if (bottom) B.quad([A[i][0], y, A[i][1]], [A[j][0], y, A[j][1]], [C[j][0], y, C[j][1]], [C[i][0], y, C[i][1]], [s, 0], [s + L, 0], [s + L, w], [s, w], [0, -1, 0]);
    s += L;
  }
  if (!closed) for (const [i, k] of [[0, 1], [pts.length - 1, -1]]) { // 열린 띠의 양 끝 마구리
    const d = [pts[i + k][0] - pts[i][0], pts[i + k][1] - pts[i][1]], l = Math.hypot(...d);
    B.quad([A[i][0], y, A[i][1]], [C[i][0], y, C[i][1]], [C[i][0], y + h, C[i][1]], [A[i][0], y + h, A[i][1]], [0, 0], [o2 - o1, 0], [o2 - o1, h], [0, h], [-d[0] / l, 0, -d[1] / l]);
  }
  return B;
}
// 수평 뚜껑 (지붕·처마 밑면) — uv = 월드 x,z (m)
function capGeo(pts, y, down = false) {
  const shape = new THREE.Shape(pts.map(([x, z]) => new THREE.Vector2(x, down ? z : -z)));
  const g = new THREE.ShapeGeometry(shape);
  g.rotateX(down ? Math.PI / 2 : -Math.PI / 2);
  g.translate(0, y, 0);
  return g;
}
// 상자 uv 를 미터 단위로
function boxM(w, h, d) {
  const g = new THREE.BoxGeometry(w, h, d), uv = g.attributes.uv;
  const dims = [[d, h], [d, h], [w, d], [w, d], [w, h], [w, h]];
  for (let f = 0; f < 6; f++) for (let k = 0; k < 4; k++) { const i = f * 4 + k; uv.setXY(i, uv.getX(i) * dims[f][0], uv.getY(i) * dims[f][1]); }
  return g;
}
function gablePrism(w, h, d) {
  const s = new THREE.Shape([new THREE.Vector2(-w / 2, 0), new THREE.Vector2(w / 2, 0), new THREE.Vector2(0, h)]);
  const g = new THREE.ExtrudeGeometry(s, { depth: d, bevelEnabled: false });
  g.translate(0, 0, -d / 2);
  return g;
}
// 변 위 한 점에 놓는 로컬 틀: X = 변 방향, Z = 바깥 법선, 원점 = 변 위 t 지점 (높이 y)
function edgeFrame(a, b, t, sg, y) {
  const n = outN(a, b, sg), p = lerp2(a, b, t);
  const g = new THREE.Group();
  g.position.set(p[0], y, p[1]);
  g.rotation.y = Math.atan2(n[0], n[1]); // 로컬 +Z → n
  return g;
}
const add = (parent, geo, mat, x = 0, y = 0, z = 0, cast = false) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.castShadow = cast; m.receiveShadow = true; parent.add(m); return m; };

// 바닥 포장: 지형 격자(2m)에 맞춘 칸마다 다각형을 잘라(Sutherland–Hodgman) 지형 높이 + lift 로 깐다
function paveGeo(poly, heightAt, terr, lift = 0.03) {
  const B = new Buf();
  let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity;
  for (const [x, z] of poly) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); z0 = Math.min(z0, z); z1 = Math.max(z1, z); }
  const st = terr.step, gx0 = terr.minX + Math.floor((x0 - terr.minX) / st) * st, gz0 = terr.minZ + Math.floor((z0 - terr.minZ) / st) * st;
  const clip = (P, f) => { const o = []; for (let i = 0; i < P.length; i++) { const a = P[i], b = P[(i + 1) % P.length], fa = f(a), fb = f(b); if (fa >= 0) o.push(a); if ((fa >= 0) !== (fb >= 0)) { const t = fa / (fa - fb); o.push(lerp2(a, b, t)); } } return o; };
  const up = [0, 1, 0];
  for (let cx = gx0; cx < x1; cx += st) for (let cz = gz0; cz < z1; cz += st) {
    let P = poly;
    P = clip(P, (p) => p[0] - cx); if (P.length < 3) continue;
    P = clip(P, (p) => cx + st - p[0]); if (P.length < 3) continue;
    P = clip(P, (p) => p[1] - cz); if (P.length < 3) continue;
    P = clip(P, (p) => cz + st - p[1]); if (P.length < 3) continue;
    // 칸 안에서 bilinear 를 따르도록 칸 중심점 하나를 더해 부채꼴로 (네 모서리 + 중심)
    const cxm = P.reduce((s, p) => s + p[0], 0) / P.length, czm = P.reduce((s, p) => s + p[1], 0) / P.length;
    const inside = pointInPoly(cxm, czm, poly);
    const V = (p) => [p[0], heightAt(p[0], p[1]) + lift, p[1]], UV = (p) => [p[0] / 2.2, p[1] / 2.2];
    if (inside && P.length === 4 && Math.abs(sArea(P)) > st * st * 0.98) {
      const C = [cxm, czm];
      for (let i = 0; i < P.length; i++) { const a = P[i], b = P[(i + 1) % P.length]; B.tri(V(C), V(a), V(b), UV(C), UV(a), UV(b), up); }
    } else {
      const tris = THREE.ShapeUtils.triangulateShape(P.map((p) => new THREE.Vector2(p[0], p[1])), []);
      for (const [i, j, k] of tris) B.tri(V(P[i]), V(P[j]), V(P[k]), UV(P[i]), UV(P[j]), UV(P[k]), up);
    }
  }
  return B.geo();
}

// 간판·번호판 아틀라스 (재질 하나로)
function signAtlas() {
  const c = document.createElement('canvas'); c.width = 512; c.height = 256;
  const g = c.getContext('2d');
  g.fillStyle = '#d9d4c8'; g.fillRect(0, 0, 512, 256);
  const cell = (i, bg, fg, txt, font) => { const x = (i % 2) * 256, y = Math.floor(i / 2) * 64; g.fillStyle = bg; g.fillRect(x + 2, y + 2, 252, 60); g.fillStyle = fg; g.font = font; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(txt, x + 128, y + 34); };
  cell(0, '#6f7d84', '#f2f2f0', '407', 'bold 40px sans-serif');
  cell(1, '#6f7d84', '#f2f2f0', '410', 'bold 40px sans-serif');
  cell(2, '#5d6468', '#f4f4f2', '408', 'bold 40px sans-serif');
  cell(3, '#dcdcd8', '#2a2f33', '제3법학관', 'bold 38px sans-serif');
  cell(4, '#e8e8e4', '#2a2f33', '제2법학관', 'bold 38px sans-serif');
  cell(5, '#cfc9bc', '#3b3a36', '경제금융대학 · 법학학술정보관', 'bold 22px sans-serif');
  cell(6, '#d6d0c4', '#3b3a36', '경영관', 'bold 40px sans-serif');
  cell(7, '#d6d0c4', '#3b3a36', 'HANYANG BUSINESS', 'bold 26px sans-serif');
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  return t;
}
function signGeo(i, w, h) {
  const g = new THREE.PlaneGeometry(w, h), uv = g.attributes.uv;
  const u0 = (i % 2) * 0.5, v1 = 1 - Math.floor(i / 2) * 0.25, v0 = v1 - 0.25;
  for (let k = 0; k < uv.count; k++) uv.setXY(k, u0 + uv.getX(k) * 0.5, v0 + uv.getY(k) * 0.25);
  return g;
}

export default async function (ctx) {
  THREE = ctx.THREE;
  const { world, heightAt } = ctx;
  const T0 = performance.now();
  const group = new THREE.Group(); group.name = 'zone law';
  const B = Object.fromEntries(NOS.map((no) => [no, world.buildings.find((b) => b.no === no)]));
  const std = (o) => new THREE.MeshStandardMaterial({ roughness: 0.85, metalness: 0, ...(o.map && !o.color ? { color: new THREE.Color(1.18, 1.15, 1.1) } : {}), ...o });

  // ---------- 재질 (공유) ----------
  const [, , , brickD, brickN, paveD, paveN, blockD] = await Promise.all([
    ...['granite', 'stoneblock', 'plaster'].map((n) => loadImg(`/tex/${n}_diff.jpg`).catch(() => null)), // 벽 텍스처 사진 미리 (병렬)

    loadTex('/tex/brickpave_diff.jpg'), loadTex('/tex/brickpave_nor.jpg', { srgb: false }),
    loadTex('/tex/plazapave_diff.jpg'), loadTex('/tex/plazapave_nor.jpg', { srgb: false }),
    loadTex('/tex/concpave_diff.jpg'),
  ]);
  const off = { polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 };
  const M = {
    brick: std({ map: brickD, normalMap: brickN, color: new THREE.Color(1.5, 0.78, 0.52), roughness: 0.9, ...off }),
    beigePave: std({ map: paveD, normalMap: paveN, color: 0xe6d8c4, roughness: 0.85, ...off }),
    greyPave: std({ map: blockD, color: 0xb8b8b4, roughness: 0.9, ...off }),
    roof: std({ color: 0x9c9c96, roughness: 0.95 }),
    stoneLight: std({ map: await plainTexture('#ddd7cb', 'granite', 1.6), roughness: 0.8 }),
    rustic: std({ map: await plainTexture('#d2cbbd', 'stoneblock', 1.4), roughness: 0.9 }),
    white: std({ map: await plainTexture('#efefea', 'plaster', 2), roughness: 0.7 }),
    column: std({ color: 0xe9e6dd, roughness: 0.55 }),
    dark: std({ color: 0x1f2528, roughness: 0.35, metalness: 0.4 }),
    metal: std({ color: 0xb9bcbc, roughness: 0.4, metalness: 0.6 }),
    wood: std({ color: 0x8a5a36, roughness: 0.8 }),
    sign: std({ map: signAtlas(), roughness: 0.6 }),
    glassTeal: std({ map: await facadeTexture({ color: '#4E9A88', mat: '유리 커튼월', frame: '#9aa6a2', bay: 1.6, floor: 3.5 }), roughness: 0.12, metalness: 0.45 }),
    glassBlue: std({ map: await facadeTexture({ color: '#3f6f7a', mat: '유리 커튼월', frame: '#a6aeb0', bay: 1.8, floor: 3.8 }), roughness: 0.12, metalness: 0.45 }),
    glassCyan: std({ color: 0x4fb0b0, roughness: 0.12, metalness: 0.4 }),
  };
  M.brick.normalScale.set(0.6, 0.6);
  const pine = std({ color: 0x3e5a32, roughness: 0.9 });

  const out = { skipIds: [], footprints: [], clear: [] };
  const done = (b, top) => {
    out.skipIds.push(b.id);
    out.footprints.push({ id: b.id, pts: b.pts, top, center: [b.pts.reduce((a, p) => a + p[0], 0) / b.pts.length, b.pts.reduce((a, p) => a + p[1], 0) / b.pts.length] });
  };
  const gMin = (pts) => Math.min(...pts.map(([x, z]) => heightAt(x, z)));
  const mesh = (geo, mat, cast = false) => add(group, geo, mat, 0, 0, 0, cast);
  // 원기둥 (주춧돌·머리 포함)
  const colGeoCache = new Map();
  const colGeo = (r, h) => {
    const k = r + '/' + h; if (colGeoCache.has(k)) return colGeoCache.get(k);
    const parts = [new THREE.CylinderGeometry(r, r * 1.04, h, 14, 1, true).translate(0, h / 2, 0), boxM(r * 2.5, 0.3, r * 2.5).translate(0, 0.15, 0), boxM(r * 2.5, 0.3, r * 2.5).translate(0, h - 0.15, 0)];
    const g = mergeGeometries(parts.map((p) => p.toNonIndexed()));
    colGeoCache.set(k, g); return g;
  };

  // ================= 409 제3법학관 — 곡면 유리 띠 + 원기둥 회랑 =================
  {
    const b = B['409'], P = b.pts, sg = Math.sign(sArea(P));
    const ARC = P.slice(0, 15); // 0..14 = 남쪽(광장)으로 볼록한 곡면
    const arcE = [...Array(14).keys()];
    const gA = heightAt(358, -6.5), lo = gMin(P) - 1.5;
    const FL = 3.75, G1 = gA + 5.4, TOP = gA + 27.9;
    const ribbonMat = std({ map: await facadeTexture({ color: '#d8d2c8', img: 'granite', frame: '#b5b8b6', glass: '#6fb0a4', bay: 2.0, floor: FL, win: { w: 1.0, h: 0.66, y: 0.06, mull: 1 } }), roughness: 0.25, metalness: 0.2 });
    const stoneMat = std({ map: await facadeTexture({ color: '#d8d2c8', img: 'granite', frame: '#9ea3a2', glass: '#5f8f88', bay: 3.0, floor: FL, win: { w: 0.18, h: 0.42, y: 0.3, mull: 0 } }), roughness: 0.75 });
    // 1층 로비: 어두운 반사 유리 + 가로 금속 루버
    const lobbyTex = (() => {
      const c = document.createElement('canvas'); c.width = 256; c.height = 256; const g = c.getContext('2d');
      const gr = g.createLinearGradient(0, 0, 0, 256); gr.addColorStop(0, '#7f9496'); gr.addColorStop(0.45, '#3e4a48'); gr.addColorStop(1, '#262d2c');
      g.fillStyle = gr; g.fillRect(0, 0, 256, 256);
      g.fillStyle = '#a9b0b0'; for (const y of [70, 92, 114]) g.fillRect(0, y, 256, 7);
      g.fillStyle = '#8c9494'; for (const x of [0, 128]) g.fillRect(x, 0, 6, 256);
      const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(1 / 3.2, 1 / 5.4); return t;
    })();
    const lobbyMat = std({ map: lobbyTex, roughness: 0.15, metalness: 0.5 });
    // 1층: 곡면만 2.6m 들인 윤곽
    const inArc = offsetPts(ARC, -2.6, sg, false);
    const P1 = [...inArc, ...P.slice(15)];
    mesh(wallGeo(P1, { sg, y0: lo, y1: G1 + 0.05, edges: arcE, vBase: gA }).geo(), lobbyMat);
    mesh(wallGeo(P1, { sg, y0: lo, y1: G1 + 0.05, edges: [...Array(P1.length).keys()].filter((i) => i >= 14), vBase: gA }).geo(), stoneMat, true);
    // 위층 매스
    mesh(wallGeo(P, { sg, y0: G1, y1: TOP, edges: arcE, vBase: G1 - 0.2, bay: 2.0 }).geo(), ribbonMat, true);
    mesh(wallGeo(P, { sg, y0: G1, y1: TOP, edges: [...Array(P.length).keys()].filter((i) => i >= 14), vBase: G1 }).geo(), stoneMat, true);
    mesh(capGeo(P, TOP), M.roof);
    // 회랑 천장(위층 밑면) — 들인 1층 앞
    const soffit = [...ARC, ...inArc.slice().reverse()];
    mesh(capGeo(soffit, G1, true), M.metal);
    // 층마다 석재 띠 (살짝 돌출) + 곡면 처마
    const ledges = new Buf();
    for (let k = 1; k < 6; k++) bandGeo(ARC, { sg, o1: -0.05, o2: 0.35, y: G1 + k * FL - 0.45, h: 0.4, closed: false, buf: ledges, inner: false });
    bandGeo(ARC, { sg, o1: -0.05, o2: 1.6, y: G1 - 0.2, h: 0.75, closed: false, buf: ledges, inner: false }); // 2층 바닥 캐노피 띠
    bandGeo(P, { sg, o1: -0.4, o2: 0.9, y: TOP - 0.6, h: 0.9, buf: ledges }); // 곡면 처마·파라펫
    mesh(ledges.geo(), M.stoneLight, true);
    // 원기둥 회랑 (곡면을 따라 약 6m 간격, 위층 면에서 0.7m 안쪽)
    const colLine = offsetPts(ARC, -0.75, sg, false);
    const cum = [0]; for (let i = 1; i < colLine.length; i++) cum.push(cum[i - 1] + Math.hypot(colLine[i][0] - colLine[i - 1][0], colLine[i][1] - colLine[i - 1][1]));
    const Ltot = cum[cum.length - 1];
    for (let s = 6; s < Ltot - 3; s += 6.4) {
      let i = 1; while (cum[i] < s) i++;
      const p = lerp2(colLine[i - 1], colLine[i], (s - cum[i - 1]) / (cum[i] - cum[i - 1]));
      const y = heightAt(p[0], p[1]) - 0.2;
      add(group, colGeo(0.42, G1 - y), M.column, p[0], y, p[1], true);
    }
    // 돌출 석재 박스 (사진: 곡면 동쪽, 위층 2개 층 높이) — 테두리 + 어두운 안쪽
    for (const [ei, t, f0] of [[9, 0.5, 3], [11, 0.4, 1]]) {
      const F = edgeFrame(P[ei], P[ei + 1], t, sg, G1 + f0 * FL - 0.2); group.add(F);
      const w = 6.2, h = FL * 2 - 0.3, d = 1.5;
      add(F, boxM(w, 0.6, d).translate(0, 0.3, d / 2), M.stoneLight);
      add(F, boxM(w, 0.6, d).translate(0, h - 0.3, d / 2), M.stoneLight);
      add(F, boxM(0.6, h, d).translate(-w / 2 + 0.3, h / 2, d / 2), M.stoneLight);
      add(F, boxM(0.6, h, d).translate(w / 2 - 0.3, h / 2, d / 2), M.stoneLight);
      add(F, boxM(w - 1.2, 0.35, d).translate(0, h / 2, d / 2), M.stoneLight);
      add(F, new THREE.PlaneGeometry(w - 1.2, h - 1.2).translate(0, h / 2, 0.15), M.glassTeal);
    }
    // 서쪽 끝 현관: 408 과 잇는 얇은 평 캐노피 + 가는 기둥, '제3법학관' 간판
    const can = [[332.6, -15.1], [336.4, -19.0], [333.2, -24.6], [328.4, -25.6]];
    const cy = heightAt(331, -21) + 4.4;
    mesh(capGeo(can, cy + 0.35), M.metal); mesh(capGeo(can, cy, true), M.metal);
    mesh(bandGeo(can, { sg: Math.sign(sArea(can)), o1: 0, o2: 0.05, y: cy, h: 0.35, top: false, bottom: false, inner: false }).geo(), M.metal);
    for (const p of [[333.6, -18.2], [331.2, -23.6]]) add(group, new THREE.CylinderGeometry(0.14, 0.14, cy - heightAt(...p) + 0.1, 8).translate(0, (cy - heightAt(...p)) / 2, 0), M.metal, p[0], heightAt(...p), p[1]);
    { const F = edgeFrame(P[0], P[1], 0.35, sg, G1 - 0.25); group.add(F); add(F, signGeo(3, 4.6, 1.15), M.sign, 0, 0.1, 1.62); }
    out.clear.push(can);
    done(b, TOP);
  }

  // ================= 408 제2법학관 — 흰 에그크레이트 격자 =================
  {
    const b = B['408'], P = b.pts, sg = Math.sign(sArea(P));
    const gE = heightAt(329, -20), lo = gMin(P) - 1.5, FL = 3.7, NF = 7, TOP = gE + NF * FL + 1.2, BAY = 4.2;
    const winMat = std({ map: await facadeTexture({ color: '#e4e4de', img: 'plaster', frame: '#9aa09c', glass: '#5e8f86', bay: BAY, floor: FL, win: { w: 0.84, h: 0.66, y: 0.2, mull: 1 } }), roughness: 0.6 });
    mesh(wallGeo(P, { sg, y0: lo, y1: TOP, vBase: gE, bay: BAY }).geo(), winMat, true);
    mesh(capGeo(P, TOP), M.roof);
    // 격자: 층마다 수평 슬래브 띠 + 칸마다 수직 핀 (0.9m 돌출)
    const eg = new Buf();
    for (let k = 1; k <= NF; k++) bandGeo(P, { sg, o1: 0, o2: 0.9, y: gE + k * FL - 0.32, h: 0.32, buf: eg, inner: false });
    bandGeo(P, { sg, o1: -0.3, o2: 0.95, y: TOP - 0.2, h: 0.75, buf: eg }); // 옥상 파라펫
    for (let i = 0; i < P.length; i++) {
      const a = P[i], c = P[(i + 1) % P.length], L = Math.hypot(c[0] - a[0], c[1] - a[1]); if (L < 2.5) continue;
      const n = Math.max(1, Math.round(L / BAY));
      const nn = outN(a, c, sg), dx = (c[0] - a[0]) / L, dz = (c[1] - a[1]) / L;
      for (let k = 0; k <= n; k++) {
        const p = lerp2(a, c, k / n), y0 = Math.max(lo, gE + FL - 0.3);
        const q = [p[0] + nn[0] * 0.45, p[1] + nn[1] * 0.45];
        const f = [[-0.16, -0.45], [0.16, -0.45], [0.16, 0.45], [-0.16, 0.45]].map(([u, v]) => [q[0] + dx * u + nn[0] * v, q[1] + dz * u + nn[1] * v]);
        wallGeo(f, { sg: Math.sign(sArea(f)), y0, y1: TOP - 0.2, buf: eg });
      }
    }
    mesh(eg.geo(), M.white, true);
    // 최상층 동쪽 절반: 유리 띠 증축부 (격자 바깥으로)
    const half = [lerp2(P[3], P[6], 0.5), P[6], P[7]];
    mesh(wallGeo(half, { sg, y0: gE + 6 * FL, y1: TOP - 0.2, closed: false, off: 0.92 }).geo(), M.glassTeal);
    // 동쪽 현관: 얇은 평 캐노피 + 유리문 + '제2법학관' 간판, 최상층 모서리 '408'
    { const F = edgeFrame(P[6], P[7], 0.42, sg, gE); group.add(F);
      add(F, boxM(9, 0.3, 3.2).translate(0, 4.1, 1.6), M.metal);
      add(F, new THREE.PlaneGeometry(5.5, 3.2).translate(0, 1.6, 0.93), M.dark);
      add(F, signGeo(4, 4.2, 1.0), M.sign, 0, 4.85, 1.0);
      add(F, signGeo(2, 1.6, 0.8), M.sign, 3.5, NF * FL - 0.8, 0.96); }
    done(b, TOP);
  }

  // ================= 407 제1법학관 — 석조 판상동 + 녹색 유리 타워 =================
  {
    const b = B['407'], P = b.pts, sg = Math.sign(sArea(P));
    const gN = heightAt(307, -64.5), lo = gMin(P) - 1.5, FL = 3.5;
    const EAVE = gN + 6 * FL + 0.6, TOP = gN + 24.8;
    const wallMat = std({ map: await facadeTexture({ color: '#dcd6ca', img: 'granite', frame: '#d8d8d2', glass: '#4e6e70', bay: 3.0, floor: FL, win: { w: 0.4, h: 0.6, y: 0.2, mull: 1 } }), roughness: 0.8 });
    mesh(wallGeo(P, { sg, y0: lo, y1: EAVE, vBase: gN, bay: 3.0 }).geo(), wallMat, true);
    mesh(capGeo(P, EAVE), M.roof);
    // 코니스 (두 단)
    const cor = new Buf();
    bandGeo(P, { sg, o1: -0.1, o2: 0.75, y: EAVE - 0.5, h: 0.5, buf: cor, inner: false });
    bandGeo(P, { sg, o1: -0.1, o2: 0.35, y: EAVE - 1.0, h: 0.5, buf: cor, inner: false });
    bandGeo(P, { sg, o1: -0.1, o2: 0.3, y: gN + FL - 0.3, h: 0.35, buf: cor, inner: false }); // 1층 위 띠
    mesh(cor.geo(), M.stoneLight, true);
    // 최상층(맨사드풍): 단순화한 윤곽을 1.4m 들여 한 층 + 작은 창 + 난간
    const core = [[299.6, -61.0], [308.6, -38.0], [319.4, -42.6], [312.0, -66.0]];
    const csg = Math.sign(sArea(core));
    const topMat = std({ map: await facadeTexture({ color: '#cfc9bd', img: 'granite', frame: '#d8d8d2', glass: '#4e6e70', bay: 3.0, floor: 3.4, win: { w: 0.3, h: 0.42, y: 0.3, mull: 0 } }), roughness: 0.8 });
    mesh(wallGeo(core, { sg: csg, y0: EAVE, y1: TOP, vBase: EAVE, bay: 3.0 }).geo(), topMat, true);
    mesh(capGeo(core, TOP), M.roof);
    mesh(bandGeo(core, { sg: csg, o1: -0.2, o2: 0.4, y: TOP - 0.1, h: 0.6 }).geo(), M.stoneLight);
    // 모서리 거친 돌 기둥(퀸): 긴 변의 양 끝과 가운데
    for (let i = 0; i < P.length; i++) {
      const a = P[i], c = P[(i + 1) % P.length], L = Math.hypot(c[0] - a[0], c[1] - a[1]); if (L < 8) continue;
      for (const t of L > 20 ? [0.03, 0.5, 0.97] : [0.06, 0.94]) {
        const F = edgeFrame(a, c, t, sg, lo); group.add(F);
        add(F, boxM(1.7, EAVE - 1.0 - lo, 0.7).translate(0, (EAVE - 1.0 - lo) / 2, 0.2), M.rustic, 0, 0, 0, true);
      }
    }
    // 북쪽 끝 녹색 유리 커튼월 타워 (지붕보다 한 층 더 높음)
    const inw = [0.388, 0.921], tA = P[0], tB = lerp2(P[0], P[13], 0.6);
    const tw = [tA, tB, [tB[0] + inw[0] * 9, tB[1] + inw[1] * 9], [tA[0] + inw[0] * 9, tA[1] + inw[1] * 9]];
    const tsg = Math.sign(sArea(tw)), tTop = TOP + 3.6;
    const tw2 = offsetPts(tw, 0.8, tsg);
    mesh(wallGeo(tw2, { sg: tsg, y0: lo, y1: tTop, vBase: gN }).geo(), M.glassTeal, true);
    mesh(capGeo(tw2, tTop), M.roof);
    mesh(bandGeo(tw2, { sg: tsg, o1: -0.25, o2: 0.15, y: tTop - 0.2, h: 0.6 }).geo(), M.metal);
    // 북쪽 현관 (큰길·410 공유 광장 쪽): 유리 현관 + 캐노피 + '407' 번호판
    { const F = edgeFrame(P[13], P[0], 0.25, sg, gN); group.add(F);
      add(F, new THREE.PlaneGeometry(4.2, 3.0).translate(0, 1.5, 0.02), M.dark);
      add(F, boxM(6, 0.35, 2.6).translate(0, 3.6, 1.3), M.stoneLight);
      for (const s of [-1, 1]) add(F, colGeo(0.25, 3.45), M.column, s * 2.6, 0, 2.3); }
    { const F = edgeFrame(P[12], P[13], 0.2, sg, gN + 5 * FL); group.add(F); add(F, signGeo(0, 1.8, 0.9), M.sign, 0, 0, 0.05); }
    done(b, tTop);
  }

  // ================= 410 경제금융대학·법학학술정보관 — 고전풍 석조 + 박공 현관동 =================
  {
    const b = B['410'], P = b.pts, sg = Math.sign(sArea(P));
    const gE = heightAt(332, -57.5), lo = gMin(P) - 1.5, FL = 3.8;
    const BASE = gE + 4.6, EAVE = BASE + 5 * FL + 0.6;
    const upMat = std({ map: await facadeTexture({ color: '#ded8cc', img: 'granite', frame: '#2f3a3a', glass: '#4f6e6e', bay: 3.4, floor: FL, win: { w: 0.46, h: 0.56, y: 0.22, mull: 1 } }), roughness: 0.8 });
    const baseMat = std({ map: await facadeTexture({ color: '#cfc8ba', img: 'stoneblock', frame: '#2f3a3a', glass: '#4a5c5e', bay: 3.4, floor: 4.6, win: { w: 0.72, h: 0.66, y: 0.14, mull: 2 } }), roughness: 0.9 });
    mesh(wallGeo(P, { sg, y0: lo, y1: BASE, vBase: gE, bay: 3.4 }).geo(), baseMat, true);
    mesh(wallGeo(P, { sg, y0: BASE, y1: EAVE, vBase: BASE, bay: 3.4 }).geo(), upMat, true);
    mesh(capGeo(P, EAVE + 0.01), M.roof);
    const cor = new Buf();
    bandGeo(P, { sg, o1: -0.1, o2: 0.5, y: BASE - 0.15, h: 0.45, buf: cor, inner: false });  // 기단 위 띠
    bandGeo(P, { sg, o1: -0.1, o2: 0.85, y: EAVE - 0.7, h: 0.7, buf: cor, inner: false });  // 코니스
    bandGeo(P, { sg, o1: -0.25, o2: 0.05, y: EAVE, h: 1.0, buf: cor });                      // 난간벽
    mesh(cor.geo(), M.stoneLight, true);
    // 동쪽 동: 큰 반원기둥(자이언트 오더) — 길가 북면·동면
    for (const ei of [7, 8, 9]) {
      const a = P[ei], c = P[(ei + 1) % P.length], L = Math.hypot(c[0] - a[0], c[1] - a[1]);
      const n = Math.max(2, Math.round(L / 4.2));
      for (let k = 1; k < n; k++) { const F = edgeFrame(a, c, k / n, sg, BASE + 0.3); group.add(F); add(F, colGeo(0.5, EAVE - 1.0 - BASE - 0.3), M.column, 0, 0, 0.1); }
    }
    // 긴 날개 북면 가운데: 청록 유리 창 띠 (사진 410-2)
    { const a = P[12], c = P[11]; // (337.9,-50.3)→(380.5,-68) 길가
      const seg = [lerp2(a, c, 0.42), lerp2(a, c, 0.62)];
      mesh(wallGeo(seg, { sg: -sg, y0: BASE + 0.4, y1: EAVE - 1.2, closed: false, off: 0.06 }).geo(), M.glassTeal); }
    // 가운데 박공 현관동 (북서, 407 과 공유 광장)
    {
      const a = P[13], c = P[14]; // (335.6,-55.8)→(329.4,-53.1) 앞면
      const F = edgeFrame(c, a, 0.5, -sg, gE); group.add(F);
      // edgeFrame(c,a) 은 변 방향이 반대라 sg 도 반대로 → 로컬 +Z = 바깥(북서)
      const W = 15, D = 9, H = EAVE + 3.4 - gE;
      add(F, boxM(W, H - (lo - gE) + 0, D).translate(0, (H + (lo - gE)) / 2, -D / 2 + 0.6), upMat, 0, 0, 0, true);
      add(F, boxM(W + 0.8, 0.7, D + 0.8).translate(0, H - 0.35, -D / 2 + 0.6), M.stoneLight);
      add(F, boxM(W, 4.6 - (lo - gE), 0.3).translate(0, (4.6 + (lo - gE)) / 2, 0.75), M.rustic);
      const gab = add(F, gablePrism(W + 0.4, 4.8, D + 0.2), M.stoneLight, 0, H, -D / 2 + 0.6, true);
      void gab;
      add(F, gablePrism(W + 1.4, 5.25, 0.6), M.stoneLight, 0, H - 0.1, 0.95); // 박공 테두리
      // 반원 부채창 + 번호판
      const fan = new THREE.CircleGeometry(1.5, 20, 0, Math.PI); add(F, fan, M.glassCyan, 0, H + 0.9, 1.27);
      add(F, signGeo(1, 1.8, 0.9), M.sign, -W / 2 + 2.2, H - 1.8, 0.95);
      // 양옆 세로 청록 유리 띠
      for (const s of [-1, 1]) add(F, boxM(1.7, H - 6.5, 0.25).translate(0, (H - 6.5) / 2, 0), M.glassCyan, s * 4.6, 5.6, 0.75);
      // 1층 원기둥 캐노피 + 건물명
      add(F, boxM(12, 0.6, 4.6).translate(0, 0, 2.3), M.stoneLight, 0, 4.4, 0.6);
      add(F, signGeo(5, 7.5, 0.55), M.sign, 0, 4.4, 5.22);
      for (const x of [-5.2, -1.8, 1.8, 5.2]) add(F, colGeo(0.3, 4.1), M.column, x, 0, 4.4, true);
      add(F, new THREE.PlaneGeometry(6, 3.2).translate(0, 1.6, 0.92), M.dark);
    }
    done(b, EAVE + 3.4 + 4.8);
  }

  // ================= 706 경영관 — 신고전풍 석조 + 서쪽 유리 매스 =================
  {
    const b = B['706'], P = b.pts, sg = Math.sign(sArea(P));
    const gS = heightAt(345, -206.5), lo = gMin(P) - 1.5;
    const BASE = gS + 7.6, FL = 3.6, EAVE = BASE + 6 * FL;
    const split = lerp2(P[1], P[2], 0.18); // 유리 매스 | 석조 매스
    const glassP = [P[0], P[1], split, P[6]];
    const stoneP = [split, P[2], P[3], P[4], P[5], P[6]];
    const ssg = Math.sign(sArea(stoneP)), gsg = Math.sign(sArea(glassP));
    const archMat = std({ map: await facadeTexture({ color: '#e2ddd2', img: 'stoneblock', frame: '#1e2224', glass: '#3a5c62', bay: 3.6, floor: 7.6, win: { w: 0.42, h: 0.8, y: 0.1, mull: 1, arch: true } }), roughness: 0.9 });
    const upMat = std({ map: await facadeTexture({ color: '#e2ddd2', img: 'granite', frame: '#2b2f31', glass: '#3f6f7a', bay: 3.6, floor: FL, win: { w: 0.34, h: 0.6, y: 0.2, mull: 1 } }), roughness: 0.8 });
    const sEdges = [0, 1, 2, 3, 4]; // 쪼갠 변(5: P6→split)은 유리 매스와 맞닿음
    mesh(wallGeo(stoneP, { sg: ssg, y0: lo, y1: BASE, vBase: gS, bay: 3.6, edges: sEdges }).geo(), archMat, true);
    mesh(wallGeo(stoneP, { sg: ssg, y0: BASE, y1: EAVE, vBase: BASE, bay: 3.6, edges: sEdges }).geo(), upMat, true);
    mesh(capGeo(stoneP, EAVE + 0.01), M.roof);
    const cor = new Buf();
    bandGeo(stoneP, { sg: ssg, o1: -0.1, o2: 0.45, y: BASE - 0.2, h: 0.5, buf: cor, inner: false });
    bandGeo(stoneP, { sg: ssg, o1: -0.1, o2: 0.85, y: EAVE - 0.6, h: 0.75, buf: cor, inner: false });
    bandGeo(stoneP, { sg: ssg, o1: -0.25, o2: 0.05, y: EAVE + 0.1, h: 0.9, buf: cor });
    mesh(cor.geo(), M.stoneLight, true);
    // 유리 커튼월 매스 (서쪽 끝)
    const gTop = EAVE - 0.4;
    mesh(wallGeo(glassP, { sg: gsg, y0: lo, y1: gTop, vBase: gS, edges: [0, 1, 3] }).geo(), M.glassBlue, true);
    mesh(capGeo(glassP, gTop), M.roof);
    mesh(bandGeo(glassP, { sg: gsg, o1: -0.25, o2: 0.2, y: gTop - 0.3, h: 0.8 }).geo(), M.metal);
    // 북면 동쪽 저층: 유리 창 띠 (사진 706-2, 낮은 도로 쪽)
    mesh(wallGeo([lerp2(P[4], P[5], 0.0), lerp2(P[4], P[5], 0.3)], { sg, y0: lo + 1.5, y1: gS - 0.5, closed: false, off: 0.05 }).geo(), M.glassBlue);
    // 남면 원기둥 포치 2곳 (서쪽: 평지붕, 동쪽: 박공 페디먼트) + 화강석 계단
    for (const [ei, t, ped] of [[0, 0.17, false], [1, 0.62, true]]) {
      const a = stoneP[ei], c = stoneP[ei + 1];
      const pc = lerp2(a, c, t), gy = heightAt(pc[0], pc[1]);
      const F = edgeFrame(a, c, t, ssg, gy); group.add(F);
      const W = 7.5, D = 4.2, pod = 1.0, H = 5.2;
      add(F, boxM(W, pod + 1.0, D).translate(0, (pod - 1.0) / 2, D / 2), M.stoneLight);
      for (let k = 0; k < 6; k++) add(F, boxM(W - 2.4, (pod * (k + 1)) / 6, 0.34).translate(0, (pod * (k + 1)) / 12, D + 0.17 + (5 - k) * 0.34), M.stoneLight);
      for (const x of [-W / 2 + 0.9, W / 2 - 0.9]) add(F, colGeo(0.42, H), M.column, x, pod, D - 0.8, true);
      add(F, boxM(W + 0.4, 0.9, D + 0.4).translate(0, 0.45, D / 2), M.stoneLight, 0, pod + H, 0);
      if (ped) add(F, gablePrism(W + 0.6, 2.2, D + 0.6), M.stoneLight, 0, pod + H + 0.9, D / 2);
      add(F, new THREE.PlaneGeometry(3.2, 3.6).translate(0, pod + 1.8, 0.62), M.dark);
      if (!ped) add(F, signGeo(6, 2.6, 0.6), M.sign, 0, pod + H + 0.45, D + 0.22);
    }
    // 남쪽 보행로 (회색 블록) — 남면을 따라 폭 5m
    const southLine = [P[1], P[2], P[3]];
    const walk = [...offsetPts(southLine, 0.3, sg, false), ...offsetPts(southLine, 5.5, sg, false).reverse()];
    mesh(paveGeo(walk, heightAt, world.terrain), M.greyPave);
    out.clear.push(walk);
    done(b, EAVE + 1.0);
  }

  // ================= 바닥: 법대 광장 =================
  // 408·409 사이 붉은 벽돌 광장 (409 곡면 앞 ~ 남쪽 보도 경계)
  const brickPlaza = [
    ...B['409'].pts.slice(0, 15).reverse(), // 409 곡면 (동→서)
    [327.4, -27.0], [332.6, -15.1], [323.3, -11.1], // 408 동쪽 면·남동 모서리
    [326.0, -6.0], [331.0, -2.6], [342.0, 3.4], [347.0, 8.8], [358.5, 16.0], [361.0, 15.0], [362.4, 8.0], [364.6, 1.8], [368.0, -2.6], [374.5, -6.4], [380.0, -12.0], [386.0, -21.4],
  ];
  mesh(paveGeo(brickPlaza, heightAt, world.terrain), M.brick);
  out.clear.push(brickPlaza);
  // 407·410 앞 베이지 판석 광장 (큰길 쪽)
  const northPlaza = [[312.6, -74.5], [314.2, -69.6], [319, -56], [322, -51], [323, -50.6], [329.2, -53.6], [335.8, -56.4], [338.2, -51.0], [380.0, -68.6], [377.6, -74.2], [360.0, -81.0], [336.0, -79.5], [316.0, -77.6]];
  mesh(paveGeo(northPlaza, heightAt, world.terrain), M.beigePave);
  out.clear.push(northPlaza);
  out.plazas = [brickPlaza, northPlaza]; // roads.js 가 이 위에는 점자블록을 깔지 않음
  // 광장 소품: 나무 평상(화분 겸 벤치) + 작은 소나무, 곡면 앞 벤치
  {
    const ptree = (x, z) => {
      const y = heightAt(x, z);
      add(group, boxM(2.6, 0.5, 2.6).translate(0, 0.2, 0), M.wood, x, y, z);
      add(group, new THREE.CylinderGeometry(0.12, 0.16, 2.6, 6).translate(0, 1.85, 0), M.wood, x, y, z);
      add(group, new THREE.ConeGeometry(1.3, 1.8, 7).translate(0, 3.2, 0), pine, x, y, z, true);
      add(group, new THREE.ConeGeometry(0.9, 1.3, 7).translate(0, 4.0, 0), pine, x, y, z, true);
    };
    ptree(345.5, 0.6); ptree(335.8, -5.0);
    const bench = (x, z, rot) => {
      const g = new THREE.Group(); g.position.set(x, heightAt(x, z), z); g.rotation.y = rot; group.add(g);
      add(g, boxM(1.9, 0.08, 0.5).translate(0, 0.45, 0), M.wood);
      add(g, boxM(1.9, 0.45, 0.06).translate(0, 0.72, -0.24), M.wood);
      for (const s of [-0.8, 0.8]) add(g, boxM(0.08, 0.45, 0.45).translate(s, 0.22, 0), M.metal);
    };
    // 409 곡면 앞 (기둥 사이) 벤치
    const arc = B['409'].pts, sg = Math.sign(sArea(arc));
    for (const [i, t] of [[6, 0.5], [8, 0.3], [9, 0.8], [11, 0.5]]) {
      const p = lerp2(arc[i], arc[i + 1], t), n = outN(arc[i], arc[i + 1], sg);
      bench(p[0] + n[0] * 2.4, p[1] + n[1] * 2.4, Math.atan2(n[0], n[1]));
    }
    for (const [x, z, r] of [[327.5, -7.8, 2.4], [324.3, -10.7, 2.4]]) bench(x, z, r);
  }

  // 삼각형 수 (콘솔)
  let tris = 0; group.traverse((o) => { if (o.isMesh) tris += (o.geometry.index ? o.geometry.index.count : o.geometry.attributes.position.count) / 3; });
  console.log(`zone law: ${Math.round(tris)} tris, ${Math.round(performance.now() - T0)}ms`);
  return { group, ...out };
}
