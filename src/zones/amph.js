// 구역 1 — 노천극장 일대 (209)
//  말굽형 계단식 객석(화강석 단 + 단 사이 잔디) · 방사형 통로 계단과 흰 난간 · 원형 아레나 바닥 · 꼭대기 부채꼴 포장 산책로
//  무대동(베이지 화강석 패널 #D8CFC2) · 무대 위 흰 곡선 셸 지붕(#F1F0EC, 철골 리브·조명) · 남쪽 도로면 흰 곡선 처마·유리문·'209'
//  사진: campus-data/campus/209-노천극장/photos (로드뷰 2장 + 위키미디어 겨울 사진)
//  지형: 국토지리정보원 등고선이 이미 사발 모양(아레나 20.8m → 꼭대기 30.5m) → 객석 단은 heightAt 을 따라 얹는다.
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { loadTex, mergeStatic } from '../util.js';

const D2R = Math.PI / 180;

export default async function (ctx) {
  const { THREE, world, heightAt, scene } = ctx;
  const b = world.buildings.find((x) => x.no === '209');
  if (!b) return {};

  // ---------- 공통 도구
  // 사각형 면을 모아 BufferGeometry 로 (원하는 법선 방향 hint 로 감김 순서 자동 보정)
  class Mesher {
    constructor() { this.P = []; this.U = []; this.I = []; }
    quad(a, bb, c, d, ua, ub, uc, ud, hint) {
      if (hint) {
        const e1 = [bb[0] - a[0], bb[1] - a[1], bb[2] - a[2]], e2 = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
        const n = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]];
        if (n[0] * hint[0] + n[1] * hint[1] + n[2] * hint[2] < 0) { [a, bb, c, d] = [d, c, bb, a]; [ua, ub, uc, ud] = [ud, uc, ub, ua]; }
      }
      const k = this.P.length / 3;
      this.P.push(...a, ...bb, ...c, ...d); this.U.push(...ua, ...ub, ...uc, ...ud);
      this.I.push(k, k + 1, k + 2, k, k + 2, k + 3);
    }
    geo() {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(this.P, 3));
      g.setAttribute('uv', new THREE.Float32BufferAttribute(this.U, 2));
      g.setIndex(this.I);
      g.computeVertexNormals();
      return g;
    }
  }
  async function pbr(name, sizeM, extra = {}) {
    const [map, normalMap] = await Promise.all([loadTex(`/tex/${name}_diff.jpg`), loadTex(`/tex/${name}_nor.jpg`, { srgb: false })]);
    for (const t of [map, normalMap]) t.repeat.set(1 / sizeM, 1 / sizeM);
    return new THREE.MeshStandardMaterial({ map, normalMap, roughness: 0.9, ...extra });
  }
  function canvasTex(w, h, draw, sizeM) {
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    draw(c.getContext('2d'), w, h);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    if (sizeM) t.repeat.set(1 / sizeM, 1 / sizeM);
    return t;
  }
  // 상자 uv 를 미터 단위로
  function boxM(w, h, d) {
    const g = new THREE.BoxGeometry(w, h, d), uv = g.attributes.uv;
    const dims = [[d, h], [d, h], [w, d], [w, d], [w, h], [w, h]];
    for (let f = 0; f < 6; f++) for (let k = 0; k < 4; k++) { const i = f * 4 + k; uv.setXY(i, uv.getX(i) * dims[f][0], uv.getY(i) * dims[f][1]); }
    return g;
  }
  // 두 점 사이 원통 (철골·난간)
  const _up = new THREE.Vector3(0, 1, 0);
  function tube(p, q, r, seg = 6) {
    const a = new THREE.Vector3(...p), c = new THREE.Vector3(...q), d = c.clone().sub(a), L = d.length();
    const g = new THREE.CylinderGeometry(r, r, L, seg, 1, true);
    g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(_up, d.normalize()));
    g.translate((a.x + c.x) / 2, (a.y + c.y) / 2, (a.z + c.z) / 2);
    return g;
  }
  function extrude(pts, y0, h) {
    const shape = new THREE.Shape(pts.map(([x, z]) => new THREE.Vector2(x, -z)));
    const geo = new THREE.ExtrudeGeometry(shape, { depth: h, bevelEnabled: false });
    geo.rotateX(-Math.PI / 2);
    geo.translate(0, y0, 0);
    const uv = geo.attributes.uv, pos = geo.attributes.position, side = geo.groups[1];
    for (let k = side.start; k < side.start + side.count; k++) uv.setY(k, pos.getY(k) - y0);
    return geo;
  }
  // 반평면 자르기 (Sutherland–Hodgman): (p-o)·n >= 0 쪽만 남김
  function clipHalf(poly, o, n) {
    const out = [], s = (p) => (p[0] - o[0]) * n[0] + (p[1] - o[1]) * n[1];
    for (let i = 0; i < poly.length; i++) {
      const A = poly[i], B = poly[(i + 1) % poly.length], sa = s(A), sb = s(B);
      if (sa >= 0) out.push(A);
      if ((sa >= 0) !== (sb >= 0)) { const t = sa / (sa - sb); out.push([A[0] + (B[0] - A[0]) * t, A[1] + (B[1] - A[1]) * t]); }
    }
    return out;
  }
  const clipDisc = (poly, o, R, n = 48) => {
    let p = poly;
    for (let i = 0; i < n && p.length; i++) { const a = (i / n) * Math.PI * 2, c = Math.cos(a), s = Math.sin(a); p = clipHalf(p, [o[0] + c * R, o[1] + s * R], [-c, -s]); }
    return p;
  };
  const shadow = (m, cast = true) => { m.castShadow = cast; m.receiveShadow = true; return m; };

  // ---------- 재질 (공유)
  const [seatStone, grass, concrete, arenaMat] = await Promise.all([
    pbr('granite', 1.4, { color: 0xd6d1c6 }),
    pbr('grass', 2.5, { color: 0xa8b48a }),
    pbr('concwall', 3, { color: 0xbdb8ae }),
    pbr('concpave', 3, { color: 0xd8c6a6 }),
  ]);
  // 꼭대기 산책로: 부채꼴(비늘) 무늬 화강석
  const fanTex = canvasTex(512, 512, (g, w, h) => {
    g.fillStyle = '#a8a196'; g.fillRect(0, 0, w, h);
    const R = 64, rows = h / (R / 2);
    for (let j = -1; j <= rows + 1; j++) for (let i = -1; i <= w / (R * 2) + 1; i++) {
      const cx = i * R * 2 + (j % 2 ? R : 0), cy = j * (R / 2);
      for (let k = 6; k >= 1; k--) {
        g.beginPath(); g.arc(cx, cy, (R * k) / 6, 0, Math.PI); g.closePath();
        g.fillStyle = k === 6 ? (((i + j) % 3) ? '#b2aba0' : '#9d968b') : 'rgba(0,0,0,0)';
        if (k === 6) g.fill();
        g.strokeStyle = 'rgba(90,84,76,.35)'; g.lineWidth = 2; g.stroke();
      }
    }
  }, 4.8);
  const promMat = new THREE.MeshStandardMaterial({ map: fanTex, roughness: 0.85, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
  arenaMat.polygonOffset = true; arenaMat.polygonOffsetFactor = -2; arenaMat.polygonOffsetUnits = -2;
  const white = new THREE.MeshStandardMaterial({ color: 0xf1f0ec, roughness: 0.45, metalness: 0.15 });
  const whiteShell = new THREE.MeshStandardMaterial({ color: 0xf1f0ec, roughness: 0.5, metalness: 0.1, side: THREE.DoubleSide });
  const dark = new THREE.MeshStandardMaterial({ color: 0x2a2f35, roughness: 0.25, metalness: 0.4 });
  // 무대동 외벽: 베이지 화강석 사각 패널 + 두 줄 띠 (3.6m 반복)
  const panelTex = canvasTex(512, 512, (g, w, h) => {
    const px = w / 4, py = h / 6;
    let s = 7;
    const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
    for (let j = 0; j < 6; j++) for (let i = 0; i < 4; i++) {
      const v = Math.round((rnd() - 0.5) * 14);
      g.fillStyle = `rgb(${216 + v},${207 + v},${194 + v})`; g.fillRect(i * px, j * py, px, py);
      for (let k = 0; k < 140; k++) { const t = rnd(); g.fillStyle = t < 0.5 ? 'rgba(120,110,100,.18)' : 'rgba(255,255,255,.25)'; g.fillRect(i * px + rnd() * px, j * py + rnd() * py, 2, 2); }
    }
    g.strokeStyle = '#a99f92'; g.lineWidth = 3;
    for (let i = 0; i <= 4; i++) { g.beginPath(); g.moveTo(i * px, 0); g.lineTo(i * px, h); g.stroke(); }
    for (let j = 0; j <= 6; j++) { g.beginPath(); g.moveTo(0, j * py); g.lineTo(w, j * py); g.stroke(); }
    // 장식 띠 (아래에서 1.8m 근처 — 캔버스는 위가 v=1)
    const band = h - (1.95 / 3.6) * h;
    g.fillStyle = '#b9ae9e'; g.fillRect(0, band, w, 10);
    g.fillStyle = '#efe8dc'; g.fillRect(0, band + 10, w, 4);
  }, 3.6);
  const panel = new THREE.MeshStandardMaterial({ map: panelTex, color: 0xd2c6b4, roughness: 0.8 });
  const signTex = canvasTex(256, 128, (g, w, h) => {
    g.fillStyle = '#3a3d40'; g.fillRect(0, 0, w, h);
    g.strokeStyle = '#8c8f92'; g.lineWidth = 6; g.strokeRect(3, 3, w - 6, h - 6);
    g.fillStyle = '#f4f4f0'; g.font = 'bold 92px Pretendard, Arial, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText('209', w / 2, h / 2 + 4);
  });
  const signMat = new THREE.MeshStandardMaterial({ map: signTex, roughness: 0.5 });

  // =====================================================================
  // 1) 객석 사발 — 중심 C, 아레나 끝 R0 ~ 꼭대기 R1, 말굽형(약 200°)
  // =====================================================================
  const C = [84.2, 61.6];
  const R0 = 24.9, R1 = 45.2, N = 23, T = (R1 - R0) / N; // 23단, 단 깊이 ~0.88m
  const PHI0 = -186 * D2R, PHI1 = 14 * D2R; // 서남서 → 북 → 동
  const AISLES = [-151, -116, -81, -46, -11].map((d) => d * D2R);
  const AW = 1.5; // 통로 폭(m)
  const rk = (k) => R0 + k * T;
  const P2 = (r, a) => [C[0] + Math.cos(a) * r, C[1] + Math.sin(a) * r];
  // 각도 a 에서 단 높이들 (단 바깥쪽 지면 + 여유, 최소 단높이 보장)
  const tierCache = new Map();
  const tiers = (a) => {
    const key = Math.round(a * 1e4);
    if (tierCache.has(key)) return tierCache.get(key);
    const ys = [];
    let prev = heightAt(...P2(R0, a));
    for (let k = 0; k < N; k++) { const y = Math.max(heightAt(...P2(rk(k + 1), a)) + 0.14, prev + 0.24); ys.push(y); prev = y; }
    ys.base = heightAt(...P2(R0, a)) - 0.4;
    tierCache.set(key, ys);
    return ys;
  };
  const stoneM = new Mesher(), grassM = new Mesher();
  const v3 = (r, a, y) => { const p = P2(r, a); return [p[0], y, p[1]]; };
  const STEP = 1.6 * D2R;
  const sections = [];
  {
    const cuts = [PHI0, ...AISLES, PHI1];
    for (let i = 0; i < cuts.length - 1; i++) sections.push([cuts[i], cuts[i + 1], i > 0, i < cuts.length - 2]);
  }
  for (const [A, B, gapA, gapB] of sections) {
    for (let k = 0; k < N; k++) {
      const ra = rk(k), rb = rk(k + 1), rf = ra + T * 0.6; // 앞 60% 화강석 걸터앉는 단, 뒤 40% 잔디
      const half = AW / 2 / ((ra + rb) / 2);
      const a0 = A + (gapA ? half : 0), a1 = B - (gapB ? half : 0);
      const n = Math.max(2, Math.ceil((a1 - a0) / STEP));
      for (let j = 0; j < n; j++) {
        const p = a0 + ((a1 - a0) * j) / n, q = a0 + ((a1 - a0) * (j + 1)) / n;
        const yp = tiers(p), yq = tiers(q);
        const y0p = k ? yp[k - 1] : yp.base, y0q = k ? yq[k - 1] : yq.base;
        // 걸터앉는 단 윗면
        stoneM.quad(v3(ra, p, yp[k]), v3(rf, p, yp[k]), v3(rf, q, yq[k]), v3(ra, q, yq[k]), [p * ra, ra], [p * rf, rf], [q * rf, rf], [q * ra, ra], [0, 1, 0]);
        // 앞 챌면(아레나 쪽을 봄)
        const cp = P2(1, (p + q) / 2);
        stoneM.quad(v3(ra, p, y0p - 0.12), v3(ra, q, y0q - 0.12), v3(ra, q, yq[k]), v3(ra, p, yp[k]), [p * ra, y0p], [q * ra, y0q], [q * ra, yq[k]], [p * ra, yp[k]], [-cp[0], 0, -cp[1]]);
        // 단 사이 잔디 (살짝 낮게)
        grassM.quad(v3(rf, p, yp[k] - 0.05), v3(rb, p, yp[k] - 0.05), v3(rb, q, yq[k] - 0.05), v3(rf, q, yq[k] - 0.05), [p * rf, rf], [p * rb, rb], [q * rb, rb], [q * rf, rf], [0, 1, 0]);
      }
      // 구역 끝 옆면 (통로·말굽 끝에서 보이는 단 단면)
      for (const [a, s] of [[a0, -1], [a1, 1]]) {
        const ys = tiers(a), yb = (k ? ys[k - 1] : ys.base) - 0.3;
        const isEnd = (s < 0 && !gapA) || (s > 0 && !gapB);
        const bot = isEnd ? Math.min(yb, heightAt(...P2(rb, a)) - 0.4) : yb;
        const t = [-Math.sin(a) * s, 0, Math.cos(a) * s];
        stoneM.quad(v3(ra, a, bot), v3(rb, a, bot), v3(rb, a, ys[k]), v3(ra, a, ys[k]), [ra, bot], [rb, bot], [rb, ys[k]], [ra, ys[k]], t);
      }
    }
  }
  const bowl = new THREE.Group(); bowl.name = '209 객석';
  bowl.add(shadow(new THREE.Mesh(stoneM.geo(), seatStone)), shadow(new THREE.Mesh(grassM.geo(), grass), false));

  // 통로 계단 (단 하나에 두 칸) + 흰 금속 난간 (한쪽)
  {
    const steps = [], rails = [];
    for (const a of AISLES) {
      const ys = tiers(a), dir = P2(1, a), tg = [-Math.sin(a), Math.cos(a)];
      const rot = Math.atan2(dir[0] - C[0], dir[1] - C[1]);
      let prevTop = null;
      for (let k = 0; k < N; k++) {
        const lo = k ? ys[k - 1] : ys.base + 0.4, hi = ys[k];
        for (let h = 0; h < 2; h++) {
          const top = lo + ((hi - lo) * (h + 1)) / 2, r0 = rk(k) + (T * h) / 2, rc = r0 + T / 4;
          const bot = Math.min(lo, heightAt(...P2(rc, a))) - 0.35;
          const g = boxM(AW + 0.02, top - bot, T / 2 + 0.02);
          g.rotateY(rot);
          const [x, z] = P2(rc, a);
          g.translate(x, (top + bot) / 2, z);
          steps.push(g);
        }
        // 난간 기둥 + 손잡이
        const [px, pz] = P2(rk(k) + T * 0.5, a);
        const bx = px + tg[0] * (AW / 2 - 0.12), bz = pz + tg[1] * (AW / 2 - 0.12), top = hi + 0.9;
        rails.push(tube([bx, hi - 0.05, bz], [bx, top, bz], 0.025, 5));
        if (prevTop) rails.push(tube(prevTop, [bx, top, bz], 0.03, 6));
        prevTop = [bx, top, bz];
      }
    }
    bowl.add(shadow(new THREE.Mesh(mergeGeometries(steps.map((g) => g.toNonIndexed())), seatStone)));
    bowl.add(shadow(new THREE.Mesh(mergeGeometries(rails), white), false));
  }

  // 아레나 바닥 (베이지 마사토) + 꼭대기 부채꼴 포장 산책로 — 지면을 따라 얇게 덮음
  {
    const m = new Mesher(), RA = R0 - 0.2, NR = 10, NA = 72;
    for (let i = 0; i < NR; i++) for (let j = 0; j < NA; j++) {
      const r0 = (RA * i) / NR, r1 = (RA * (i + 1)) / NR, p = (j / NA) * Math.PI * 2, q = ((j + 1) / NA) * Math.PI * 2;
      const V = (r, a) => { const [x, z] = P2(r, a); return [x, heightAt(x, z) + 0.04, z]; };
      const a = V(r0, p), bb = V(r1, p), c = V(r1, q), d = V(r0, q);
      m.quad(a, bb, c, d, [a[0], a[2]], [bb[0], bb[2]], [c[0], c[2]], [d[0], d[2]], [0, 1, 0]);
    }
    bowl.add(shadow(new THREE.Mesh(m.geo(), arenaMat), false));
    const pm = new Mesher(), r0 = R1 + 0.5, r1 = R1 + 4.5, a0 = PHI0 - 6 * D2R, a1 = PHI1 + 6 * D2R, n = 80;
    for (let j = 0; j < n; j++) for (let i = 0; i < 2; i++) {
      const p = a0 + ((a1 - a0) * j) / n, q = a0 + ((a1 - a0) * (j + 1)) / n, ra = r0 + ((r1 - r0) * i) / 2, rb = r0 + ((r1 - r0) * (i + 1)) / 2;
      const V = (r, a) => { const [x, z] = P2(r, a); return [x, heightAt(x, z) + 0.05, z]; };
      // uv: 원주 방향 길이 × 반지름 → 부채꼴 무늬가 원을 따라 돈다
      pm.quad(V(ra, p), V(rb, p), V(rb, q), V(ra, q), [p * R1, ra], [p * R1, rb], [q * R1, rb], [q * R1, ra], [0, 1, 0]);
    }
    bowl.add(shadow(new THREE.Mesh(pm.geo(), promMat), false));
  }

  // =====================================================================
  // 2) 무대동 — OSM 윤곽 그대로. 북쪽 호(반지름 21.7, 중심 S)가 무대 앞선, 남쪽 호(중심 Q)가 도로 쪽 곡면 정면
  // =====================================================================
  const S = [78.9, 78.1], Q = [89.6, 52.6], RQ = 30.2;
  // 무대 정면 방향: 북쪽 호 양 끝의 가운데
  const arcPts = b.pts.filter(([x, z]) => Math.abs(Math.hypot(x - S[0], z - S[1]) - 21.7) < 0.4);
  let fx = 0, fz = 0;
  for (const [x, z] of [arcPts[0], arcPts[arcPts.length - 1]]) { const d = Math.hypot(x - S[0], z - S[1]); fx += (x - S[0]) / d; fz += (z - S[1]) / d; }
  { const L = Math.hypot(fx, fz); fx /= L; fz /= L; }
  const fAng = Math.atan2(fz, fx);
  const SP = (r, al) => [S[0] + Math.cos(fAng + al) * r, S[1] + Math.sin(fAng + al) * r];
  const y0 = heightAt(...SP(17, 0));
  const gLo = Math.min(...b.pts.map(([x, z]) => heightAt(x, z)));
  const DECK = y0 + 1.2, BODY = y0 + 6.8, WING = y0 + 4.4, WA = 40 * D2R;
  const stage = new THREE.Group(); stage.name = '209 무대동';
  const nL = [-Math.sin(fAng + WA), Math.cos(fAng + WA)], nR = [Math.sin(fAng - WA), -Math.cos(fAng - WA)];
  // 안쪽을 향하도록 (f 쪽)
  for (const n of [nL, nR]) if (n[0] * fx + n[1] * fz < 0) { n[0] = -n[0]; n[1] = -n[1]; }
  const deckPoly = clipHalf(clipHalf(b.pts, S, nL), S, nR);
  const bodyPoly = clipDisc(b.pts, S, 13);
  const wingL = clipHalf(b.pts, S, [-nL[0], -nL[1]]), wingR = clipHalf(b.pts, S, [-nR[0], -nR[1]]);
  stage.add(shadow(new THREE.Mesh(extrude(deckPoly, gLo - 0.5, DECK - gLo + 0.5), [concrete, panel])));
  stage.add(shadow(new THREE.Mesh(extrude(bodyPoly, gLo - 0.5, BODY - gLo + 0.5), [concrete, panel])));
  for (const w of [wingL, wingR]) if (w.length > 2) stage.add(shadow(new THREE.Mesh(extrude(w, gLo - 0.5, WING - gLo + 0.5), [concrete, panel])));
  // 옥상 난간벽(파라펫) — 본동 둘레를 살짝 올림
  {
    const m = new Mesher();
    for (let i = 0; i < bodyPoly.length; i++) {
      const A = bodyPoly[i], B2 = bodyPoly[(i + 1) % bodyPoly.length];
      const L = Math.hypot(B2[0] - A[0], B2[1] - A[1]); if (L < 0.2) continue;
      m.quad([A[0], BODY, A[1]], [B2[0], BODY, B2[1]], [B2[0], BODY + 0.45, B2[1]], [A[0], BODY + 0.45, A[1]], [0, 0], [L, 0], [L, 0.45], [0, 0.45], null);
    }
    const g = m.geo(); stage.add(shadow(new THREE.Mesh(g, new THREE.MeshStandardMaterial({ color: 0xe9e5dc, roughness: 0.7, side: THREE.DoubleSide }))));
  }

  // --- 무대 위 흰 곡선 셸 지붕 (조개껍데기): 양 끝은 낮게, 가운데·앞쪽이 부풀어 오름
  {
    const NA = 28, NRr = 10, A = 37 * D2R, rIn = 12.6;
    const rOut = (u) => 21.0 + 1.4 * (1 - u * u);
    const Y = (u, t) => DECK + 4.0 + 4.5 * Math.pow(1 - u * u, 0.85) * (0.66 + 0.34 * t);
    const pt = (u, t) => { const r = rIn + (rOut(u) - rIn) * t; const [x, z] = SP(r, u * A); return [x, Y(u, t), z]; };
    const m = new Mesher(), edge = new Mesher();
    for (let i = 0; i < NA; i++) for (let j = 0; j < NRr; j++) {
      const u0 = -1 + (2 * i) / NA, u1 = -1 + (2 * (i + 1)) / NA, t0 = j / NRr, t1 = (j + 1) / NRr;
      m.quad(pt(u0, t0), pt(u1, t0), pt(u1, t1), pt(u0, t1), [u0 * 14, t0 * 9], [u1 * 14, t0 * 9], [u1 * 14, t1 * 9], [u0 * 14, t1 * 9], [0, 1, 0]);
    }
    // 앞·옆 가장자리 두께 (보 0.4m)
    const rim = (u, t) => { const p = pt(u, t); return [[p[0], p[1], p[2]], [p[0], p[1] - 0.4, p[2]]]; };
    for (let i = 0; i < NA; i++) {
      const u0 = -1 + (2 * i) / NA, u1 = -1 + (2 * (i + 1)) / NA, [a, a2] = rim(u0, 1), [c, c2] = rim(u1, 1);
      edge.quad(a2, c2, c, a, [0, 0], [1, 0], [1, 1], [0, 1], null);
    }
    for (const u of [-1, 1]) for (let j = 0; j < NRr; j++) {
      const [a, a2] = rim(u, j / NRr), [c, c2] = rim(u, (j + 1) / NRr);
      edge.quad(a2, c2, c, a, [0, 0], [1, 0], [1, 1], [0, 1], null);
    }
    const shell = new THREE.Mesh(mergeGeometries([m.geo(), edge.geo()]), whiteShell);
    stage.add(shadow(shell));
    // 아래 철골: 방사 리브 + 가로 트러스 2줄 + 조명
    const steel = [], lamps = [];
    for (let i = 0; i <= 8; i++) {
      const u = -0.88 + (1.76 * i) / 8;
      for (let j = 0; j < 8; j++) { const a = pt(u, j / 8), c = pt(u, (j + 1) / 8); steel.push(tube([a[0], a[1] - 0.35, a[2]], [c[0], c[1] - 0.35, c[2]], 0.09, 6)); }
    }
    for (const t of [0.35, 0.8]) for (let i = 0; i < 20; i++) {
      const u0 = -0.92 + (1.84 * i) / 20, u1 = -0.92 + (1.84 * (i + 1)) / 20, a = pt(u0, t), c = pt(u1, t);
      steel.push(tube([a[0], a[1] - 0.75, a[2]], [c[0], c[1] - 0.75, c[2]], 0.08, 6));
      if (t > 0.5 && i % 2 === 0) {
        const lg = new THREE.CylinderGeometry(0.2, 0.15, 0.4, 8);
        lg.translate(a[0], a[1] - 1.15, a[2]); lamps.push(lg);
        steel.push(tube([a[0], a[1] - 0.75, a[2]], [a[0], a[1] - 0.95, a[2]], 0.03, 4));
      }
    }
    // 양 끝 받침: 무대 바닥에서 셸 가장자리로 V자 기둥
    for (const s of [-1, 1]) {
      const [bx, bz] = SP(16.8, s * (A + 2.5 * D2R));
      for (const t of [0.15, 0.85]) { const p = pt(s, t); steel.push(tube([bx, DECK, bz], [p[0], p[1] - 0.3, p[2]], 0.17, 8)); }
      const p = pt(s, 0.5); steel.push(tube([bx, DECK, bz], [p[0], p[1] - 0.3, p[2]], 0.13, 8));
    }
    stage.add(shadow(new THREE.Mesh(mergeGeometries(steel), white)));
    stage.add(new THREE.Mesh(mergeGeometries(lamps), dark));
  }

  // --- 남쪽 도로면: 흰 곡선 셸 처마 + 유리문 + 흰 띠 차양 + '209'
  {
    const QP = (r, th) => [Q[0] + Math.cos(th) * r, Q[1] + Math.sin(th) * r];
    const th0 = 97 * D2R, th1 = 129 * D2R, thm = (th0 + th1) / 2, n = 32;
    const YE = y0 + 5.5, ext = 3.0;
    const lift = (th) => 0.9 * Math.pow((th - thm) / ((th1 - th0) / 2), 2);
    const m = new Mesher(), soff = new Mesher();
    for (let j = 0; j < n; j++) {
      const p = th0 + ((th1 - th0) * j) / n, q = th0 + ((th1 - th0) * (j + 1)) / n;
      const V = (r, th, dy) => { const [x, z] = QP(r, th); return [x, YE + lift(th) * ((r - RQ) / ext) + dy, z]; };
      const ri = RQ - 0.2, ro = RQ + ext, out = [Math.cos((p + q) / 2), 0, Math.sin((p + q) / 2)];
      m.quad(V(ri, p, 0.45), V(ro, p, 0.45), V(ro, q, 0.45), V(ri, q, 0.45), [0, 0], [1, 0], [1, 1], [0, 1], [0, 1, 0]); // 윗면
      soff.quad(V(ri, p, 0), V(ro, p, 0), V(ro, q, 0), V(ri, q, 0), [0, 0], [1, 0], [1, 1], [0, 1], [0, -1, 0]); // 밑면(어두운 루버)
      m.quad(V(ro, p, -0.75), V(ro, q, -0.75), V(ro, q, 0.65), V(ro, p, 0.65), [0, 0], [1, 0], [1, 1], [0, 1], out); // 앞 띠
      m.quad(V(ro - 0.25, p, -0.75), V(ro, p, -0.75), V(ro, q, -0.75), V(ro - 0.25, q, -0.75), [0, 0], [1, 0], [1, 1], [0, 1], [0, -1, 0]);
    }
    for (const th of [th0, th1]) {
      const V = (r, dy) => { const [x, z] = QP(r, th); return [x, YE + lift(th) * ((r - RQ) / ext) + dy, z]; };
      const t = th === th0 ? [Math.sin(th), 0, -Math.cos(th)] : [-Math.sin(th), 0, Math.cos(th)];
      m.quad(V(RQ - 0.2, 0), V(RQ + ext, -0.75), V(RQ + ext, 0.65), V(RQ - 0.2, 0.45), [0, 0], [1, 0], [1, 1], [0, 1], t);
    }
    stage.add(shadow(new THREE.Mesh(m.geo(), white)), new THREE.Mesh(soff.geo(), dark));
    // 유리문 (곡면) + 흰 수평 차양 띠
    const gl = new Mesher(), led = new Mesher();
    const gd = 0.12, gn = 8;
    for (let j = 0; j < gn; j++) {
      const p = thm - gd + (2 * gd * j) / gn, q = thm - gd + (2 * gd * (j + 1)) / gn;
      const [ax, az] = QP(RQ + 0.06, p), [cx, cz] = QP(RQ + 0.06, q);
      gl.quad([ax, y0, az], [cx, y0, cz], [cx, y0 + 3.1, cz], [ax, y0 + 3.1, az], [0, 0], [1, 0], [1, 1], [0, 1], [Math.cos(p), 0, Math.sin(p)]);
    }
    for (let j = 0; j < 30; j++) {
      const p = th0 - 2 * D2R + ((th1 - th0 + 4 * D2R) * j) / 30, q = th0 - 2 * D2R + ((th1 - th0 + 4 * D2R) * (j + 1)) / 30;
      const V = (r, th, y) => { const [x, z] = QP(r, th); return [x, y, z]; };
      led.quad(V(RQ, p, y0 + 3.75), V(RQ + 0.9, p, y0 + 3.75), V(RQ + 0.9, q, y0 + 3.75), V(RQ, q, y0 + 3.75), [0, 0], [1, 0], [1, 1], [0, 1], [0, 1, 0]);
      led.quad(V(RQ, p, y0 + 3.55), V(RQ + 0.9, p, y0 + 3.55), V(RQ + 0.9, q, y0 + 3.55), V(RQ, q, y0 + 3.55), [0, 0], [1, 0], [1, 1], [0, 1], [0, -1, 0]);
      led.quad(V(RQ + 0.9, p, y0 + 3.55), V(RQ + 0.9, q, y0 + 3.55), V(RQ + 0.9, q, y0 + 3.75), V(RQ + 0.9, p, y0 + 3.75), [0, 0], [1, 0], [1, 1], [0, 1], [Math.cos(p), 0, Math.sin(p)]);
    }
    stage.add(new THREE.Mesh(gl.geo(), dark), shadow(new THREE.Mesh(led.geo(), white)));
    // 문 양옆 화강석 기둥·문살
    for (const s of [-1, 1]) {
      const th = thm + s * (gd + 0.012), [x, z] = QP(RQ + 0.35, th);
      const g = boxM(0.9, 3.55, 0.7); g.rotateY(Math.atan2(Math.cos(th), Math.sin(th))); g.translate(x, y0 + 1.775, z);
      stage.add(shadow(new THREE.Mesh(g, panel)));
    }
    for (let i = 1; i < 4; i++) {
      const th = thm - gd + (2 * gd * i) / 4, [x, z] = QP(RQ + 0.1, th);
      const g = new THREE.BoxGeometry(0.08, 3.1, 0.08); g.translate(x, y0 + 1.55, z); stage.add(new THREE.Mesh(g, white));
    }
    // '209' 번호판
    {
      const th = th1 - 3.5 * D2R, [x, z] = QP(RQ + ext + 0.03, th);
      const g = new THREE.PlaneGeometry(1.7, 0.85); g.rotateY(Math.atan2(Math.cos(th), Math.sin(th))); g.translate(x, YE + lift(th) + 0.1, z);
      stage.add(new THREE.Mesh(g, signMat));
    }
  }
  // 옆 날개 남쪽 면 작은 창 (로드뷰: 서쪽 상자 위 작은 사각창 + 아래 창살 창)
  {
    const wins = [];
    const add = (A, B2, t, y, w, h) => {
      const x = A[0] + (B2[0] - A[0]) * t, z = A[1] + (B2[1] - A[1]) * t;
      let nx = -(B2[1] - A[1]), nz = B2[0] - A[0]; const L = Math.hypot(nx, nz); nx /= L; nz /= L;
      if (nx * (x - S[0]) + nz * (z - S[1]) < 0) { nx = -nx; nz = -nz; } // 바깥쪽으로
      const g = new THREE.BoxGeometry(w, h, 0.1); g.rotateY(Math.atan2(nx, nz)); g.translate(x + nx * 0.04, y, z + nz * 0.04); wins.push(g);
    };
    const W1 = [62.78, 70.31], W2 = [69.86, 72.97];
    for (const t of [0.25, 0.5, 0.75]) add(W1, W2, t, y0 + 3.4, 0.6, 0.6);
    add(W1, W2, 0.5, y0 + 1.4, 3.0, 1.5);
    const E1 = [88.88, 80.2], E2 = [95.53, 82.73];
    for (const t of [0.3, 0.5, 0.7]) add(E1, E2, t, y0 + 2.6, 0.45, 1.6);
    stage.add(new THREE.Mesh(mergeGeometries(wins), dark));
  }

  // 서쪽 계단식 화단의 원뿔형 향나무 (로드뷰 2)
  {
    const cones = [], base = new THREE.ConeGeometry(0.55, 1.9, 8);
    base.translate(0, 0.95, 0);
    for (let r = 27; r <= 42; r += 3) {
      const a0 = -206 * D2R, a1 = -190 * D2R, n = Math.max(2, Math.round(((a1 - a0) * r) / 2.6));
      for (let j = 0; j <= n; j++) {
        const [x, z] = P2(r, a0 + ((a1 - a0) * j) / n), s = 0.85 + ((j * 37 + r * 11) % 7) / 20;
        cones.push(base.clone().scale(s, s, s).translate(x, heightAt(x, z) - 0.05, z));
      }
    }
    bowl.add(shadow(new THREE.Mesh(mergeGeometries(cones), new THREE.MeshStandardMaterial({ color: 0x3f5a32, roughness: 0.9 }))));
  }

  // 객석은 카메라 가림 판정에서 빼려고 장면에 바로 넣는다 (무대동만 건물 그룹으로)
  mergeStatic(bowl, mergeGeometries);
  scene.add(bowl);

  // 나무 금지: 사발 전체(산책로까지) + 무대동
  const clear = [Array.from({ length: 64 }, (_, i) => P2(R1 + 4.5, (i / 64) * Math.PI * 2))];
  return {
    group: stage,
    skipIds: [b.id],
    footprints: [{ id: b.id, pts: b.pts, top: y0 + 9.9 }],
    clear,
    replace: ['amph'],
  };
}
