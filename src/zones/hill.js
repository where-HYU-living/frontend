import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { loadImg } from '../facade.js';

// 구역 3 — 언덕 위 사범대·자연대·인문대 (+ 백남학술정보관)
//  505 사범대학 본관 (열주 6개 + 박공 페디먼트, 화강석) · 506 사범대학 별관 (흰 상자 + 구멍 3개 곡면 벽)
//  507 자연과학대학 (흰 벽 + 노랑·웜그레이·남회색 창아래 패널, 노란 돌출 박스) · 508 인문관 (층마다 회색 루버 띠)
//  501 백남학술정보관 (화강석 격자 덩어리, 1층 유리 + 상층 깊은 홈)
// 원칙: 건물 바닥 = 윤곽 아래 가장 낮은 지면(비탈 쪽 기단·지하층이 드러남), 층 줄눈의 기준 = 주출입구(오르막 쪽) 지면.
// 계단: 근처 OSM 계단 중 수치지도 계단 면(site.js)이 덮지 않는 구간만 단을 쌓아 그린다.

// ---------- 공통 도구
const V2 = (x, z) => new THREE.Vector2(x, z);
const std = (o) => new THREE.MeshStandardMaterial({ roughness: 0.85, metalness: 0, ...o });
const at = (m, x, y, z) => { m.position.set(x, y, z); return m; };
function rng(seed) { let s = seed >>> 0 || 1; return () => { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; }; }

// 부호 있는 넓이 (x, z 평면)
function signedArea(pts) { let a = 0; for (let i = 0; i < pts.length; i++) { const p = pts[i], q = pts[(i + 1) % pts.length]; a += p[0] * q[1] - q[0] * p[1]; } return a / 2; }
// 변마다 바깥 법선
function outNormals(pts) {
  const s = signedArea(pts) > 0 ? 1 : -1;
  return pts.map((p, i) => { const q = pts[(i + 1) % pts.length]; const dx = q[0] - p[0], dz = q[1] - p[1], L = Math.hypot(dx, dz) || 1; return [(s * dz) / L, (-s * dx) / L]; });
}
// 다각형 바깥(+)/안(-)으로 d 만큼 평행 이동 (모서리 마이터, 날카로운 각은 제한)
function offsetPoly(pts, d) {
  const N = outNormals(pts), n = pts.length;
  return pts.map((p, i) => {
    const a = N[(i - 1 + n) % n], b = N[i];
    let mx = a[0] + b[0], mz = a[1] + b[1]; const ml = Math.hypot(mx, mz);
    if (ml < 1e-3) return [p[0] + b[0] * d, p[1] + b[1] * d];
    mx /= ml; mz /= ml; const cos = mx * b[0] + mz * b[1];
    const k = d / Math.max(cos, 0.35);
    return [p[0] + mx * k, p[1] + mz * k];
  });
}
function pointInPoly(x, z, pts) { let ins = false; for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) { const [xi, zi] = pts[i], [xj, zj] = pts[j]; if (zi > z !== zj > z && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) ins = !ins; } return ins; }
function segDist(p, a, b) { const dx = b[0] - a[0], dz = b[1] - a[1], L = dx * dx + dz * dz || 1; const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dz) / L)); return Math.hypot(a[0] + dx * t - p[0], a[1] + dz * t - p[1]); }
function polyDist(p, pts) { if (pointInPoly(p[0], p[1], pts)) return 0; let d = Infinity; for (let i = 0; i < pts.length; i++) d = Math.min(d, segDist(p, pts[i], pts[(i + 1) % pts.length])); return d; }
function groundRange(pts, heightAt) {
  let lo = Infinity, hi = -Infinity;
  const test = (x, z) => { const y = heightAt(x, z); lo = Math.min(lo, y); hi = Math.max(hi, y); };
  for (let i = 0; i < pts.length; i++) { const a = pts[i], b = pts[(i + 1) % pts.length]; for (let t = 0; t < 1; t += 0.25) test(a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t); }
  return [lo, hi];
}

// 윤곽을 따라 세운 벽 — uv: u = 변 길이(m, 변마다 칸 수가 딱 맞게 늘임), v = (y - vBase) m
function wallsGeo(pts, y0, y1, { vBase = 0, bay = 0 } = {}) {
  const N = outNormals(pts), P = [], Nr = [], U = [];
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i], b = pts[(i + 1) % pts.length], L = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (L < 0.05) continue;
    let ua = 0, ub = L;
    if (bay) { if (L < bay * 0.6) { ua = ub = 0.02 * bay; } else ub = Math.max(1, Math.round(L / bay)) * bay; }
    const [nx, nz] = N[i];
    // 바깥에서 볼 때 반시계: a0, b0, b1, a1 의 법선이 (dz,-dx) 방향인지 확인
    const dx = b[0] - a[0], dz = b[1] - a[1];
    const flip = (-dz * nx + dx * nz) < 0;
    const v0 = y0 - vBase, v1 = y1 - vBase;
    const A0 = [a[0], y0, a[1], ua, v0], B0 = [b[0], y0, b[1], ub, v0], B1 = [b[0], y1, b[1], ub, v1], A1 = [a[0], y1, a[1], ua, v1];
    const tris = flip ? [A0, B1, B0, A0, A1, B1] : [A0, B0, B1, A0, B1, A1];
    for (const v of tris) { P.push(v[0], v[1], v[2]); Nr.push(nx, 0, nz); U.push(v[3], v[4]); }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(Nr, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(U, 2));
  return g;
}
// 수평 뚜껑 (위를 봄, holes = 구멍 다각형들), down=true 면 아래를 봄
function capGeo(pts, y, holes = [], down = false) {
  const sh = new THREE.Shape(pts.map(([x, z]) => V2(x, -z)));
  for (const h of holes) sh.holes.push(new THREE.Path(h.map(([x, z]) => V2(x, -z))));
  const g = new THREE.ShapeGeometry(sh);
  g.rotateX(-Math.PI / 2);
  if (down) { g.rotateX(Math.PI); g.scale(1, 1, -1); const idx = g.index.array; for (let k = 0; k < idx.length; k += 3) { const t = idx[k]; idx[k] = idx[k + 1]; idx[k + 1] = t; } g.computeVertexNormals(); }
  g.translate(0, y, 0);
  const uv = g.attributes.uv, pos = g.attributes.position;
  for (let k = 0; k < uv.count; k++) uv.setXY(k, pos.getX(k), pos.getZ(k));
  return g.toNonIndexed();
}
// 띠 (윤곽 바깥으로 d 만큼 나온 수평 띠, 위·아래 면 포함)
function bandGeo(pts, d, y0, y1, opt = {}) {
  const o = offsetPoly(pts, d);
  return mergeGeometries([wallsGeo(o, y0, y1, opt), capGeo(o, y1, [pts]), capGeo(o, y0, [pts], true)]);
}
// 상자 uv 를 미터 단위로
function boxM(w, h, d) {
  const g = new THREE.BoxGeometry(w, h, d), uv = g.attributes.uv;
  const dims = [[d, h], [d, h], [w, d], [w, d], [w, h], [w, h]];
  for (let f = 0; f < 6; f++) for (let k = 0; k < 4; k++) { const i = f * 4 + k; uv.setXY(i, uv.getX(i) * dims[f][0], uv.getY(i) * dims[f][1]); }
  return g.toNonIndexed();
}
// 박공(삼각) 프리즘: 폭 w(X), 높이 h, 깊이 d(Z)
function gablePrism(w, h, d) {
  const s = new THREE.Shape([V2(-w / 2, 0), V2(w / 2, 0), V2(0, h)]);
  const g = new THREE.ExtrudeGeometry(s, { depth: d, bevelEnabled: false });
  g.translate(0, 0, -d / 2);
  return g.toNonIndexed();
}
function canvasTex(w, h, draw, { srgb = true, repeat = null } = {}) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  if (repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(repeat[0], repeat[1]); }
  return t;
}
// 바탕색 + 사진 질감 (facade.js 의 paintWall 과 같은 방식)
function paintBase(g, img, color, W, H, pxPerM, scaleM = 1.6, strength = 1) {
  g.fillStyle = color; g.fillRect(0, 0, W, H);
  if (!img) return;
  const pat = g.createPattern(img, 'repeat');
  const s = (pxPerM * scaleM) / img.width;
  pat.setTransform(new DOMMatrix([s, 0, 0, s, 0, 0]));
  g.save(); g.globalCompositeOperation = 'overlay'; g.globalAlpha = 0.7 * strength; g.fillStyle = pat; g.fillRect(0, 0, W, H); g.restore();
  g.save(); g.globalCompositeOperation = 'multiply'; g.globalAlpha = 0.18 * strength; g.fillStyle = pat; g.fillRect(0, 0, W, H); g.restore();
}
// 창 (틀 + 하늘 비친 유리 그라데이션 + 살)
function paintWin(g, x, y, w, h, { frame = '#3a3a3a', glass = '#33414f', mullV = 1, mullH = 0, fw = null }) {
  fw = fw ?? Math.max(2, Math.min(w, h) * 0.07);
  g.fillStyle = frame; g.fillRect(x - fw, y - fw, w + fw * 2, h + fw * 2);
  const c = new THREE.Color(glass);
  const sky = c.clone().lerp(new THREE.Color('#c4d6e2'), 0.5), dark = c.clone().multiplyScalar(0.55);
  const gr = g.createLinearGradient(x, y, x + w * 0.4, y + h);
  gr.addColorStop(0, `#${sky.getHexString()}`); gr.addColorStop(0.45, glass); gr.addColorStop(1, `#${dark.getHexString()}`);
  g.fillStyle = gr; g.fillRect(x, y, w, h);
  g.fillStyle = frame;
  for (let k = 1; k <= mullV; k++) g.fillRect(x + (w * k) / (mullV + 1) - fw / 2, y, fw, h);
  for (let k = 1; k <= mullH; k++) g.fillRect(x, y + (h * k) / (mullH + 1) - fw / 2, w, fw);
}
// 출입문 (어두운 유리문 판) — 벽 바깥 법선 쪽으로 살짝 띄움
function doorMesh(mat, p, n, y, w = 2.6, h = 2.6) {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
  m.position.set(p[0] + n[0] * 0.06, y + h / 2, p[1] + n[1] * 0.06);
  m.rotation.y = Math.atan2(n[0], n[1]);
  return m;
}
// 로컬 틀: 원점 c, X = U, Z = 바깥(facingPt 쪽)
function frameAt(c, U, facingPt, y0) {
  let [ux, uz] = U;
  if ((facingPt[0] - c[0]) * -uz + (facingPt[1] - c[1]) * ux < 0) { ux = -ux; uz = -uz; }
  const g = new THREE.Group();
  g.position.set(c[0], y0, c[1]);
  g.rotation.y = Math.atan2(-uz, ux);
  g.userData.U = [ux, uz]; g.userData.N = [-uz, ux];
  return g;
}
// 윤곽 위 가장 가까운 변 → { i, p(투영점), n(바깥 법선) }
function nearestEdge(pts, p) {
  const N = outNormals(pts); let best = null;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i], b = pts[(i + 1) % pts.length], dx = b[0] - a[0], dz = b[1] - a[1], L = dx * dx + dz * dz || 1;
    const t = Math.max(0.05, Math.min(0.95, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dz) / L));
    const q = [a[0] + dx * t, a[1] + dz * t], d = Math.hypot(q[0] - p[0], q[1] - p[1]);
    if (!best || d < best.d) best = { i, p: q, n: N[i], d, u: [dx / Math.sqrt(L), dz / Math.sqrt(L)], L: Math.sqrt(L) };
  }
  return best;
}
const shadow = (m, cast = false) => { m.receiveShadow = true; m.castShadow = cast; return m; };

// ---------- 공용 재질
async function makeMats() {
  const [granite, plaster, conc] = await Promise.all(['granite', 'plaster', 'concwall'].map((n) => loadImg(`/tex/${n}_diff.jpg`).catch(() => null)));
  const plain = (color, img, sizeM = 2, strength = 1) => canvasTex(256, 256, (g, W, H) => paintBase(g, img, color, W, H, W / sizeM, 1.6, strength), { repeat: [1 / sizeM, 1 / sizeM] });
  const M = {
    img: { granite, plaster, conc },
    roofLight: std({ color: 0xb4b2ac, roughness: 0.95 }),
    roofGrey: std({ color: 0x8b8e91, roughness: 0.95 }),
    stoneWhite: std({ map: plain('#dedbd3', granite, 1.5, 0.8), roughness: 0.8 }),
    pave: std({ map: plain('#cfc9be', granite, 1.2), roughness: 0.9 }),
    glassDark: std({ color: 0x27323a, roughness: 0.15, metalness: 0.5 }),
    steel: std({ color: 0x3e4246, roughness: 0.55, metalness: 0.4 }),
  };
  M.plain = plain;
  // 글씨·번호판·문장을 한 장(1024²)에 모은 아틀라스 → 재질 하나
  const R = {
    med: [0, 0, 256, 256], plate505: [256, 0, 128, 64], plate506: [384, 0, 128, 64], sign506: [512, 0, 512, 128],
    signs505: [0, 256, 1024, 48], ban507: [0, 304, 512, 64], letters507: [0, 384, 1024, 128], sign508: [0, 512, 1024, 192],
  };
  const draw = {
    med: (c, w) => {
      c.fillStyle = '#e3e0d8'; c.beginPath(); c.arc(w / 2, w / 2, w / 2 - 2, 0, 7); c.fill();
      c.strokeStyle = '#a9a59c'; c.lineWidth = 14; c.beginPath(); c.arc(w / 2, w / 2, w / 2 - 12, 0, 7); c.stroke();
      c.lineWidth = 5; c.beginPath(); c.arc(w / 2, w / 2, w / 2 - 40, 0, 7); c.stroke();
      c.fillStyle = '#a9a59c'; c.font = 'bold 60px serif'; c.textAlign = 'center'; c.fillText('HY', w / 2, w / 2 + 20);
    },
    plate505: (c, w, h) => { c.fillStyle = '#5d6266'; c.fillRect(0, 0, w, h); c.fillStyle = '#f0f0ec'; c.font = 'bold 40px sans-serif'; c.textAlign = 'center'; c.fillText('505', w / 2, 47); },
    plate506: (c, w, h) => { c.fillStyle = '#a7adb0'; c.fillRect(0, 0, w, h); c.fillStyle = '#ffffff'; c.font = 'bold 42px sans-serif'; c.textAlign = 'center'; c.fillText('506', w / 2, 47); },
    sign506: (c) => { c.fillStyle = '#2a2a2a'; c.font = 'bold 64px sans-serif'; c.fillText('사범대학(별관)', 10, 70); c.font = '24px sans-serif'; c.fillText('College of Education(Annex)', 14, 108); },
    signs505: (c, w, h) => { c.fillStyle = '#e8e5de'; c.fillRect(0, 0, w, h); ['교육학과', '사범대학 · 교육대학원', '상담심리대학원'].forEach((t, i) => { const x = (w * (i + 0.5)) / 3; c.fillStyle = '#4a4a46'; c.fillRect(x - 120, 8, 240, h - 16); c.fillStyle = '#f2efe6'; c.font = 'bold 22px sans-serif'; c.textAlign = 'center'; c.fillText(t, x, h / 2 + 8); }); },
    ban507: (c, w, h) => { c.fillStyle = '#2e4f8a'; c.fillRect(0, 0, w, h); c.fillStyle = '#ffffff'; c.font = 'bold 30px sans-serif'; c.textAlign = 'center'; c.fillText('자연과학대학 College of Natural Sciences', w / 2, 43); },
    letters507: (c) => { c.fillStyle = '#5a6068'; c.fillRect(8, 20, 150, 88); c.fillStyle = '#fff'; c.font = 'bold 66px sans-serif'; c.fillText('507', 22, 88); c.fillStyle = '#3a3e44'; c.font = 'bold 76px sans-serif'; c.fillText('자연과학대학', 190, 92); },
    sign508: (c, w, h) => { c.fillStyle = '#f4f4f1'; c.fillRect(0, 0, w, h); c.fillStyle = '#2b2f36'; c.font = 'bold 84px sans-serif'; c.fillText('인문과학대학', 40, 108); c.font = '34px sans-serif'; c.fillText('College of Humanities', 46, 160); c.fillStyle = '#5a6068'; c.fillRect(800, 40, 190, 112); c.fillStyle = '#fff'; c.font = 'bold 80px sans-serif'; c.fillText('508', 822, 128); },
  };
  const atlas = canvasTex(1024, 1024, (c) => { c.clearRect(0, 0, 1024, 1024); for (const [k, [x, y, w, h]] of Object.entries(R)) { c.save(); c.translate(x, y); c.beginPath(); c.rect(0, 0, w, h); c.clip(); draw[k](c, w, h); c.restore(); } });
  const atlasMat = std({ map: atlas, transparent: true, alphaTest: 0.2, roughness: 0.6 });
  M.label = (key, w, h) => {
    const [x, y, rw, rh] = R[key], pg = new THREE.PlaneGeometry(w, h), uv = pg.attributes.uv;
    for (let k = 0; k < uv.count; k++) uv.setXY(k, (x + uv.getX(k) * rw) / 1024, 1 - (y + (1 - uv.getY(k)) * rh) / 1024);
    return new THREE.Mesh(pg, atlasMat);
  };
  return M;
}

// ---------- 505 사범대학 본관
async function make505(b, heightAt, M) {
  const g = new THREE.Group(); g.name = '505 사범대학 본관';
  const pts = b.pts;
  // 윤곽의 가운데 3.4m 돌출부 = 열주 포르티코. 몸체는 돌출부를 뺀 사각형
  const body = pts.length === 10 ? pts.filter((_, i) => ![3, 4, 5].includes(i)) : pts;
  const pA = pts.length === 10 ? pts[2] : pts[0], pB = pts.length === 10 ? pts[6] : pts[1], pTip = pts.length === 10 ? pts[4] : [pts[0][0] + 1, pts[0][1]];
  const [gLo] = groundRange(pts, heightAt);
  const mid = [(pA[0] + pB[0]) / 2, (pA[1] + pB[1]) / 2];
  const PW = Math.hypot(pB[0] - pA[0], pB[1] - pA[1]);
  const Ul = [(pB[0] - pA[0]) / PW, (pB[1] - pA[1]) / PW];
  const F = frameAt(mid, Ul, pTip, 0);
  const [nx, nz] = F.userData.N;
  const PD = Math.max(2.5, Math.min(4.5, Math.abs((pTip[0] - mid[0]) * nx + (pTip[1] - mid[1]) * nz)));
  const gE = heightAt(mid[0] + nx * (PD + 3), mid[1] + nz * (PD + 3)) + 0.25; // 정면(오르막) 테라스 높이
  const BAY = 3.25, F1 = 4.5, FL = 3.9, NUP = 4;
  const T = gE + F1 + FL * NUP; // 코니스 아래
  const { granite } = M.img;
  const pxM = 256 / BAY;
  // 상층 벽: 한 칸 × 두 층 (위층 = 삼각 창머리, 아래층 = 평 창머리), 칸 양끝 = 벽기둥(필라스터)
  const upTex = canvasTex(256, Math.round(pxM * FL * 2), (c, W, H) => {
    paintBase(c, granite, '#cfcdc7', W, H, pxM);
    c.fillStyle = 'rgba(80,78,72,.18)'; for (let y = 0; y < H; y += pxM * 0.65) c.fillRect(0, y, W, 1.5);
    // 필라스터
    for (const x of [0, W - W * 0.09]) { c.fillStyle = 'rgba(255,255,255,.22)'; c.fillRect(x, 0, W * 0.09, H); c.fillStyle = 'rgba(0,0,0,.12)'; c.fillRect(x === 0 ? W * 0.09 : x - 2, 0, 2, H); }
    const FH = H / 2;
    for (let f = 0; f < 2; f++) {
      const y0 = f * FH; // f=0 → 캔버스 위쪽 = 위층
      const ww = W * 0.4, wh = FH * 0.44, wx = (W - ww) / 2, wy = y0 + FH * 0.3;
      // 석재 창틀(밝은 테두리)
      c.fillStyle = '#e6e3dc'; c.fillRect(wx - 9, wy - 9, ww + 18, wh + 18);
      c.fillStyle = 'rgba(0,0,0,.18)'; c.fillRect(wx - 9, wy + wh + 9, ww + 18, 4);
      paintWin(c, wx, wy, ww, wh, { frame: '#2e3a3a', glass: '#3e6a68', mullV: 1, mullH: 1, fw: 4 });
      // 창대
      c.fillStyle = '#ebe8e1'; c.fillRect(wx - 14, wy + wh + 9, ww + 28, 7);
      // 창머리: 위층 = 삼각 페디먼트, 아래층 = 평 처마
      c.fillStyle = '#ebe8e1';
      if (f === 0) { c.beginPath(); c.moveTo(wx - 16, wy - 12); c.lineTo(wx + ww + 16, wy - 12); c.lineTo(wx + ww / 2, wy - 12 - FH * 0.09); c.closePath(); c.fill(); c.fillStyle = 'rgba(0,0,0,.2)'; c.fillRect(wx - 16, wy - 12, ww + 32, 3); }
      else { c.fillRect(wx - 16, wy - 20, ww + 32, 8); c.fillStyle = 'rgba(0,0,0,.2)'; c.fillRect(wx - 16, wy - 12, ww + 32, 3); }
    }
  }, { repeat: [1 / BAY, 1 / (FL * 2)] });
  // 1층: 기둥 사이 큰 청록 유리창
  const gTex = canvasTex(256, Math.round(pxM * F1), (c, W, H) => {
    paintBase(c, granite, '#c9c6bf', W, H, pxM);
    for (const x of [0, W - W * 0.1]) { c.fillStyle = 'rgba(255,255,255,.2)'; c.fillRect(x, 0, W * 0.1, H); }
    paintWin(c, W * 0.22, H * 0.12, W * 0.56, H * 0.78, { frame: '#2e3a3a', glass: '#3e8c80', mullV: 1, mullH: 2, fw: 4 });
    c.fillStyle = 'rgba(0,0,0,.15)'; c.fillRect(0, H - 6, W, 6);
  }, { repeat: [1 / BAY, 1 / F1] });
  // 기단(비탈 쪽 반지하): 줄눈 깊은 화강석 + 작은 창
  const pTex = canvasTex(256, Math.round(pxM * FL), (c, W, H) => {
    paintBase(c, granite, '#bdb8ae', W, H, pxM);
    c.fillStyle = 'rgba(40,38,34,.35)'; for (let y = 0; y < H; y += pxM * 0.55) c.fillRect(0, y, W, 3);
    paintWin(c, W * 0.3, H * 0.08, W * 0.4, H * 0.3, { frame: '#2e3a3a', glass: '#36504f', mullV: 1, fw: 4 });
  }, { repeat: [1 / BAY, 1 / FL] });
  const upMat = std({ map: upTex, roughness: 0.8 }), gMat = std({ map: gTex, roughness: 0.7 }), pMat = std({ map: pTex, roughness: 0.9 });
  g.add(shadow(new THREE.Mesh(wallsGeo(body, gLo - 0.6, gE, { vBase: gE, bay: BAY }), pMat), true));
  g.add(shadow(new THREE.Mesh(wallsGeo(body, gE, gE + F1, { vBase: gE, bay: BAY }), gMat), true));
  g.add(shadow(new THREE.Mesh(wallsGeo(body, gE + F1, T, { vBase: gE + F1, bay: BAY }), upMat), true));
  // 1·2층 사이 띠돌림, 코니스, 난간벽 + 피니얼
  g.add(shadow(new THREE.Mesh(bandGeo(body, 0.18, gE + F1 - 0.25, gE + F1 + 0.2), M.stoneWhite)));
  g.add(shadow(new THREE.Mesh(bandGeo(body, 0.2, T - 0.5, T), M.stoneWhite)));
  const cor = offsetPoly(body, 0.55);
  g.add(shadow(new THREE.Mesh(mergeGeometries([wallsGeo(cor, T, T + 0.7), capGeo(cor, T, [body], true)]), M.stoneWhite), true));
  const par = offsetPoly(body, 0.1);
  g.add(shadow(new THREE.Mesh(mergeGeometries([wallsGeo(par, T + 0.7, T + 1.4), capGeo(par, T + 1.4), capGeo(cor, T + 0.7, [par])]), M.stoneWhite), true));
  const fin = [];
  const fg = mergeGeometries([boxM(0.34, 0.5, 0.34).translate(0, 0.25, 0), new THREE.SphereGeometry(0.2, 8, 6).toNonIndexed().translate(0, 0.62, 0)].map((q) => { q.deleteAttribute('uv'); return q; }));
  for (let i = 0; i < par.length; i++) {
    const a = par[i], q = par[(i + 1) % par.length], L = Math.hypot(q[0] - a[0], q[1] - a[1]); const n = Math.max(1, Math.round(L / BAY));
    for (let k = 0; k <= n; k++) { if (k === n && i < par.length - 1) continue; fin.push(fg.clone().translate(a[0] + ((q[0] - a[0]) * k) / n, T + 1.4, a[1] + ((q[1] - a[1]) * k) / n)); }
  }
  g.add(shadow(new THREE.Mesh(mergeGeometries(fin), M.stoneWhite)));
  g.add(shadow(new THREE.Mesh(capGeo(par, T + 1.15), M.roofLight)));

  // ---- 포르티코 (로컬 틀: 정면 벽 = z 0, 바깥 = +z)
  F.position.y = 0; g.add(F);
  const W = PW + 0.6, colZ = PD - 0.7, colTop = T - 1.7, nCol = 6;
  // 정면 테라스 (화강석, 몸체 정면 전체)
  const bodyLen = Math.max(...body.map((p) => (p[0] - mid[0]) * Ul[0] + (p[1] - mid[1]) * Ul[1])) - Math.min(...body.map((p) => (p[0] - mid[0]) * Ul[0] + (p[1] - mid[1]) * Ul[1]));
  const terr = new THREE.Mesh(boxM(bodyLen + 1, 1.6, PD + 3.2), M.pave); terr.position.set(0, gE - 0.8, (PD + 3.2) / 2); F.add(shadow(terr));
  // 원기둥 6개 (주초·주두)
  const colH = colTop - gE;
  const colGeo = mergeGeometries([
    new THREE.CylinderGeometry(0.5, 0.58, colH - 1.2, 20, 1, true).toNonIndexed().translate(0, 0.6 + (colH - 1.2) / 2, 0),
    boxM(1.45, 0.6, 1.45).translate(0, 0.3, 0),
    new THREE.CylinderGeometry(0.72, 0.52, 0.35, 20).toNonIndexed().translate(0, colH - 0.6 + 0.17, 0),
    boxM(1.5, 0.28, 1.5).translate(0, colH - 0.14, 0),
  ]);
  const cols = [];
  for (let k = 0; k < nCol; k++) cols.push(colGeo.clone().translate(-W / 2 + 1.0 + (k * (W - 2.0)) / (nCol - 1), gE, colZ));
  F.add(shadow(new THREE.Mesh(mergeGeometries(cols), M.stoneWhite), true));
  // 엔타블러처 + 박공 페디먼트 + 둘레 코니스
  const entD = PD + 0.5;
  F.add(shadow(at(new THREE.Mesh(boxM(W + 0.4, T - colTop, entD), M.stoneWhite), 0, (colTop + T) / 2, entD / 2 - 0.2), true));
  F.add(shadow(at(new THREE.Mesh(boxM(W + 1.0, 0.7, entD + 0.6), M.stoneWhite), 0, T + 0.35, entD / 2 - 0.1), true));
  const pedH = Math.min(4.6, W * 0.2);
  const ped = new THREE.Mesh(gablePrism(W + 1.0, pedH, entD + 0.6), M.stoneWhite); ped.position.set(0, T + 0.7, entD / 2 - 0.1); F.add(shadow(ped, true));
  // 박공 경사 처마돌림 (얇은 판 2장)
  const sl = Math.hypot((W + 1.0) / 2, pedH), ang = Math.atan2(pedH, (W + 1.0) / 2);
  for (const s of [1, -1]) { const r = new THREE.Mesh(boxM(sl + 0.6, 0.35, 0.5), M.stoneWhite); r.rotation.z = s * ang; r.position.set((s * (W + 1.0)) / 4, T + 0.7 + pedH / 2 + 0.12, entD + 0.25); F.add(r); }
  // 페디먼트 원형 문장
  const mm = M.label('med', 2.1, 2.1); mm.position.set(0, T + 0.7 + pedH * 0.38, entD + 0.21); F.add(mm);
  // 2층 높이 발코니 (기둥 사이) + 난간 + 학과 간판
  const balY = gE + F1 + 0.15;
  F.add(shadow(at(new THREE.Mesh(boxM(W - 0.6, 0.35, colZ + 0.3), M.stoneWhite), 0, balY, (colZ + 0.3) / 2)));
  const rail = canvasTex(512, 64, (c, w, h) => {
    c.clearRect(0, 0, w, h); c.fillStyle = '#e8e5de';
    c.fillRect(0, 0, w, 10); c.fillRect(0, h - 8, w, 8);
    for (let x = 6; x < w; x += 16) { c.beginPath(); c.ellipse(x + 4, h / 2, 5, 22, 0, 0, 7); c.fill(); }
  }, { repeat: [1 / 3, 1] });
  const railMat = std({ map: rail, alphaTest: 0.5, side: THREE.DoubleSide });
  const rp = new THREE.PlaneGeometry(W - 0.6, 1.0); { const uv = rp.attributes.uv; for (let k = 0; k < uv.count; k++) uv.setX(k, uv.getX(k) * (W - 0.6)); }
  F.add(at(new THREE.Mesh(rp, railMat), 0, balY + 0.67, colZ + 0.1));
  F.add(at(M.label('signs505', W - 0.6, 0.35), 0, balY, colZ + 0.31));
  // 유리 출입문 (가운데)
  F.add(at(new THREE.Mesh(new THREE.PlaneGeometry(3.2, 3.0), M.glassDark), 0, gE + 1.5, 0.05));
  // 정면 계단 (테라스 → 앞 잔디 쪽, 가운데)
  {
    const zf = PD + 3.2, yb = heightAt(mid[0] + nx * (zf + 2.5), mid[1] + nz * (zf + 2.5));
    const n = Math.max(0, Math.round((gE - yb) / 0.16));
    const st = [];
    for (let k = 0; k < n; k++) st.push(boxM(8, gE - yb - k * 0.16, 0.36).translate(0, yb - 0.4 + (gE - yb - k * 0.16) / 2 + 0.2, zf + (n - k) * 0.34 - 0.17));
    if (st.length) F.add(shadow(new THREE.Mesh(mergeGeometries(st), M.pave)));
  }
  // 오른쪽 날개 상부 금속 접힘판 부조 (3장)
  {
    const relMat = std({ color: 0xd9d6cf, roughness: 0.45, metalness: 0.35, side: THREE.DoubleSide, flatShading: true });
    const x0 = PW / 2 + 4.5, wR = Math.min(13.5, bodyLen / 2 - PW / 2 - 4.8), y0 = gE + F1 + FL * 1.05, y1 = gE + F1 + FL * 2.3;
    F.add(at(new THREE.Mesh(new THREE.PlaneGeometry(wR, y1 - y0 + 0.6), M.stoneWhite), x0 + wR / 2, (y0 + y1) / 2, 0.04));
    const P = [];
    for (let i = 0; i < 3; i++) {
      const xa = x0 + (i * wR) / 3 + 0.2, xb = x0 + ((i + 1) * wR) / 3 - 0.2, xm = (xa + xb) / 2 + (i - 1) * 0.4;
      const yt = y1 - i * 0.25, yb2 = y0 + 0.3 + i * 0.2;
      const TL = [xa, yt, 0.1], TR = [xb, yt, 0.1], B = [xm, yb2, 0.1], C = [xm - 0.3, (yt + yb2) / 2 + 0.4, 0.55];
      for (const tri of [[TL, C, TR], [TL, B, C], [C, B, TR]]) for (const v of tri) P.push(...v);
    }
    const rg = new THREE.BufferGeometry(); rg.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); rg.computeVertexNormals();
    F.add(shadow(new THREE.Mesh(rg, relMat), true));
    // 505 번호판
    F.add(at(M.label('plate505', 1.5, 0.75), x0 + wR - 1.6, gE + F1 + FL * 3.35, 0.06));
  }
  const [fux, fuz] = F.userData.U;
  const clearPoly = [[-bodyLen / 2 - 1, -0.5], [bodyLen / 2 + 1, -0.5], [bodyLen / 2 + 1, PD + 9], [-bodyLen / 2 - 1, PD + 9]].map(([x, z]) => [mid[0] + fux * x + nx * z, mid[1] + fuz * x + nz * z]);
  return { group: g, top: T + pedH + 0.7, clear: [clearPoly] };
}

// ---------- 506 사범대학 별관
async function make506(b, heightAt, M, ent) {
  const g = new THREE.Group(); g.name = '506 사범대학 별관';
  const pts = b.pts;
  const [gLo] = groundRange(pts, heightAt);
  const e = nearestEdge(pts, ent || pts[0]);
  // 정면 = 출입구가 있는 변(같은 방향 이웃 변까지 이어 붙임)
  const N = outNormals(pts); let i0 = e.i, i1 = e.i;
  const same = (k) => N[(k + pts.length) % pts.length][0] * e.n[0] + N[(k + pts.length) % pts.length][1] * e.n[1] > 0.97;
  while (same(i0 - 1) && i0 - 1 !== e.i - pts.length) i0--;
  while (same(i1 + 1) && i1 + 1 !== e.i + pts.length) i1++;
  const A = pts[(i0 + pts.length) % pts.length], B = pts[(i1 + 1) % pts.length];
  const FW = Math.hypot(B[0] - A[0], B[1] - A[1]);
  const mid = [(A[0] + B[0]) / 2, (A[1] + B[1]) / 2];
  const gE = heightAt(mid[0] + e.n[0] * 4, mid[1] + e.n[1] * 4) + 0.1;
  const BAY = 3.3, F1 = 3.6, FL = 3.5, NUP = 4, T = gE + F1 + FL * NUP;
  const pxM = 256 / BAY;
  const { plaster } = M.img;
  const bodyTex = canvasTex(256, Math.round(pxM * FL), (c, W, H) => {
    paintBase(c, plaster, '#f1f0ec', W, H, pxM, 2, 0.6);
    // 창 아래 베이지 금속 패널 띠
    c.fillStyle = '#c9bfa8'; c.fillRect(W * 0.04, H * 0.66, W * 0.92, H * 0.3);
    c.fillStyle = 'rgba(0,0,0,.08)'; c.fillRect(W * 0.04, H * 0.66, W * 0.92, 3);
    paintWin(c, W * 0.12, H * 0.12, W * 0.76, H * 0.48, { frame: '#2c3438', glass: '#4e8a96', mullV: 1, fw: 5 });
  }, { repeat: [1 / BAY, 1 / FL] });
  const bodyMat = std({ map: bodyTex, roughness: 0.85 });
  const whiteMat = std({ map: M.plain('#f1f0ec', plaster, 2, 0.6), roughness: 0.85, side: THREE.DoubleSide });
  g.add(shadow(new THREE.Mesh(wallsGeo(pts, gLo - 0.6, gE + F1, { vBase: gE }), whiteMat), true));
  g.add(shadow(new THREE.Mesh(wallsGeo(pts, gE + F1, T, { vBase: gE + F1, bay: BAY }), bodyMat), true));
  // 짙은 처마 끝 + 지붕
  g.add(shadow(new THREE.Mesh(bandGeo(pts, 0.25, T, T + 0.7), M.steel), true));
  g.add(shadow(new THREE.Mesh(capGeo(pts, T + 0.55), M.roofGrey)));
  // 비탈 쪽 드러난 기단: 화강석 줄눈 띠
  g.add(shadow(new THREE.Mesh(bandGeo(pts, 0.08, gLo - 0.6, Math.min(gE - 0.2, gLo + 1.2)), M.pave)));

  const F = frameAt(mid, [(B[0] - A[0]) / FW, (B[1] - A[1]) / FW], [mid[0] + e.n[0], mid[1] + e.n[1]], gE);
  g.add(F);
  // 오른쪽(정면에서 볼 때) 위 유리 계단실
  const gl = canvasTex(256, 512, (c, w, h) => {
    const gr = c.createLinearGradient(0, 0, w, h); gr.addColorStop(0, '#9fc9cf'); gr.addColorStop(0.5, '#4e9aa0'); gr.addColorStop(1, '#2f6266'); c.fillStyle = gr; c.fillRect(0, 0, w, h);
    c.fillStyle = '#2c3438'; for (let x = 0; x <= w; x += w / 3) c.fillRect(x - 3, 0, 6, h); for (let y = 0; y <= h; y += h / 6) c.fillRect(0, y - 3, w, 6);
  });
  const glMat = std({ map: gl, roughness: 0.15, metalness: 0.3 });
  const sx = FW / 2 - 3.4;
  F.add(shadow(at(new THREE.Mesh(new THREE.BoxGeometry(3.6, T - gE - F1 - FL - 1.3, 0.7), glMat), sx, (F1 + FL + T - gE - 1.3) / 2, 0.3)));
  F.add(at(M.label('plate506', 1.6, 0.8), sx, T - gE - 0.6, 0.08));
  // 구멍 3개 뚫린 흰 곡면 가림벽 (외부 계단 앞)
  {
    const WW = 4.6, WH = 10.6;
    const s = new THREE.Shape(); s.moveTo(-WW / 2, 0); s.lineTo(WW / 2, 0); s.lineTo(WW / 2, WH); s.lineTo(-WW / 2, WH); s.closePath();
    for (const y of [1.6, 5.0, 8.4]) { const h = new THREE.Path(); h.absarc(-WW / 2 + 1.5, y, 0.85, 0, Math.PI * 2, true); s.holes.push(h); }
    const wg = new THREE.ExtrudeGeometry(s, { depth: 0.3, bevelEnabled: false, curveSegments: 20 });
    const cx = FW / 2 - WW / 2 - 1.6, cz = 3.0;
    F.add(shadow(at(new THREE.Mesh(wg, whiteMat), cx, 0, cz), true));
    // 오른쪽 끝이 건물 쪽으로 둥글게 감김
    const R = 1.5;
    const cyl = new THREE.Mesh(new THREE.CylinderGeometry(R, R, WH, 16, 1, true, 0, Math.PI / 2), whiteMat);
    cyl.position.set(cx + WW / 2, WH / 2, cz + 0.3 - R); F.add(shadow(cyl, true));
    // 흰 철제 외부 계단 (가림벽 뒤)
    const st = [];
    for (let k = 0; k < 3; k++) { st.push(boxM(1.4, 0.2, 2.6).translate(cx + 0.6, F1 * (k + 1) - 0.1, 1.5)); st.push(boxM(1.2, 0.15, 3.4).translate(cx - 0.8, F1 * (k + 0.5), 1.4).rotateX(0)); }
    F.add(shadow(new THREE.Mesh(mergeGeometries(st), whiteMat)));
    F.add(at(M.label('sign506', 3.0, 0.75), cx + 0.7, 7.3, cz + 0.32));
  }
  // 출입문
  F.add(at(new THREE.Mesh(new THREE.PlaneGeometry(2.2, 2.6), M.glassDark), FW / 2 - 7.2, 1.3, 0.05));
  const clear = [[-FW / 2, -0.5], [FW / 2 + 1, -0.5], [FW / 2 + 1, 5.5], [-FW / 2, 5.5]].map(([x, z]) => { const [ux, uz] = F.userData.U, [nx, nz] = F.userData.N; return [mid[0] + ux * x + nx * z, mid[1] + uz * x + nz * z]; });
  return { group: g, top: T + 0.7, clear: [clear] };
}

// ---------- 507 자연과학대학
async function make507(b, heightAt, M, ent) {
  const g = new THREE.Group(); g.name = '507 자연과학대학';
  const pts = b.pts;
  const [gLo] = groundRange(pts, heightAt);
  const e = nearestEdge(pts, ent || pts[0]);
  const gOut = heightAt(e.p[0] + e.n[0] * 6, e.p[1] + e.n[1] * 6);
  const STEPS = 7, RISE = 0.15, gE = gOut + STEPS * RISE;
  const BAY = 3.4, FL = 3.6, NF = 7, T = gE + FL * NF;
  const pxM = 1024 / (8 * BAY);
  const { plaster } = M.img;
  const R = rng(507);
  // 8칸 × 4층 무늬: 창 아래 패널이 노랑·웜그레이·남회색·흰색으로 무작위
  const panelCols = ['#e3b43a', '#e3b43a', '#a69c92', '#a69c92', '#4a5566', '#f2f1ec', '#f2f1ec'];
  const bodyTex = canvasTex(1024, Math.round(pxM * FL * 4), (c, W, H) => {
    paintBase(c, plaster, '#f2f1ec', W, H, pxM, 2, 0.5);
    const bw = W / 8, fh = H / 4;
    for (let f = 0; f < 4; f++) for (let k = 0; k < 8; k++) {
      const x = k * bw, y = f * fh;
      const col = panelCols[Math.floor(R() * panelCols.length)];
      c.fillStyle = col; c.fillRect(x + bw * 0.1, y + fh * 0.64, bw * 0.8, fh * 0.26);
      if (col !== '#f2f1ec') { c.fillStyle = 'rgba(0,0,0,.1)'; c.fillRect(x + bw * 0.1, y + fh * 0.64, bw * 0.8, 3); }
      paintWin(c, x + bw * 0.1, y + fh * 0.16, bw * 0.8, fh * 0.44, { frame: '#5a5e62', glass: '#6f8a9a', mullV: 2, fw: 4 });
      if (R() < 0.35) { c.fillStyle = 'rgba(235,235,230,.55)'; c.fillRect(x + bw * 0.1, y + fh * 0.16, bw * 0.8 * (0.3 + R() * 0.5), fh * 0.44); } // 블라인드
    }
  }, { repeat: [1 / (8 * BAY), 1 / (4 * FL)] });
  // 1층: 회색 세로 루버 + 어두운 유리
  const louv = canvasTex(256, Math.round((256 / BAY) * FL), (c, W, H) => {
    c.fillStyle = '#39434a'; c.fillRect(0, 0, W, H);
    c.fillStyle = '#c8c8c4'; for (let k = 0; k < 10; k++) c.fillRect((k * W) / 10, H * 0.08, W * 0.055, H * 0.84);
    c.fillStyle = '#e8e7e2'; c.fillRect(0, 0, W, H * 0.08); c.fillRect(0, H * 0.92, W, H * 0.08);
  }, { repeat: [1 / BAY, 1 / FL] });
  const bodyMat = std({ map: bodyTex, roughness: 0.85 }), louvMat = std({ map: louv, roughness: 0.6, metalness: 0.2 });
  g.add(shadow(new THREE.Mesh(wallsGeo(pts, gLo - 0.6, gE, { vBase: gE, bay: BAY }), bodyMat), true));
  g.add(shadow(new THREE.Mesh(wallsGeo(pts, gE, gE + FL, { vBase: gE, bay: BAY }), louvMat), true));
  g.add(shadow(new THREE.Mesh(wallsGeo(pts, gE + FL, T, { vBase: gE, bay: BAY }), bodyMat), true));
  g.add(shadow(new THREE.Mesh(bandGeo(pts, 0.15, T, T + 0.9), std({ map: M.plain('#e9e8e3', plaster, 2, 0.5) })), true));
  g.add(shadow(new THREE.Mesh(capGeo(pts, T + 0.7), M.roofGrey)));
  // 노란 타일 돌출 박스 · 철제 발코니 (긴 변에 드문드문)
  const tile = canvasTex(128, 128, (c, w, h) => { c.fillStyle = '#b98f22'; c.fillRect(0, 0, w, h); c.fillStyle = '#e3b43a'; for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) c.fillRect(x * 16 + 1, y * 16 + 1, 14, 14); }, { repeat: [1, 1] });
  const tileMat = std({ map: tile, roughness: 0.4 });
  const N = outNormals(pts), yb = [], sb = [];
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i], q = pts[(i + 1) % pts.length], L = Math.hypot(q[0] - a[0], q[1] - a[1]); if (L < 14) continue;
    const nb = Math.round(L / BAY), ux = (q[0] - a[0]) / L, uz = (q[1] - a[1]) / L, [nx, nz] = N[i], ang = Math.atan2(nx, nz);
    for (let f = 1; f < NF; f++) for (let k = 1; k < nb - 1; k++) {
      const r = R(); if (r > 0.1) continue;
      const s = ((k + 0.5) * L) / nb, px = a[0] + ux * s, pz = a[1] + uz * s;
      const isY = r < 0.065, d = isY ? 0.9 : 0.75;
      const geo = (isY ? boxM((L / nb) * 0.86, 1.25, d) : boxM((L / nb) * 0.86, 1.0, d)).rotateY(ang).translate(px + nx * d / 2, gE + f * FL + (isY ? 0.55 : 0.5), pz + nz * d / 2);
      (isY ? yb : sb).push(geo);
    }
  }
  if (yb.length) g.add(shadow(new THREE.Mesh(mergeGeometries(yb), tileMat), true));
  if (sb.length) g.add(shadow(new THREE.Mesh(mergeGeometries(sb), M.steel)));
  // 현관: 앞마당에서 7단 계단 + 유리 캐노피
  const F = frameAt(e.p, e.u, [e.p[0] + e.n[0], e.p[1] + e.n[1]], gE); g.add(F);
  const SW = 9;
  // 계단 (k=0 이 가장 높은 단 → 바깥쪽으로 갈수록 낮아짐)
  const st2 = [];
  for (let k = 0; k < STEPS; k++) { const hgt = (STEPS - k) * RISE; st2.push(boxM(SW, hgt + 0.6, 0.36).translate(0, -STEPS * RISE - 0.6 + (hgt + 0.6) / 2, 2.6 + k * 0.36 + 0.18)); }
  st2.push(boxM(SW, 0.6, 2.6).translate(0, -0.3, 1.3)); // 현관 앞 단
  F.add(shadow(new THREE.Mesh(mergeGeometries(st2), M.pave)));
  const canG = new THREE.MeshPhysicalMaterial({ color: 0x8fb3c2, roughness: 0.05, metalness: 0.1, transparent: true, opacity: 0.55 });
  F.add(at(new THREE.Mesh(new THREE.BoxGeometry(SW - 1, 0.12, 3.6), canG), 0, 3.4, 1.8));
  F.add(at(new THREE.Mesh(boxM(SW - 1, 0.25, 0.2), M.steel), 0, 3.35, 3.6));
  for (const x of [-(SW - 1) / 2 + 0.3, (SW - 1) / 2 - 0.3]) F.add(at(new THREE.Mesh(boxM(0.15, 3.4, 0.15), M.steel), x, 1.7, 3.5));
  F.add(at(new THREE.Mesh(new THREE.PlaneGeometry(4.2, 2.8), M.glassDark), 0, 1.4, 0.06));
  F.add(at(M.label('ban507', SW - 1.5, 0.95), 0, 4.4, 0.08));
  // 옥상 근처 '507 자연과학대학' 글씨 — 현관 쪽 가장 긴 변
  {
    let best = null;
    for (let i = 0; i < pts.length; i++) { const a = pts[i], q = pts[(i + 1) % pts.length], L = Math.hypot(q[0] - a[0], q[1] - a[1]); const sc = L * (1 + (N[i][0] * e.n[0] + N[i][1] * e.n[1])); if (!best || sc > best.sc) best = { sc, a, q, L, n: N[i] }; }
    const t = 0.12, px = best.a[0] + (best.q[0] - best.a[0]) * t, pz = best.a[1] + (best.q[1] - best.a[1]) * t;
    const ux = (best.q[0] - best.a[0]) / best.L, uz = (best.q[1] - best.a[1]) / best.L;
    const m = M.label('letters507', 12, 1.5);
    // 정면에서 볼 때 왼→오 가 되도록: 평면 +X = 법선 기준 오른쪽
    m.position.set(px + ux * 6 + best.n[0] * 0.08, T - 1.0, pz + uz * 6 + best.n[1] * 0.08);
    m.rotation.y = Math.atan2(best.n[0], best.n[1]);
    g.add(m);
  }
  const clear = [[-SW / 2 - 1, -0.5], [SW / 2 + 1, -0.5], [SW / 2 + 1, 6], [-SW / 2 - 1, 6]].map(([x, z]) => { const [ux, uz] = F.userData.U, [nx, nz] = F.userData.N; return [e.p[0] + ux * x + nx * z, e.p[1] + uz * x + nz * z]; });
  return { group: g, top: T + 0.9, clear: [clear] };
}

// ---------- 508 인문관
async function make508(b, heightAt, M, ent) {
  const g = new THREE.Group(); g.name = '508 인문관';
  const pts = b.pts;
  const [gLo] = groundRange(pts, heightAt);
  const e = nearestEdge(pts, ent || pts[0]);
  const gE = heightAt(e.p[0] + e.n[0] * 4, e.p[1] + e.n[1] * 4) + 0.15;
  const BAY = 3.2, FL = 3.6, NF = 5, T = gE + FL * NF;
  const pxM = 1024 / (8 * BAY);
  const { plaster, conc } = M.img;
  const R = rng(508);
  const bodyTex = canvasTex(1024, Math.round(pxM * FL * 2), (c, W, H) => {
    paintBase(c, plaster, '#f2f1ed', W, H, pxM, 2, 0.5);
    const bw = W / 8, fh = H / 2;
    for (let f = 0; f < 2; f++) for (let k = 0; k < 8; k++) {
      const x = k * bw, y = f * fh;
      paintWin(c, x + bw * 0.24, y + fh * 0.2, bw * 0.52, fh * 0.46, { frame: '#3a3e42', glass: '#4e7a80', mullV: 1, fw: 4 });
      const r = R();
      if (r < 0.14) { c.fillStyle = '#e3b43a'; c.fillRect(x + bw * 0.8, y + fh * 0.16, bw * 0.12, fh * 0.54); }
      else if (r < 0.24) { c.fillStyle = '#4a4e54'; c.fillRect(x + bw * 0.8, y + fh * 0.16, bw * 0.12, fh * 0.54); }
    }
  }, { repeat: [1 / (8 * BAY), 1 / (2 * FL)] });
  const bodyMat = std({ map: bodyTex, roughness: 0.85 });
  g.add(shadow(new THREE.Mesh(wallsGeo(pts, gLo - 0.6, T, { vBase: gE, bay: BAY }), bodyMat), true));
  g.add(shadow(new THREE.Mesh(capGeo(pts, T + 0.4), M.roofGrey)));
  // 층마다 회색 가로 루버 띠 (창 아래) + 최상층 위 루버 처마
  const lv = canvasTex(64, 64, (c, w, h) => { c.fillStyle = '#6d7174'; c.fillRect(0, 0, w, h); c.fillStyle = '#9a9ea1'; for (let y = 0; y < h; y += 16) c.fillRect(0, y, w, 10); }, { repeat: [1, 1 / 0.45] });
  const lvMat = std({ map: lv, roughness: 0.5, metalness: 0.35 });
  const bands = [];
  for (let f = Math.floor((gLo - gE) / FL); f < NF; f++) { const y = gE + f * FL + 0.75; if (y < gLo - 0.3) continue; bands.push(bandGeo(pts, 0.55, y, y + 0.42)); }
  bands.push(bandGeo(pts, 0.8, T, T + 0.75));
  g.add(shadow(new THREE.Mesh(mergeGeometries(bands), lvMat), true));
  // 출입문 + 가운데 동 옥상 간판 '인문과학대학 508'
  g.add(doorMesh(M.glassDark, e.p, e.n, gE, 3.2, 2.8));
  {
    const m = new THREE.Group();
    m.add(shadow(new THREE.Mesh(boxM(10, 1.9, 0.5), M.steel), true));
    m.add(at(M.label('sign508', 9.8, 1.84), 0, 0, 0.26));
    const px = e.p[0] - e.n[0] * 1.2, pz = e.p[1] - e.n[1] * 1.2;
    m.position.set(px, T + 0.4 + 0.95 + 0.3, pz); m.rotation.y = Math.atan2(e.n[0], e.n[1]);
    g.add(m);
  }
  return { group: g, top: T + 3.2 };
}

// ---------- 501 백남학술정보관
async function make501(b, heightAt, M, ent) {
  const g = new THREE.Group(); g.name = '501 백남학술정보관';
  const pts = b.pts;
  const [gLo] = groundRange(pts, heightAt);
  const e = nearestEdge(pts, ent || pts[0]);
  const gE = heightAt(e.p[0] + e.n[0] * 4, e.p[1] + e.n[1] * 4) + 0.15;
  const BAY = 3.0, FL = 4.2, F1 = 4.6;
  const pxM = 1024 / (4 * BAY);
  const { granite } = M.img;
  // 화강석 판 격자 + 작은 사각 창 (4칸 중 1칸은 세로 슬릿창)
  const tex = canvasTex(1024, Math.round(pxM * FL), (c, W, H) => {
    paintBase(c, granite, '#cfcfca', W, H, pxM, 1.4);
    c.fillStyle = 'rgba(70,70,66,.28)';
    for (let y = 0; y < H; y += pxM * 0.7) c.fillRect(0, y, W, 2);
    for (let x = 0; x < W; x += pxM * 1.0) c.fillRect(x, 0, 2, H);
    const bw = W / 4;
    for (let k = 0; k < 4; k++) {
      if (k === 2) paintWin(c, k * bw + bw * 0.44, H * 0.08, bw * 0.12, H * 0.8, { frame: '#5a5e62', glass: '#3a4248', mullV: 0, fw: 4 });
      else paintWin(c, k * bw + bw * 0.3, H * 0.3, bw * 0.4, H * 0.36, { frame: '#5a5e62', glass: '#3a4248', mullV: 0, fw: 5 });
    }
  }, { repeat: [1 / (4 * BAY), 1 / FL] });
  const mat = std({ map: tex, roughness: 0.8 });
  const glassTex = canvasTex(256, 256, (c, w, h) => { const gr = c.createLinearGradient(0, 0, w * 0.3, h); gr.addColorStop(0, '#7f97a6'); gr.addColorStop(0.5, '#3a4248'); gr.addColorStop(1, '#22282c'); c.fillStyle = gr; c.fillRect(0, 0, w, h); c.fillStyle = '#5a5e62'; for (let x = 0; x < w; x += w / 2) c.fillRect(x, 0, 5, h); c.fillRect(0, h * 0.62, w, 5); }, { repeat: [1 / 2.0, 1 / F1] });
  const glassMat = std({ map: glassTex, roughness: 0.2, metalness: 0.4 });
  const in1 = offsetPoly(pts, -1.3), in5 = offsetPoly(pts, -2.2);
  const y2 = gE + F1, y5 = y2 + FL * 3, y6 = y5 + FL, T = y6 + FL;
  g.add(shadow(new THREE.Mesh(wallsGeo(in1, gLo - 0.5, y2, { vBase: gE, bay: 2.0 }), glassMat), true));
  g.add(shadow(new THREE.Mesh(capGeo(pts, y2 - 0.05, [in1], true), M.stoneWhite)));
  g.add(shadow(new THREE.Mesh(wallsGeo(pts, y2, y5, { vBase: y2, bay: BAY }), mat), true));
  // 5층: 깊은 수평 홈 (그림자 띠)
  g.add(shadow(new THREE.Mesh(mergeGeometries([wallsGeo(in5, y5, y6, { vBase: y5, bay: 2.0 }), capGeo(pts, y5, [in5]), capGeo(pts, y6, [in5], true)]), glassMat)));
  g.add(shadow(new THREE.Mesh(wallsGeo(pts, y6, T + 1.2, { vBase: y6, bay: BAY }), mat), true));
  g.add(shadow(new THREE.Mesh(capGeo(pts, T + 1.2), M.roofLight)));
  // 1층·5층 화강석 기둥 (홈 안)
  const piers = [];
  const Nn = outNormals(pts);
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i], q = pts[(i + 1) % pts.length], L = Math.hypot(q[0] - a[0], q[1] - a[1]); if (L < 6) continue;
    const n = Math.max(1, Math.round(L / 7.5)), ang = Math.atan2(Nn[i][0], Nn[i][1]);
    for (let k = 0; k <= n; k++) {
      const s = 0.6 + ((L - 1.2) * k) / n, px = a[0] + ((q[0] - a[0]) * s) / L - Nn[i][0] * 0.7, pz = a[1] + ((q[1] - a[1]) * s) / L - Nn[i][1] * 0.7;
      piers.push(boxM(1.1, y2 - gLo + 0.5, 1.2).rotateY(ang).translate(px, (gLo - 0.5 + y2) / 2, pz));
      piers.push(boxM(1.0, FL, 1.0).rotateY(ang).translate(px, (y5 + y6) / 2, pz));
    }
  }
  g.add(shadow(new THREE.Mesh(mergeGeometries(piers), M.stoneWhite), true));
  return { group: g, top: T + 1.2 };
}

// ---------- 계단: OSM 계단 중 수치지도 계단 면이 덮지 않는 구간
function makeStairs(world, heightAt, near, mats) {
  const bb = (pts, pad = 0) => { let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity; for (const [x, z] of pts) { x0 = Math.min(x0, x); z0 = Math.min(z0, z); x1 = Math.max(x1, x); z1 = Math.max(z1, z); } return [x0 - pad, z0 - pad, x1 + pad, z1 + pad]; };
  const hit = (a, b) => a[0] <= b[2] && b[0] <= a[2] && a[1] <= b[3] && b[1] <= a[3];
  const stairBB = (world.stairs || []).map((s) => ({ pts: s.pts, b: bb(s.pts, 1.5) }));
  const bldBB = world.buildings.map((b) => ({ pts: b.pts, b: bb(b.pts) }));
  const nearBB = near.map((pts) => ({ pts, b: bb(pts, 26) }));
  let candS = [], candB = [], candN = [];
  const inB = (p, b) => p[0] >= b[0] && p[0] <= b[2] && p[1] >= b[1] && p[1] <= b[3];
  const covered = (p) => candS.some((s) => inB(p, s.b) && polyDist(p, s.pts) < 1.5);
  const inBld = (p) => candB.some((b) => inB(p, b.b) && pointInPoly(p[0], p[1], b.pts));
  const nearMine = (p) => candN.some((n) => inB(p, n.b) && polyDist(p, n.pts) < 26);
  const parts = [], curbs = [], clear = [];
  let runs = 0;
  for (const r of world.roads || []) {
    if (r.kind !== 'steps' && r.hw !== 'steps') continue;
    const rb = bb(r.pts, 2);
    candN = nearBB.filter((n) => hit(n.b, rb)); if (!candN.length) continue;
    if (!r.pts.some(nearMine)) continue;
    candS = stairBB.filter((q) => hit(q.b, rb)); candB = bldBB.filter((q) => hit(q.b, rb));
    // 1m 간격 표본 → 덮이지 않은 연속 구간
    const S = [];
    for (let i = 1; i < r.pts.length; i++) {
      const a = r.pts[i - 1], b = r.pts[i], L = Math.hypot(b[0] - a[0], b[1] - a[1]);
      for (let s = 0; s < L; s += 1.0) S.push([a[0] + ((b[0] - a[0]) * s) / L, a[1] + ((b[1] - a[1]) * s) / L, (b[0] - a[0]) / L, (b[1] - a[1]) / L]);
    }
    const ok = S.map((p) => nearMine(p) && !covered(p) && !inBld(p));
    let k = 0;
    while (k < S.length) {
      if (!ok[k]) { k++; continue; }
      let j = k; while (j + 1 < S.length && ok[j + 1]) j++;
      if (j - k >= 3) { buildRun(S.slice(k, j + 1), r.w || 2.6); runs++; }
      k = j + 1;
    }
  }
  function buildRun(seg, w) {
    // 높이: 지형을 따라가되 단(0.15m)으로 끊음
    const hs = seg.map((p) => heightAt(p[0], p[1]));
    const tread = 0.34;
    let acc = 0, prev = seg[0];
    const pts = [seg[0]];
    for (let i = 1; i < seg.length; i++) { acc += Math.hypot(seg[i][0] - prev[0], seg[i][1] - prev[1]); prev = seg[i]; }
    const total = acc, n = Math.max(2, Math.round(total / tread));
    // 길이 비율로 재표본
    const cum = [0]; for (let i = 1; i < seg.length; i++) cum.push(cum[i - 1] + Math.hypot(seg[i][0] - seg[i - 1][0], seg[i][1] - seg[i - 1][1]));
    const sample = (d) => { let i = 1; while (i < cum.length - 1 && cum[i] < d) i++; const t = (d - cum[i - 1]) / Math.max(1e-6, cum[i] - cum[i - 1]); const a = seg[i - 1], b = seg[i]; return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, b[0] - a[0], b[1] - a[1], hs[i - 1] + (hs[i] - hs[i - 1]) * t]; };
    for (let m = 0; m < n; m++) {
      const p = sample(((m + 0.5) * total) / n); const dl = Math.hypot(p[2], p[3]) || 1;
      const top = Math.round(p[4] / 0.15) * 0.15 + 0.1, ang = Math.atan2(p[2] / dl, p[3] / dl);
      parts.push(boxM(w, 1.0, total / n + 0.03).rotateY(ang).translate(p[0], top - 0.5, p[1]));
      for (const s of [1, -1]) curbs.push(boxM(0.25, 1.35, total / n + 0.03).rotateY(ang).translate(p[0] + (s * (w / 2 + 0.12) * p[3]) / dl, top - 0.33, p[1] - (s * (w / 2 + 0.12) * p[2]) / dl));
    }
    const a = seg[0], b = seg[seg.length - 1];
    const ux = b[0] - a[0], uz = b[1] - a[1], L = Math.hypot(ux, uz) || 1, nx = -uz / L, nz = ux / L, hw = w / 2 + 1.5;
    clear.push([[a[0] + nx * hw, a[1] + nz * hw], [b[0] + nx * hw, b[1] + nz * hw], [b[0] - nx * hw, b[1] - nz * hw], [a[0] - nx * hw, a[1] - nz * hw]]);
  }
  const g = new THREE.Group(); g.name = 'hill-stairs';
  if (parts.length) g.add(shadow(new THREE.Mesh(mergeGeometries(parts), mats.pave)));
  if (curbs.length) g.add(shadow(new THREE.Mesh(mergeGeometries(curbs), mats.stoneWhite)));
  return { group: g, clear, runs };
}

export default async function (ctx) {
  const { world, heightAt } = ctx;
  const group = new THREE.Group(); group.name = 'zone-hill';
  const tm = performance.now();
  const M = await makeMats();
  const site = (no) => world.buildings.find((b) => b.no === no);
  // 주출입구 (OSM 출입구 점, campus-data site.json)
  const ENT = { 501: [104.1, -121.2], 505: [63.9, -211.6], 506: [28.7, -235.9], 507: [-7.2, -271.1], 508: [-63.4, -252.2] };
  const makers = { 505: make505, 506: make506, 507: make507, 508: make508, 501: make501 };
  const skipIds = [], footprints = [], clear = [];
  for (const no of ['505', '506', '507', '508', '501']) {
    const b = site(no); if (!b) continue;
    try {
      const t0 = performance.now();
      const r = await makers[no](b, heightAt, M, ENT[no]);
      group.add(r.group);
      skipIds.push(b.id);
      footprints.push({ id: b.id, pts: b.pts, top: r.top, center: [b.pts.reduce((a, p) => a + p[0], 0) / b.pts.length, b.pts.reduce((a, p) => a + p[1], 0) / b.pts.length] });
      if (r.clear) clear.push(...r.clear);
    } catch (e) { console.error(`hill ${no} 실패`, e); }
  }
  const t1 = performance.now();
  const st = makeStairs(world, heightAt, ['505', '506', '507', '508', '501'].map(site).filter(Boolean).map((b) => b.pts), M);
  group.add(st.group); clear.push(...st.clear);
  console.log(`hill stairs ${st.runs} runs ${Math.round(performance.now() - t1)}ms`);
  return { group, skipIds, footprints, clear };
}
