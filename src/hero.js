import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { facadeTexture, tieredTexture, plainTexture } from './facade.js';
import { loadTex } from './util.js';

// 사자상 대표 장면의 주인공 건물 — 로드뷰 사진(campus/<폴더>/photos)과 appearance.json 을 보고 하나씩 만든다.
//  101 역사관(구본관) · 102 본관(시계탑) · 104 애지문(유리 큐브) · 105 학생복지관(한양플라자)

// ---------- 공통 도구
const V2 = (x, z) => new THREE.Vector2(x, z);
// 최소 면적 사각형 (변 방향 회전) → 중심, 긴 축 u, 짧은 축 v, 길이
export function obb(pts) {
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
// 로컬 틀: X = U(긴 축), Z = 정면 방향(facing 쪽), Y = 위
function frameGroup(c, U, facingPt, y0) {
  let [ux, uz] = U;
  let vx = -uz, vz = ux; // three 회전에서 로컬 Z 가 되는 방향
  if ((facingPt[0] - c[0]) * vx + (facingPt[1] - c[1]) * vz < 0) { ux = -ux; uz = -uz; vx = -vx; vz = -vz; }
  const g = new THREE.Group();
  g.position.set(c[0], y0, c[1]);
  g.rotation.y = Math.atan2(-uz, ux);
  return g;
}
const shadowAll = (o) => o.traverse((m) => { if (m.isMesh) { m.castShadow = true; m.receiveShadow = true; } });
function extrude(pts, y0, h) {
  const shape = new THREE.Shape(pts.map(([x, z]) => V2(x, -z)));
  const geo = new THREE.ExtrudeGeometry(shape, { depth: h, bevelEnabled: false });
  geo.rotateX(-Math.PI / 2);
  geo.translate(0, y0, 0);
  return geo;
}
// 옆면 uv: (가로 m, 지면 기준 높이 m 또는 0~1)
function sideUV(geo, yBase, H = null) {
  const uv = geo.attributes.uv, pos = geo.attributes.position, side = geo.groups[1];
  for (let k = side.start; k < side.start + side.count; k++) uv.setY(k, H ? (pos.getY(k) - yBase) / H : pos.getY(k) - yBase);
}
function groundRange(pts, heightAt) { let lo = Infinity, hi = -Infinity; for (const [x, z] of pts) { const y = heightAt(x, z); lo = Math.min(lo, y); hi = Math.max(hi, y); } return [lo, hi]; }
// 박공(삼각) 지붕/벽 프리즘: 폭 w(X), 높이 h, 깊이 d(Z)
function gablePrism(w, h, d) {
  const s = new THREE.Shape([V2(-w / 2, 0), V2(w / 2, 0), V2(0, h)]);
  const g = new THREE.ExtrudeGeometry(s, { depth: d, bevelEnabled: false });
  g.translate(0, 0, -d / 2);
  return g;
}
// 모임지붕(hip): 길이 L(X) × 깊이 D(Z), 높이 R, 처마 내밀기 o
function hipRoof(L, D, R, o = 0.6) {
  const x = L / 2 + o, z = D / 2 + o, r = Math.max(0, L / 2 - D / 2);
  const P = [[-x, 0, -z], [x, 0, -z], [x, 0, z], [-x, 0, z], [-r, R, 0], [r, R, 0]];
  const tri = [[3, 2, 5], [3, 5, 4], [1, 0, 4], [1, 4, 5], [2, 1, 5], [0, 3, 4]];
  const pos = [], uv = [];
  for (const t of tri) for (const i of t) { pos.push(...P[i]); uv.push(P[i][0], P[i][1] + P[i][2]); }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.computeVertexNormals();
  return g;
}
function canvasTex(w, h, draw, srgb = true) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}
// 상자 uv 를 미터 단위로 (텍스처 repeat 이 1/m 이므로)
function boxM(w, h, d) {
  const g = new THREE.BoxGeometry(w, h, d), uv = g.attributes.uv;
  const dims = [[d, h], [d, h], [w, d], [w, d], [w, h], [w, h]];
  for (let f = 0; f < 6; f++) for (let k = 0; k < 4; k++) { const i = f * 4 + k; uv.setXY(i, uv.getX(i) * dims[f][0], uv.getY(i) * dims[f][1]); }
  return g;
}
const at = (m, x, y, z) => { m.position.set(x, y, z); return m; };
const std = (o) => new THREE.MeshStandardMaterial({ roughness: 0.85, metalness: 0, ...o });

// ---------- 101 역사관 (구본관, 1957) — 거친 화강석 블록 4층 + 흰 6주 포르티코 + 초록 모임지붕
async function makeHistoryHall(b, heightAt, faceTo) {
  const [gLo, gHi] = groundRange(b.pts, heightAt);
  const { c, U, lu, lv } = obb(b.pts);
  const gFront = heightAt(c[0] + (faceTo[0] - c[0]) * 0.3, c[1] + (faceTo[1] - c[1]) * 0.3);
  const FLOOR = 3.8, EAVE = gFront + 4 * FLOOR + 0.6;
  const group = new THREE.Group(); group.name = '101 역사관';

  // 벽: 실제 윤곽을 그대로 세움 (세로로 긴 창, 화강석 인방)
  const wallTex = await facadeTexture({ color: '#bfb59f', img: 'stoneblock', bay: 3.4, floor: FLOOR, frame: '#2b2b2b', glass: '#3a4048', win: { w: 0.3, h: 0.6, y: 0.2, mull: 1 } });
  const wallMat = std({ map: wallTex, roughness: 0.92 });
  const base = extrude(b.pts, gLo - 1.5, EAVE - (gLo - 1.5));
  sideUV(base, gFront);
  const roofFlat = std({ color: 0x55584f });
  group.add(new THREE.Mesh(base, [roofFlat, wallMat]));

  // 로컬 틀 (정면 = 사자상 쪽)
  const F = frameGroup(c, U, faceTo, 0);
  group.add(F);
  const L = lu, D = lv, front = D / 2;
  const white = std({ map: await plainTexture('#ecebe4', 'plaster', 2), roughness: 0.7 });
  const greenTex = await loadTex('/tex/greenmetal_diff.jpg'); greenTex.repeat.set(1 / 3, 1 / 3);
  const roofMat = std({ map: greenTex, color: 0x6f8f72, roughness: 0.6, metalness: 0.25 });
  const darkWin = std({ color: 0x23282e, roughness: 0.3, metalness: 0.3 });

  // 모임지붕 + 도머
  const R = Math.min(6.5, D * 0.42);
  const roof = new THREE.Mesh(hipRoof(L - 1, D - 1, R, 0.7), roofMat);
  roof.position.y = EAVE; F.add(roof);
  const dormer = mergeGeometries([boxM(1.7, 1.6, 2.2).translate(0, 0.8, 0), gablePrism(2.1, 1.1, 2.4).translate(0, 1.6, 0)].map((g) => g.toNonIndexed ? g.toNonIndexed() : g));
  for (const side of [1, -1]) for (let x = -L / 2 + 6; x <= L / 2 - 6; x += 5.2) {
    if (side > 0 && Math.abs(x) < 9.5) continue; // 박공 자리
    const z = side * (D / 2 - 0.5 - R * 0.35);
    const d = new THREE.Mesh(dormer, white); d.position.set(x, EAVE + R * 0.3 - 0.3, z); d.rotation.y = side > 0 ? 0 : Math.PI; F.add(d);
    const w = new THREE.Mesh(new THREE.PlaneGeometry(0.8, 1.0), darkWin); w.position.set(x, EAVE + R * 0.3 + 0.55, z + side * 1.12); w.rotation.y = side > 0 ? 0 : Math.PI; F.add(w);
  }
  // 양 끝 날개: 앞으로 살짝 나온 화강석 + 흰 박공(아치창)
  for (const s of [1, -1]) {
    const x = s * (L / 2 - 5.2);
    const wing = new THREE.Mesh(boxM(9.5, EAVE - gFront + 1.5, 2.2), wallMat);
    wing.geometry.translate(0, (EAVE - gFront + 1.5) / 2 - 1.5, 0);
    wing.position.set(x, gFront, front + 1.0); F.add(wing);
    const gab = new THREE.Mesh(gablePrism(10.4, 4.6, 2.6), white); gab.position.set(x, EAVE, front + 0.9); F.add(gab);
    const groof = new THREE.Mesh(gablePrism(11.2, 4.9, 7), roofMat); groof.position.set(x, EAVE - 0.05, front - 2.0); groof.scale.set(1, 1, 1); F.add(groof);
    const arch = new THREE.Mesh(new THREE.CircleGeometry(0.9, 20, 0, Math.PI), darkWin); arch.position.set(x, EAVE + 1.3, front + 2.21); F.add(arch);
    const archB = new THREE.Mesh(new THREE.PlaneGeometry(1.8, 1.1), darkWin); archB.position.set(x, EAVE + 0.75, front + 2.21); F.add(archB);
  }
  // 포르티코: 기단 + 흰 원기둥 6개 + 엔타블러처 + 부조 박공
  const PW = 16.5, PD = 4.8, pod = 1.4, colH = 10.2;
  const podium = new THREE.Mesh(boxM(PW + 1.2, pod + 1.5, PD + 0.6), std({ map: await plainTexture('#d6d0c4', 'granite', 1.5) }));
  podium.position.set(0, gFront + (pod - 1.5) / 2, front + PD / 2); F.add(podium);
  for (let k = 0; k < 9; k++) { // 앞 계단
    const st = new THREE.Mesh(boxM(PW - 2 + k * 0.6, 0.16 * (k + 1), 0.38), podium.material);
    st.position.set(0, gFront + 0.08 * (k + 1) - 0.02 + (pod - 0.16 * 9), front + PD + 0.3 + (8 - k) * 0.36 + 0.2); F.add(st);
  }
  const colGeo = mergeGeometries([new THREE.CylinderGeometry(0.42, 0.5, colH, 20).translate(0, colH / 2, 0), boxM(1.2, 0.35, 1.2).translate(0, 0.17, 0), boxM(1.25, 0.4, 1.25).translate(0, colH - 0.2, 0)].map((g) => g.toNonIndexed()));
  for (let k = 0; k < 6; k++) { const col = new THREE.Mesh(colGeo, white); col.position.set(-PW / 2 + 1 + (k * (PW - 2)) / 5, gFront + pod, front + PD - 0.9); F.add(col); }
  const ent = new THREE.Mesh(boxM(PW + 0.6, 1.4, PD + 0.4), white); ent.position.set(0, gFront + pod + colH + 0.7, front + PD / 2); F.add(ent);
  const ped = new THREE.Mesh(gablePrism(PW + 0.8, 3.4, PD + 0.6), white); ped.position.set(0, gFront + pod + colH + 1.4, front + PD / 2); F.add(ped);
  const relief = new THREE.Mesh(new THREE.CircleGeometry(0.9, 24), std({ color: 0xc9c5ba })); relief.position.set(0, gFront + pod + colH + 2.5, front + PD + 0.31); F.add(relief);
  // 남색 배너 2개 (HANYANG UNIVERSITY HISTORY MUSEUM)
  const banner = canvasTex(64, 320, (g, w, h) => { g.fillStyle = '#1f3566'; g.fillRect(0, 0, w, h); g.save(); g.translate(w / 2, h / 2); g.rotate(Math.PI / 2); g.fillStyle = '#e8ecf5'; g.font = 'bold 15px sans-serif'; g.textAlign = 'center'; g.fillText('HANYANG UNIVERSITY HISTORY MUSEUM', 0, 5); g.restore(); });
  for (const s of [1, -1]) { const bn = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 6), std({ map: banner, side: THREE.DoubleSide })); bn.position.set(s * (PW / 2 + 2.2), gFront + 7.5, front + 0.35); F.add(bn); }
  shadowAll(group);
  return { group, top: EAVE + R, front: [c[0], c[1]] };
}

// ---------- 102 본관 (2009) — 화강석 기단 2층 / 흰 석재 3층 / 파란 유리 최상층 + 시계탑(초록 돔)
async function makeMainHall(b, heightAt, faceTo) {
  const [gLo] = groundRange(b.pts, heightAt);
  const FLOOR = 4.1;
  const { tex, height: H } = await tieredTexture([
    { floors: 2, color: '#c7b9a0', img: 'stoneblock', frame: '#5d5a54', glass: '#35424e', win: { w: 0.48, h: 0.58, y: 0.2, mull: 1, arch: true } },
    { floors: 3, color: '#e4e1d8', img: 'whitestone', frame: '#9aa3a8', glass: '#3e6f8a', win: { w: 0.62, h: 0.46, y: 0.26, mull: 1 } },
    { floors: 1, color: '#2f6e8e', mat: '유리 커튼월', frame: '#9aa3a8', glass: '#2f6e8e' },
  ], { bay: 3.4, floor: FLOOR });
  const group = new THREE.Group(); group.name = '102 본관';
  const top = gLo + H;
  const geo = extrude(b.pts, gLo - 1.5, H + 1.5);
  sideUV(geo, gLo, H);
  const wallMat = std({ map: tex, roughness: 0.7 });
  group.add(new THREE.Mesh(geo, [std({ color: 0x8d8f8c }), wallMat]));

  // 시계탑: 건물 중심에서 광장(faceTo) 쪽 윤곽 위
  const cx = b.pts.reduce((a, p) => a + p[0], 0) / b.pts.length, cz = b.pts.reduce((a, p) => a + p[1], 0) / b.pts.length;
  let dx = faceTo[0] - cx, dz = faceTo[1] - cz; const dl = Math.hypot(dx, dz); dx /= dl; dz /= dl;
  let tHit = 0;
  for (let i = 0; i < b.pts.length; i++) { // 광선-변 교차
    const [ax, az] = b.pts[i], [bx, bz] = b.pts[(i + 1) % b.pts.length];
    const ex = bx - ax, ez = bz - az, den = dx * ez - dz * ex; if (Math.abs(den) < 1e-6) continue;
    const t = ((ax - cx) * ez - (az - cz) * ex) / den, s = ((ax - cx) * dz - (az - cz) * dx) / den;
    if (t > 0 && s >= 0 && s <= 1) tHit = Math.max(tHit, t);
  }
  const tx = cx + dx * (tHit - 2.5), tz = cz + dz * (tHit - 2.5);
  const T = new THREE.Group(); T.position.set(tx, gLo, tz); T.rotation.y = Math.atan2(dx, dz); group.add(T);
  const TW = 8, TH = 33;
  const stone = std({ map: await plainTexture('#c9bca3', 'stoneblock', 2.2), roughness: 0.9 });
  const tower = new THREE.Mesh(boxM(TW, TH, TW), stone); tower.position.y = TH / 2 - 1; T.add(tower);
  const blue = std({ color: 0x2f6e8e, roughness: 0.15, metalness: 0.5 });
  const strip = new THREE.Mesh(boxM(2.4, TH - 12, 0.3), blue); strip.position.set(0, 9 + (TH - 12) / 2, TW / 2 + 0.05); T.add(strip);
  const archDark = std({ color: 0x1e2226, roughness: 0.5 });
  const archG = new THREE.Shape(); archG.moveTo(-2.4, 0); archG.lineTo(-2.4, 4.2); archG.absarc(0, 4.2, 2.4, Math.PI, 0, true); archG.lineTo(2.4, 0);
  const arch = new THREE.Mesh(new THREE.ShapeGeometry(archG), archDark); arch.position.set(0, 0, TW / 2 + 0.06); T.add(arch);
  const clock = canvasTex(256, 256, (g, w) => { g.fillStyle = '#f4f1e8'; g.beginPath(); g.arc(w / 2, w / 2, w / 2 - 6, 0, 7); g.fill(); g.strokeStyle = '#333'; g.lineWidth = 8; g.stroke(); for (let k = 0; k < 12; k++) { const a = (k / 12) * Math.PI * 2; g.fillStyle = '#333'; g.fillRect(w / 2 + Math.sin(a) * 100 - 4, w / 2 - Math.cos(a) * 100 - 10, 8, 20); } g.lineWidth = 10; g.beginPath(); g.moveTo(w / 2, w / 2); g.lineTo(w / 2 + 50, w / 2 - 30); g.moveTo(w / 2, w / 2); g.lineTo(w / 2 - 10, w / 2 - 85); g.stroke(); });
  for (let k = 0; k < 4; k++) { const cl = new THREE.Mesh(new THREE.CircleGeometry(1.6, 32), std({ map: clock })); const a = (k * Math.PI) / 2; cl.position.set(Math.sin(a) * (TW / 2 + 0.07), TH - 4.5, Math.cos(a) * (TW / 2 + 0.07)); cl.rotation.y = a; T.add(cl); }
  // 종루 (네 기둥) + 초록 돔 + 첨탑
  const bel = new THREE.Group(); bel.position.y = TH - 1; T.add(bel);
  for (const [px, pz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) { const p = new THREE.Mesh(boxM(1.2, 4, 1.2), stone); p.position.set(px * 2.6, 2, pz * 2.6); bel.add(p); }
  const cap = new THREE.Mesh(boxM(7, 0.8, 7), stone); cap.position.y = 4.4; bel.add(cap);
  const greenTex = await loadTex('/tex/greenmetal_diff.jpg');
  const patina = std({ map: greenTex, color: 0x7fb59a, roughness: 0.5, metalness: 0.35 });
  const dome = new THREE.Mesh(new THREE.SphereGeometry(3.0, 32, 16, 0, Math.PI * 2, 0, Math.PI / 2), patina); dome.position.y = 4.8; dome.scale.y = 1.25; bel.add(dome);
  const spire = new THREE.Mesh(new THREE.ConeGeometry(0.35, 3.6, 12), patina); spire.position.y = 10.4; bel.add(spire);
  const ball = new THREE.Mesh(new THREE.SphereGeometry(0.3, 12, 8), std({ color: 0xc8b26a, metalness: 0.8, roughness: 0.3 })); ball.position.y = 12.3; bel.add(ball);
  // 번호판 102
  const plate = canvasTex(128, 64, (g, w, h) => { g.fillStyle = '#e9e4d8'; g.fillRect(0, 0, w, h); g.fillStyle = '#1f3566'; g.font = 'bold 44px sans-serif'; g.textAlign = 'center'; g.fillText('102', w / 2, 48); });
  const pl = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 0.8), std({ map: plate })); pl.position.set(0, TH - 8, TW / 2 + 0.08); T.add(pl);
  shadowAll(group);
  return { group, top: gLo + TH + 12 };
}

// ---------- 104 애지문 = 한양대역 2번 출구 — 초록 유리 큐브(사각 격자+대각 철골) + 남색 출구 캐노피 + 돌블록 기둥 + 내려가는 계단
async function makeAejimun(b, heightAt, exitP) {
  const [gLo, gHi] = groundRange(b.pts, heightAt);
  const { c, U, lu, lv } = obb(b.pts);
  const H = 14;
  const g = new THREE.Group(); g.name = '104 애지문';
  const F = frameGroup(c, U, [c[0] + U[1], c[1] - U[0]], gHi - 0.2); g.add(F);
  const glass = new THREE.MeshPhysicalMaterial({ color: 0x4f9a8e, metalness: 0.1, roughness: 0.05, transparent: true, opacity: 0.58, envMapIntensity: 1.5, side: THREE.DoubleSide });
  const inner = new THREE.Mesh(boxM(lu - 0.2, H - 0.2, lv - 0.2), glass); inner.position.y = H / 2; F.add(inner);
  // 격자: 밝은 사각 멀리언(1.6m) + 어두운 대각 철골(3.2m) — 사진(뉴스H)·로드뷰 둘 다 반영
  const lat = canvasTex(512, 512, (gg, w) => {
    gg.clearRect(0, 0, w, w);
    gg.strokeStyle = '#2c4a45'; gg.lineWidth = 9; gg.beginPath(); gg.moveTo(0, 0); gg.lineTo(w, w); gg.moveTo(w, 0); gg.lineTo(0, w); gg.stroke();
    gg.strokeStyle = '#d5e0db'; gg.lineWidth = 14; gg.strokeRect(0, 0, w, w); gg.beginPath(); gg.moveTo(w / 2, 0); gg.lineTo(w / 2, w); gg.moveTo(0, w / 2); gg.lineTo(w, w / 2); gg.stroke();
  });
  lat.wrapS = lat.wrapT = THREE.RepeatWrapping;
  const latMat = std({ map: lat, alphaTest: 0.4, side: THREE.DoubleSide, metalness: 0.5, roughness: 0.4 });
  const cell = 3.2;
  const face = (w, h, pos, rotY, rotX = 0) => {
    const pg = new THREE.PlaneGeometry(w, h); const uv = pg.attributes.uv;
    for (let k = 0; k < uv.count; k++) uv.setXY(k, (uv.getX(k) * w) / cell, (uv.getY(k) * h) / cell);
    const m = new THREE.Mesh(pg, latMat); m.position.copy(pos); m.rotation.set(rotX, rotY, 0); F.add(m);
  };
  face(lu, H, new THREE.Vector3(0, H / 2, lv / 2), 0); face(lu, H, new THREE.Vector3(0, H / 2, -lv / 2), Math.PI);
  face(lv, H, new THREE.Vector3(lu / 2, H / 2, 0), Math.PI / 2); face(lv, H, new THREE.Vector3(-lu / 2, H / 2, 0), -Math.PI / 2);
  face(lu, lv, new THREE.Vector3(0, H, 0), 0, -Math.PI / 2);
  const frameMat = std({ color: 0xc9d4cf, metalness: 0.5, roughness: 0.4 });
  // 꼭대기 낮은 유리 피라미드 지붕
  const pyr = new THREE.Mesh(new THREE.ConeGeometry(1, 2.6, 4, 1), glass); pyr.rotation.y = Math.PI / 4; pyr.scale.set(lu / Math.SQRT2, 1, lv / Math.SQRT2); pyr.position.y = H + 1.3; F.add(pyr);
  const pyrL = new THREE.Mesh(new THREE.ConeGeometry(1, 2.6, 4, 1), std({ color: 0xc9d4cf, wireframe: true })); pyrL.rotation.y = Math.PI / 4; pyrL.scale.copy(pyr.scale); pyrL.position.copy(pyr.position); F.add(pyrL);
  for (const [x, z] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) { const p = new THREE.Mesh(boxM(0.4, H, 0.4), frameMat); p.position.set((x * lu) / 2, H / 2, (z * lv) / 2); F.add(p); }
  const graniteMat = std({ map: await plainTexture('#d3cec4', 'granite', 1.5) });
  const plinth = new THREE.Mesh(boxM(lu + 0.6, (gHi - gLo) + 0.8, lv + 0.6), graniteMat); plinth.position.y = -((gHi - gLo) + 0.8) / 2 + 0.1; F.add(plinth);

  // ---- 출구 캐노피: 큐브 면 중 출구 좌표 쪽
  const V = [-U[1], U[0]];
  const faces = [[U, lu / 2, V, lv / 2], [[-U[0], -U[1]], lu / 2, V, lv / 2], [V, lv / 2, U, lu / 2], [[-V[0], -V[1]], lv / 2, U, lu / 2]];
  const ex = exitP || [c[0] + V[0] * 20, c[1] + V[1] * 20];
  // 출구 캐노피는 광장(동쪽, 사자상 쪽)을 정면으로 보는 면 — 사진(한대신문): 큐브 앞에 캐노피가 붙은 한 덩어리
  // 광장(동쪽)에서 보면 큐브의 오른쪽 면 = 북쪽 면에 붙음 (2026-11 사용자 확인)
  const [n, half, t, along] = [...faces].sort((A, B) => A[0][1] - B[0][1])[0];
  const sAl = 0;
  const ox = c[0] + n[0] * half + t[0] * sAl, oz = c[1] + n[1] * half + t[1] * sAl;
  const E = new THREE.Group(); E.position.set(ox, heightAt(ox + n[0] * 4, oz + n[1] * 4) - 0.05, oz); E.rotation.y = Math.atan2(n[0], n[1]); g.add(E);
  const CW = 9.2, CD = 7.2, CY = 4.4;
  const navy = std({ color: 0x1f2b5a, roughness: 0.5 });
  const banner = canvasTex(1536, 200, (gg, w, h) => {
    const gr = gg.createLinearGradient(0, 0, w, 0); gr.addColorStop(0, '#1d2856'); gr.addColorStop(1, '#2a3a78'); gg.fillStyle = gr; gg.fillRect(0, 0, w, h);
    gg.fillStyle = '#f2c230'; gg.font = 'bold 120px sans-serif'; gg.fillText('2', 60, 150); gg.font = 'bold 34px sans-serif'; gg.fillText('EXIT', 140, 150); gg.fillText('출구', 140, 100);
    gg.strokeStyle = 'rgba(255,255,255,.35)'; gg.lineWidth = 3; gg.beginPath(); gg.moveTo(250, 30); gg.lineTo(250, 170); gg.stroke();
    gg.fillStyle = '#ffffff'; gg.beginPath(); gg.arc(370, 100, 62, 0, 7); gg.fill(); gg.fillStyle = '#1d2856'; gg.font = 'bold 34px serif'; gg.textAlign = 'center'; gg.fillText('HYU', 370, 112); gg.textAlign = 'left';
    gg.fillStyle = '#ffffff'; gg.font = 'bold 70px sans-serif'; gg.fillText('BEYOND', 480, 92); gg.font = '48px sans-serif'; gg.fillText('THE ENGINE OF KOREA', 560, 156);
    gg.strokeStyle = 'rgba(120,170,255,.6)'; gg.lineWidth = 10; gg.beginPath(); gg.moveTo(1080, 200); gg.lineTo(1260, 0); gg.stroke();
    gg.fillStyle = '#dfe6ff'; gg.font = 'bold 30px sans-serif'; gg.fillText('HANYANG UNIVERSITY', 1290, 112);
  });
  const fas = new THREE.Mesh(new THREE.BoxGeometry(CW, 1.25, CD), [navy, navy, std({ color: 0x2a3566 }), std({ color: 0xf1f1ee }), std({ map: banner, roughness: 0.5 }), navy]);
  fas.position.set(0, CY + 0.62, CD / 2); E.add(fas);
  // 돌블록 기둥 (돌 9단)
  const blocks = canvasTex(128, 512, (gg, w, h) => { gg.fillStyle = '#d6cdbd'; gg.fillRect(0, 0, w, h); for (let k = 0; k < 9; k++) { const y = (k * h) / 9; gg.fillStyle = k % 2 ? '#cbc1ae' : '#ddd4c4'; gg.fillRect(2, y + 3, w - 4, h / 9 - 6); } });
  const col = new THREE.Mesh(boxM(1.15, CY, 1.15), std({ map: blocks })); col.position.set(1.0, CY / 2, CD * 0.6); E.add(col);
  for (const m of [col]) { const uv = m.geometry.attributes.uv; for (let k = 0; k < uv.count; k++) uv.setXY(k, uv.getX(k) / 1.15, uv.getY(k) / CY); }
  // 내려가는 계단: 화강석 난간벽 + 어두운 입구 + 위 3단 + 적갈색 손잡이
  const pitX0 = -3.9, pitX1 = -0.8, pitZ0 = 0.6, pitZ1 = 6.6;
  const wall = (w, h, d, x, y, z) => { const m = new THREE.Mesh(boxM(w, h, d), graniteMat); m.position.set(x, y, z); E.add(m); };
  wall(0.3, 1.05, pitZ1 - pitZ0, pitX0 - 0.15, 0.52, (pitZ0 + pitZ1) / 2); wall(0.3, 1.05, pitZ1 - pitZ0, pitX1 + 0.15, 0.52, (pitZ0 + pitZ1) / 2);
  const pitTex = canvasTex(64, 256, (gg, w, h) => { const gr = gg.createLinearGradient(0, h, 0, 0); gr.addColorStop(0, '#6d6a64'); gr.addColorStop(0.35, '#2a2a2a'); gr.addColorStop(1, '#0c0c0e'); gg.fillStyle = gr; gg.fillRect(0, 0, w, h); for (let k = 0; k < 14; k++) { gg.fillStyle = 'rgba(255,255,255,.07)'; gg.fillRect(0, h - (k + 1) * (h / 14), w, 3); } });
  const pit = new THREE.Mesh(new THREE.PlaneGeometry(pitX1 - pitX0, pitZ1 - pitZ0), std({ map: pitTex, roughness: 0.9 })); pit.rotation.x = -Math.PI / 2; pit.position.set((pitX0 + pitX1) / 2, 0.06, (pitZ0 + pitZ1) / 2); E.add(pit);
  const rail = std({ color: 0x8a3b2a, metalness: 0.4, roughness: 0.5 });
  for (const x of [pitX0 + 0.1, pitX1 - 0.1]) { const r = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, pitZ1 - pitZ0, 8), rail); r.rotation.x = Math.PI / 2; r.rotation.z = 0; r.position.set(x, 0.95, (pitZ0 + pitZ1) / 2); r.rotation.set(Math.PI / 2 - 0.18, 0, 0); E.add(r); }
  // 오른쪽 화강석 화단 + 붉은 벽돌 낮은 담, 왼쪽 앞 '2 한양대' 안내 기둥 + 회양목 화단
  wall(2.6, 0.9, 1.2, 3.6, 0.45, CD - 0.4);
  const brick = std({ map: await plainTexture('#9c4a35', 'brickwall', 1.2) });
  const bw = new THREE.Mesh(boxM(6, 0.75, 0.35), brick); bw.position.set(7.2, 0.37, CD + 1.2); E.add(bw);
  const sign = canvasTex(128, 512, (gg, w, h) => { gg.fillStyle = '#1e2a55'; gg.fillRect(0, 0, w, h); gg.fillStyle = '#f2c230'; gg.font = 'bold 80px sans-serif'; gg.textAlign = 'center'; gg.fillText('2', 64, 90); gg.fillStyle = '#fff'; gg.font = 'bold 40px sans-serif'; for (const [i, ch] of [...'한양대'].entries()) gg.fillText(ch, 64, 160 + i * 48); gg.fillStyle = '#3fae49'; gg.fillRect(34, 330, 60, 12); });
  const sp = new THREE.Mesh(new THREE.BoxGeometry(0.8, 3.3, 0.35), [navy, navy, navy, navy, std({ map: sign }), std({ map: sign })]); sp.position.set(-6.2, 1.65, CD + 0.6); E.add(sp);
  wall(3.2, 0.7, 1.4, -6.0, 0.35, CD - 1.4);
  const box = new THREE.Mesh(new THREE.SphereGeometry(1, 12, 8), std({ color: 0x3f6a32, roughness: 0.9 })); box.scale.set(1.5, 0.45, 0.6); box.position.set(-6.0, 0.85, CD - 1.4); E.add(box);
  // 남쪽 흰 파고라 + 반원 계단 (로드뷰 104-1)
  const south = [...faces].sort((A, B) => B[0][1] - A[0][1])[0]; // 파고라·반원 계단은 남쪽 (로드뷰 104-2)
  const P = new THREE.Group(); const px = c[0] + south[0][0] * (south[1] + 3.5), pz = c[1] + south[0][1] * (south[1] + 3.5);
  P.position.set(px, heightAt(px, pz) - 0.05, pz); P.rotation.y = Math.atan2(south[0][0], south[0][1]); g.add(P);
  const whiteM = std({ color: 0xf0efea });
  for (let i = 0; i < 4; i++) for (const z of [-1.6, 1.6]) { const pc = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.19, 3.1, 12), whiteM); pc.position.set(-3.6 + i * 2.4, 1.55, z); P.add(pc); }
  for (const z of [-1.6, 1.6]) { const bm = new THREE.Mesh(boxM(8.4, 0.3, 0.3), whiteM); bm.position.set(0, 3.2, z); P.add(bm); }
  for (let i = 0; i < 9; i++) { const sl = new THREE.Mesh(boxM(0.14, 0.2, 4.0), whiteM); sl.position.set(-4 + i, 3.42, 0); P.add(sl); }
  for (let k = 0; k < 4; k++) { const st = new THREE.Mesh(new THREE.CylinderGeometry(4.4 - k * 0.45, 4.4 - k * 0.45, 0.16, 32, 1, false, -Math.PI / 2, Math.PI), graniteMat); st.position.set(0, 0.08 + k * 0.16, 2.2); P.add(st); }
  // 남서쪽 작은 유리 파빌리온 (초록 유리 모임지붕)
  {
    const qx = c[0] - 10, qz = c[1] + 13, y = heightAt(qx, qz);
    const pv = new THREE.Group(); pv.position.set(qx, y, qz); pv.rotation.y = Math.atan2(U[0], U[1]); g.add(pv);
    const gl = new THREE.MeshPhysicalMaterial({ color: 0x5aa596, roughness: 0.06, metalness: 0.1, transparent: true, opacity: 0.6 });
    pv.add(at(new THREE.Mesh(boxM(6, 3.6, 6), gl), 0, 1.8, 0));
    const roofP = new THREE.Mesh(new THREE.ConeGeometry(4.6, 2.2, 4, 1), gl); roofP.rotation.y = Math.PI / 4; roofP.position.y = 4.7; pv.add(roofP);
    for (const [x, z] of [[-3, -3], [3, -3], [3, 3], [-3, 3]]) pv.add(at(new THREE.Mesh(boxM(0.15, 3.6, 0.15), frameMat), x, 1.8, z));
    pv.add(at(new THREE.Mesh(boxM(6.6, 0.9, 6.6), graniteMat), 0, 0.15, 0));
  }
  shadowAll(g); inner.castShadow = false;
  // 출구 주변 나무 금지 구역 (캐노피·계단·안내 기둥 + 여유 2m)
  const clear = [[-10, -0.5], [13, -0.5], [13, CD + 4], [-10, CD + 4]].map(([x, z]) => [ox + Math.cos(E.rotation.y) * x + Math.sin(E.rotation.y) * z, oz - Math.sin(E.rotation.y) * x + Math.cos(E.rotation.y) * z]);
  return { group: g, top: gHi + H, clear };
}

// ---------- 105 학생복지관(한양플라자) — 은색 세로 루버 상자 + 대형 현수막 + 1층 흰 캐노피
async function makePlaza105(b, heightAt, faceTo) {
  const [gLo] = groundRange(b.pts, heightAt);
  const FLOOR = 4.0, H = 5 * FLOOR + 1.5;
  const g = new THREE.Group(); g.name = '105 학생복지관';
  const louver = canvasTex(256, 256, (gg, w, h) => {
    gg.fillStyle = '#5d666d'; gg.fillRect(0, 0, w, h);
    gg.fillStyle = '#c4c9cc'; for (let k = 0; k < 8; k++) gg.fillRect(k * (w / 8), 0, w / 8 * 0.55, h);
    gg.fillStyle = '#d9dcde'; gg.fillRect(0, h - 14, w, 14);
  });
  louver.wrapS = louver.wrapT = THREE.RepeatWrapping; louver.repeat.set(1 / 3.2, 1 / FLOOR);
  const geo = extrude(b.pts, gLo - 1.5, H + 1.5); sideUV(geo, gLo);
  g.add(new THREE.Mesh(geo, [std({ color: 0x9a9d9e }), std({ map: louver, metalness: 0.5, roughness: 0.45 })]));
  // 광장 쪽 가장 긴 변
  const cx = b.pts.reduce((a, p) => a + p[0], 0) / b.pts.length, cz = b.pts.reduce((a, p) => a + p[1], 0) / b.pts.length;
  let best = null;
  for (let i = 0; i < b.pts.length; i++) {
    const a = b.pts[i], q = b.pts[(i + 1) % b.pts.length]; const L = Math.hypot(q[0] - a[0], q[1] - a[1]); if (L < 8) continue;
    let nx = (q[1] - a[1]) / L, nz = -(q[0] - a[0]) / L; const mx = (a[0] + q[0]) / 2, mz = (a[1] + q[1]) / 2;
    if ((mx - cx) * nx + (mz - cz) * nz < 0) { nx = -nx; nz = -nz; }
    const score = ((faceTo[0] - mx) * nx + (faceTo[1] - mz) * nz) / Math.hypot(faceTo[0] - mx, faceTo[1] - mz) * Math.sqrt(L);
    if (!best || score > best.score) best = { score, a, q, L, nx, nz, mx, mz };
  }
  if (best) {
    const F = new THREE.Group(); F.position.set(best.mx + best.nx * 0.45, gLo, best.mz + best.nz * 0.45); F.rotation.y = Math.atan2(best.nx, best.nz); g.add(F);
    const bw = best.L * 0.86, bh = 10.5;
    const ban = canvasTex(1024, Math.round((1024 * bh) / bw), (gg, w, h) => {
      const gr = gg.createLinearGradient(0, 0, w, h); gr.addColorStop(0, '#1d2f7a'); gr.addColorStop(1, '#2b56b8'); gg.fillStyle = gr; gg.fillRect(0, 0, w, h);
      gg.fillStyle = '#ffffff'; gg.font = `bold ${h * 0.09}px sans-serif`; gg.fillText('HANYANG UNIVERSITY', w * 0.06, h * 0.2);
      gg.fillStyle = '#f2a33a'; gg.font = `bold ${h * 0.34}px sans-serif`; gg.fillText('LIONS', w * 0.06, h * 0.66);
      gg.fillStyle = '#e6ecff'; gg.font = `${h * 0.075}px sans-serif`; gg.fillText('사랑의 실천 · 서울캠퍼스', w * 0.06, h * 0.86);
      gg.strokeStyle = 'rgba(255,255,255,.5)'; gg.lineWidth = 4; gg.beginPath(); gg.moveTo(w * 0.57, h * 0.12); gg.lineTo(w * 0.57, h * 0.88); gg.stroke();
      gg.fillStyle = '#ffffff'; gg.font = `bold ${h * 0.15}px sans-serif`; gg.fillText('SINCE 1939', w * 0.6, h * 0.6);
    });
    const banner = new THREE.Mesh(new THREE.PlaneGeometry(bw, bh), std({ map: ban, roughness: 0.6 })); banner.position.y = 8 + bh / 2; F.add(banner);
    const script = canvasTex(1024, 128, (gg, w, h) => { gg.clearRect(0, 0, w, h); gg.fillStyle = '#2a5bd0'; gg.font = 'italic bold 92px Georgia, serif'; gg.textAlign = 'center'; gg.fillText('Hanyang Plaza', w / 2, 96); });
    const sc = new THREE.Mesh(new THREE.PlaneGeometry(bw * 0.55, bw * 0.55 / 8), std({ map: script, transparent: true })); sc.position.set(0, 6.6, 0.05); F.add(sc);
    const canopy = new THREE.Mesh(boxM(best.L * 0.95, 0.45, 3.2), std({ color: 0xf2f2ee })); canopy.position.set(0, 4.3, 1.6); F.add(canopy);
    const glass = new THREE.Mesh(new THREE.PlaneGeometry(best.L * 0.93, 4.0), std({ color: 0x3a4650, roughness: 0.2, metalness: 0.4 })); glass.position.set(0, 2, 0.02); F.add(glass);
    for (let k = 0; k <= 6; k++) { const p = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 4.3, 10), std({ color: 0xf2f2ee })); p.position.set(-best.L * 0.45 + (k * best.L * 0.9) / 6, 2.15, 3.0); F.add(p); }
    const no = canvasTex(128, 64, (gg, w) => { gg.fillStyle = '#e9e9e4'; gg.fillRect(0, 0, w, 64); gg.fillStyle = '#333'; gg.font = 'bold 40px sans-serif'; gg.fillText('105', 22, 46); });
    const nm = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 0.7), std({ map: no })); nm.position.set(-best.L * 0.45, H - 1.2, 0.06); F.add(nm);
  }
  shadowAll(g);
  return { group: g, top: gLo + H };
}

// 애지문 위치 보정 (m, [동쪽+, 남쪽+]) — OSM·카카오·수치지도는 원래 자리지만 사용자 확인으로 남쪽으로 옮김. 필요하면 이 값만 조정
export const AEJI_SHIFT = [0, 10];

export async function makeHero(world, heightAt, lionP) {
  const by = (name) => world.buildings.find((b) => b.name === name);
  const out = { group: new THREE.Group(), ids: new Set(), info: new Map(), clear: [] };
  out.group.name = 'hero';
  const tasks = [
    ['역사관', (b) => makeHistoryHall(b, heightAt, lionP)],
    ['본관', (b) => makeMainHall(b, heightAt, lionP)],
    ['애지문', (b0) => { const b = { ...b0, pts: b0.pts.map(([x, z]) => [x + AEJI_SHIFT[0], z + AEJI_SHIFT[1]]) }; const c = b.pts.reduce((a, p) => [a[0] + p[0] / b.pts.length, a[1] + p[1] / b.pts.length], [0, 0]); const ex = world.exits.filter((e) => e.ref === '2').sort((a, q) => Math.hypot(a.p[0] - c[0], a.p[1] - c[1]) - Math.hypot(q.p[0] - c[0], q.p[1] - c[1]))[0]; return makeAejimun(b, heightAt, ex ? ex.p : [c[0] + 10, c[1]]); }],
    ['학생복지관', (b) => makePlaza105(b, heightAt, [lionP[0] - 15, lionP[1] + 10])],
  ];
  for (const [name, fn] of tasks) {
    const b = by(name); if (!b) continue;
    const r = await fn(b);
    out.group.add(r.group);
    out.ids.add(b.id);
    const pts = name === '애지문' ? b.pts.map(([x, z]) => [x + AEJI_SHIFT[0], z + AEJI_SHIFT[1]]) : b.pts;
    out.info.set(b.id, { top: r.top, pts, center: [pts.reduce((a, p) => a + p[0], 0) / pts.length, pts.reduce((a, p) => a + p[1], 0) / pts.length] });
    if (r.clear) out.clear.push(r.clear);
  }
  return out;
}

// ---------- 대표 장면 소품: 사자상 화단 회양목·바위, 검은 장식 가로등, 역사관–본관 유리 구름다리
export function makeHeroProps(world, heightAt, lionP) {
  const g = new THREE.Group(); g.name = 'hero-props';
  // 회양목 (둥글게 다듬은 관목) — 화단 동쪽(역사관 쪽) 반원 + 몇 덩이
  const boxMat = std({ color: 0x3d6b30, roughness: 0.95, flatShading: true });
  const shrub = new THREE.IcosahedronGeometry(1, 2);
  let seed = 7; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let a = -75; a <= 75; a += 13) {
    const r = 7.2 + rnd() * 0.8, t = (a * Math.PI) / 180;
    const x = lionP[0] + Math.cos(t) * r, z = lionP[1] + Math.sin(t) * r, s = 0.75 + rnd() * 0.45;
    const m = new THREE.Mesh(shrub, boxMat); m.scale.set(s * 1.2, s * 0.75, s); m.position.set(x, heightAt(x, z) + s * 0.45, z); g.add(m);
  }
  const rock = std({ color: 0x9a968c, roughness: 0.95, flatShading: true });
  for (const [dx, dz, s] of [[4.5, 4.2, 0.6], [5.5, -3.5, 0.5], [-3.8, 5.6, 0.45]]) { const m = new THREE.Mesh(new THREE.DodecahedronGeometry(1, 0), rock); m.scale.set(s * 1.4, s * 0.7, s); const x = lionP[0] + dx, z = lionP[1] + dz; m.position.set(x, heightAt(x, z) + s * 0.25, z); m.rotation.y = dx; g.add(m); }
  // 검은 주철 가로등 (기둥 + 3구 등)
  const iron = std({ color: 0x1b1d1f, metalness: 0.6, roughness: 0.45 });
  const globe = new THREE.MeshStandardMaterial({ color: 0xfff6e0, emissive: 0xfff0c8, emissiveIntensity: 0.6, roughness: 0.3 });
  const lamp = () => {
    const l = new THREE.Group();
    l.add(at(new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.36, 0.7, 12), iron), 0, 0.35, 0));
    l.add(at(new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.12, 4.2, 10), iron), 0, 2.6, 0));
    for (let k = 0; k < 3; k++) {
      const a = (k / 3) * Math.PI * 2;
      const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.75, 6), iron); arm.rotation.z = Math.PI / 2; arm.rotation.y = a; arm.position.set(Math.cos(a) * 0.35, 4.55, -Math.sin(a) * 0.35); l.add(arm);
      const gl = new THREE.Mesh(new THREE.SphereGeometry(0.2, 14, 10), globe); gl.position.set(Math.cos(a) * 0.72, 4.85, -Math.sin(a) * 0.72); l.add(gl);
      const cap = new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.18, 10), iron); cap.position.set(Math.cos(a) * 0.72, 5.1, -Math.sin(a) * 0.72); l.add(cap);
    }
    const top = new THREE.Mesh(new THREE.SphereGeometry(0.22, 12, 8), globe); top.position.y = 5.05; l.add(top);
    const fin = new THREE.Mesh(new THREE.ConeGeometry(0.12, 0.35, 8), iron); fin.position.y = 5.4; l.add(fin);
    return l;
  };
  for (const [dx, dz] of [[-6, 8.5], [-5.5, -9.5], [4, -16], [-21, -9], [-24, 15]]) { const l = lamp(); const x = lionP[0] + dx, z = lionP[1] + dz; l.position.set(x, heightAt(x, z), z); g.add(l); }
  // 역사관–본관 유리 구름다리 (로드뷰 102-1)
  const A = world.buildings.find((b) => b.name === '역사관'), B = world.buildings.find((b) => b.name === '본관');
  if (A && B) {
    let best = null;
    for (const p of A.pts) for (const q of B.pts) { const d = Math.hypot(p[0] - q[0], p[1] - q[1]); if (!best || d < best.d) best = { p, q, d }; }
    if (best && best.d < 25) {
      const mx = (best.p[0] + best.q[0]) / 2, mz = (best.p[1] + best.q[1]) / 2;
      const y = Math.max(heightAt(...best.p), heightAt(...best.q)) + 6.5;
      const br = new THREE.Group(); br.position.set(mx, y, mz); br.rotation.y = Math.atan2(best.q[0] - best.p[0], best.q[1] - best.p[1]);
      const len = best.d + 3;
      const dark = new THREE.MeshPhysicalMaterial({ color: 0x1f2a30, roughness: 0.08, metalness: 0.4, transparent: true, opacity: 0.85 });
      br.add(at(new THREE.Mesh(new THREE.BoxGeometry(3.2, 2.6, len), dark), 0, 1.9, 0));
      br.add(at(new THREE.Mesh(new THREE.BoxGeometry(3.4, 0.7, len), std({ color: 0xa9adae, metalness: 0.4, roughness: 0.4 })), 0, 0.3, 0));
      g.add(br);
    }
  }
  shadowAll(g);
  return g;
}
