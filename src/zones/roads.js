// 캠퍼스 도로 디테일 — 지형 스플랫(아스팔트/보도) 위에 실제 메시를 얹는다
//  · 차도: 짙은 아스팔트 띠 + 화강석 연석(15cm) + 분홍 보행띠 + 노란 중앙선
//  · 보도(footway/pedestrian): 노란 점자블록(선형) 줄
//  · 보행로가 차도를 가로지르는 곳: 흰 횡단보도 줄무늬 + 양쪽 점형 점자블록, 연석 끊음
//  · 사자상 광장(plazaPoly) 안·계단(steps)은 그리지 않음, 큰길(trunk)은 아스팔트+중앙선만
// 재질마다 BufferGeometry 하나 (이미 합쳐진 상태) — 삼각형·빌드 시간은 콘솔 'zone roads' 줄에 찍힘
import { loadTex, pointInPoly } from '../util.js';

// main.js 의 사자상 광장 다각형 (복사본 — 여기는 이미 완성된 광장이라 건드리지 않음)
const PLAZA = [[-49, -12], [-15, -16], [-14, -30], [-8, -44], [12, -37], [14, -26], [6, -12], [-1, 5], [-9, 16], [-20, 42], [-49, 42]];
const CAR = new Set(['service', 'residential', 'living_street', 'primary', 'primary_link', 'secondary', 'secondary_link', 'trunk', 'tertiary', 'unclassified']);
const CAMPUS = new Set(['service', 'residential', 'living_street', 'unclassified']); // 분홍 보행띠를 칠하는 교내 도로
const FOOT = new Set(['footway', 'pedestrian', 'path', 'cycleway']);
const STEP = 4; // 길이 방향 샘플 간격 (성능: 2.5 → 4m. 삼각형 수 감소)

export default async function (ctx) {
  const { THREE, world } = ctx;
  // 지형 메시와 똑같은 삼각형 보간 (bilinear heightAt 은 격자 대각선에서 몇 cm 어긋나 지면이 뚫고 올라옴)
  // PlaneGeometry 칸 (a=i,j  b=i,j+1  c=i+1,j+1  d=i+1,j) → 면 (a,b,d) (b,c,d)
  const T = world.terrain;
  const heightAt = (x, z) => {
    const fx = (x - T.minX) / T.step, fz = (z - T.minZ) / T.step;
    const i = Math.max(0, Math.min(T.w - 2, Math.floor(fx))), j = Math.max(0, Math.min(T.h - 2, Math.floor(fz)));
    const u = Math.max(0, Math.min(1, fx - i)), v = Math.max(0, Math.min(1, fz - j)), D = T.data;
    const a = D[j * T.w + i], d = D[j * T.w + i + 1], b = D[(j + 1) * T.w + i], c = D[(j + 1) * T.w + i + 1];
    return u + v <= 1 ? a + (d - a) * u + (b - a) * v : c + (b - c) * (1 - u) + (d - c) * (1 - v);
  };
  const T0 = performance.now();
  const group = new THREE.Group();
  group.name = 'roads';

  // ---- 재질 (6개) -------------------------------------------------------
  const [aD, aN, aR, bD, bN, gD, gN] = await Promise.all([
    loadTex('/tex/asphalt_diff.jpg'), loadTex('/tex/asphalt_nor.jpg', { srgb: false }), loadTex('/tex/asphalt_rough.jpg', { srgb: false }),
    loadTex('/tex/brickpave_diff.jpg'), loadTex('/tex/brickpave_nor.jpg', { srgb: false }),
    loadTex('/tex/granite_diff.jpg'), loadTex('/tex/granite_nor.jpg', { srgb: false }),
  ]);
  const off = (f) => ({ polygonOffset: true, polygonOffsetFactor: f, polygonOffsetUnits: f });
  const M = {
    asphalt: new THREE.MeshStandardMaterial({ map: aD, normalMap: aN, roughnessMap: aR, color: 0x6a6d72, roughness: 1, ...off(-1) }),
    pink: new THREE.MeshStandardMaterial({ map: bD, normalMap: bN, color: 0xe08f8c, roughness: 0.92, ...off(-2) }),
    curb: new THREE.MeshStandardMaterial({ map: gD, normalMap: gN, color: 0xffffff, roughness: 0.8 }),
    white: new THREE.MeshStandardMaterial({ color: 0xe9e9e4, roughness: 0.7, ...off(-3) }),
    yellow: new THREE.MeshStandardMaterial({ color: 0xe8b414, roughness: 0.7, ...off(-3) }),
    tactile: new THREE.MeshStandardMaterial({ map: tactileTex(THREE), color: 0xffffff, roughness: 0.75, ...off(-2) }),
  };
  M.pink.normalScale.set(0.6, 0.6);

  // ---- 버퍼 (재질별) ------------------------------------------------------
  const buf = Object.fromEntries(Object.keys(M).map((k) => [k, { p: [], n: [], u: [] }]));
  const V = (x, y, z) => [x, y, z];
  // 삼각형 하나 — want 방향(위·옆)을 보도록 감기 순서를 자동으로 맞춤
  function tri(B, a, b, c, ua, ub, uc, want) {
    const e1 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], e2 = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
    let n = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]];
    if (n[0] * want[0] + n[1] * want[1] + n[2] * want[2] < 0) { [b, c] = [c, b]; [ub, uc] = [uc, ub]; n = n.map((v) => -v); }
    const L = Math.hypot(...n) || 1;
    const nn = want[1] === 1 ? n.map((v) => v / L) : want; // 바닥 띠는 경사면 법선, 옆면은 수평 법선
    B.p.push(...a, ...b, ...c); B.n.push(...nn, ...nn, ...nn); B.u.push(...ua, ...ub, ...uc);
  }
  const quad = (B, a, b, c, d, ua, ub, uc, ud, want) => { tri(B, a, b, c, ua, ub, uc, want); tri(B, b, d, c, ub, ud, uc, want); };
  const UP = [0, 1, 0];

  // ---- 다른 도로 안쪽인지 판정용 선분 색인 ------------------------------
  const CELL = 16, grid = new Map();
  const gkey = (i, j) => i * 100003 + j;
  const cars = [];
  world.roads.forEach((r, rid) => {
    if (r.kind !== 'road' || !CAR.has(r.hw) || r.pts.length < 2) return;
    cars.push({ r, rid });
    for (let i = 1; i < r.pts.length; i++) {
      const a = r.pts[i - 1], b = r.pts[i], pad = r.w / 2 + 2;
      const seg = { a, b, w: r.w, rid, aEnd: i === 1, bEnd: i === r.pts.length - 1, hw: r.hw };
      for (let gi = Math.floor((Math.min(a[0], b[0]) - pad) / CELL); gi <= Math.floor((Math.max(a[0], b[0]) + pad) / CELL); gi++)
        for (let gj = Math.floor((Math.min(a[1], b[1]) - pad) / CELL); gj <= Math.floor((Math.max(a[1], b[1]) + pad) / CELL); gj++) {
          const k = gkey(gi, gj);
          if (!grid.has(k)) grid.set(k, []);
          grid.get(k).push(seg);
        }
    }
  });
  const near = (x, z) => grid.get(gkey(Math.floor(x / CELL), Math.floor(z / CELL))) || [];
  // (x,z) 가 rid 가 아닌 다른 차도의 아스팔트 안(가장자리에서 pad 만큼 안쪽)인가
  // 길 끝점에서 잘린 투영은 무시 → 이어지는 길(같은 도로가 OSM 에서 둘로 나뉨)의 이음매에서 끊기지 않음
  // dir=[tx,tz] 를 주면 그 방향과 나란한 길(왕복 분리 도로의 짝)은 무시
  function inOther(x, z, rid, pad = 0.1, dir = null) {
    for (const s of near(x, z)) {
      if (s.rid === rid) continue;
      const dx = s.b[0] - s.a[0], dz = s.b[1] - s.a[1], L = dx * dx + dz * dz || 1;
      if (dir && Math.abs(dx * dir[0] + dz * dir[1]) > 0.94 * Math.sqrt(L)) continue;
      let t = ((x - s.a[0]) * dx + (z - s.a[1]) * dz) / L;
      if ((t < 0 && s.aEnd) || (t > 1 && s.bEnd)) continue;
      t = Math.max(0, Math.min(1, t));
      const px = s.a[0] + dx * t - x, pz = s.a[1] + dz * t - z;
      if (px * px + pz * pz < Math.max(0, s.w / 2 - pad) ** 2) return true;
    }
    return false;
  }
  // 다른 구역이 직접 포장한 광장(법대 벽돌 광장 등) 위에는 점자블록을 깔지 않음 — main.js 가 앞서 불러온 구역 결과를 ctx.prior 로 넘김
  const zonePlazas = (ctx.prior || []).flatMap((z) => z.plazas || []);
  const inZonePlaza = (x, z) => zonePlazas.some((q) => pointInPoly(x, z, q));
  const inPlaza = (x, z) => x > -50 && x < 15 && z > -45 && z < 43 && pointInPoly(x, z, PLAZA);

  // ---- 폴리라인 재표본 (꺾이는 점은 마이터 법선) -------------------------
  function samples(pts, step = STEP) {
    const S = [];
    let s0 = 0;
    for (let i = 1; i < pts.length; i++) {
      const a = pts[i - 1], b = pts[i], L = Math.hypot(b[0] - a[0], b[1] - a[1]);
      if (L < 1e-3) continue;
      const tx = (b[0] - a[0]) / L, tz = (b[1] - a[1]) / L;
      const n = Math.max(1, Math.ceil(L / step));
      for (let k = S.length ? 1 : 0; k <= n; k++) {
        const f = k / n;
        S.push({ x: a[0] + (b[0] - a[0]) * f, z: a[1] + (b[1] - a[1]) * f, tx, tz, nx: -tz, nz: tx, s: s0 + L * f, vtx: k === n && i < pts.length - 1 });
      }
      s0 += L;
    }
    // 꺾인 점: 앞뒤 선분 법선 평균, 1/cos 로 늘림 (너무 뾰족하면 제한)
    for (let i = 1; i < S.length - 1; i++) {
      if (!S[i].vtx) continue;
      const p = S[i], q = S[i + 1];
      let mx = p.nx + -q.tz, mz = p.nz + q.tx;
      const ml = Math.hypot(mx, mz) || 1; mx /= ml; mz /= ml;
      const c = Math.max(0.5, mx * p.nx + mz * p.nz);
      p.nx = mx / c; p.nz = mz / c;
    }
    return S;
  }
  const at = (p, o) => [p.x + p.nx * o, p.z + p.nz * o];

  // 바닥에 붙은 띠: 가로 오프셋 o0..o1, cols 칸, keep(샘플, 중심오프셋)
  function ribbon(B, S, o0, o1, lift, cols, keep, uvf) {
    const om = (o0 + o1) / 2;
    const ok = S.map((p) => keep(p, om));
    const row = (p) => {
      const r = [];
      for (let c = 0; c <= cols; c++) {
        const o = o0 + ((o1 - o0) * c) / cols, [x, z] = at(p, o);
        r.push({ v: V(x, heightAt(x, z) + lift, z), uv: uvf(x, z, p.s, (o - o0) / (o1 - o0 || 1)) });
      }
      return r;
    };
    let prev = null;
    for (let i = 0; i < S.length; i++) {
      const cur = ok[i] ? row(S[i]) : null;
      if (cur && prev) for (let c = 0; c < cols; c++)
        quad(B, prev[c].v, prev[c + 1].v, cur[c].v, cur[c + 1].v, prev[c].uv, prev[c + 1].uv, cur[c].uv, cur[c + 1].uv, UP);
      prev = cur;
    }
  }

  // 연석: 오프셋 oIn(차도 쪽)..oOut, 높이 hgt — 윗면 + 양 옆면
  function curb(B, S, oIn, oOut, base, hgt, keep) {
    const om = (oIn + oOut) / 2, sgn = Math.sign(oOut - oIn);
    let prev = null;
    for (let i = 0; i < S.length; i++) {
      const p = S[i];
      let cur = null;
      if (keep(p, om)) {
        const [xi, zi] = at(p, oIn), [xo, zo] = at(p, oOut);
        const hi = heightAt(xi, zi) + base, ho = heightAt(xo, zo) + base;
        const top = Math.max(hi, ho) + hgt;
        cur = { iB: V(xi, hi - 0.05, zi), iT: V(xi, top, zi), oT: V(xo, top, zo), oB: V(xo, ho - 0.12, zo), s: p.s, nx: p.nx * sgn, nz: p.nz * sgn };
      }
      if (cur && prev) {
        const s0 = prev.s, s1 = cur.s;
        quad(B, prev.iT, prev.oT, cur.iT, cur.oT, [s0, 0], [s0, 0.25], [s1, 0], [s1, 0.25], UP);
        const nl = Math.hypot(cur.nx, cur.nz) || 1, nOut = [cur.nx / nl, 0, cur.nz / nl], nIn = [-nOut[0], 0, -nOut[2]];
        quad(B, prev.iB, prev.iT, cur.iB, cur.iT, [s0, 0.3], [s0, 0.45], [s1, 0.3], [s1, 0.45], nIn);
        quad(B, prev.oT, prev.oB, cur.oT, cur.oB, [s0, 0.5], [s0, 0.7], [s1, 0.5], [s1, 0.7], nOut);
      }
      prev = cur;
    }
  }

  // ---- 횡단보도 찾기: 보행로 선분 × 차도 선분 교차 -----------------------
  const crossings = new Map(); // rid → [{s, x, z, tx, tz}]
  const segX = (a, b, c, d) => {
    const r0 = b[0] - a[0], r1 = b[1] - a[1], q0 = d[0] - c[0], q1 = d[1] - c[1], den = r0 * q1 - r1 * q0;
    if (Math.abs(den) < 1e-9) return null;
    const t = ((c[0] - a[0]) * q1 - (c[1] - a[1]) * q0) / den, u = ((c[0] - a[0]) * r1 - (c[1] - a[1]) * r0) / den;
    return t >= 0 && t < 1 && u >= 0 && u <= 1 ? [t, u] : null;
  };
  const roadS = new Map(); // rid → 선분별 누적 길이
  for (const { r, rid } of cars) { const acc = [0]; for (let i = 1; i < r.pts.length; i++) acc.push(acc[i - 1] + Math.hypot(r.pts[i][0] - r.pts[i - 1][0], r.pts[i][1] - r.pts[i - 1][1])); roadS.set(rid, acc); }
  for (const f of world.roads) {
    if (f.kind === 'road' || !FOOT.has(f.hw)) continue;
    let fs = 0; const FL = f.pts.reduce((L, p, i) => (i ? L + Math.hypot(p[0] - f.pts[i - 1][0], p[1] - f.pts[i - 1][1]) : 0), 0);
    for (let i = 1; i < f.pts.length; i++) {
      const a = f.pts[i - 1], b = f.pts[i], L = Math.hypot(b[0] - a[0], b[1] - a[1]);
      const seen = new Set();
      for (const cx of [a, b, [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]]) for (const s of near(cx[0], cx[1])) {
        if (seen.has(s) || s.hw === 'trunk') continue; seen.add(s);
        const hit = segX(a, b, s.a, s.b);
        if (!hit) continue;
        const sf = fs + L * hit[0];
        if (sf < 0.5 || sf > FL - 0.5) continue; // 길에 닿기만 하고 끝나는 보행로는 횡단 아님
        const r = world.roads[s.rid], acc = roadS.get(s.rid), si = r.pts.indexOf(s.a);
        const sl = Math.hypot(s.b[0] - s.a[0], s.b[1] - s.a[1]) || 1;
        const x = s.a[0] + (s.b[0] - s.a[0]) * hit[1], z = s.a[1] + (s.b[1] - s.a[1]) * hit[1];
        if (inPlaza(x, z)) continue;
        const list = crossings.get(s.rid) || [];
        if (list.some((c) => Math.hypot(c.x - x, c.z - z) < 8)) continue;
        list.push({ s: acc[si] + sl * hit[1], x, z, tx: (s.b[0] - s.a[0]) / sl, tz: (s.b[1] - s.a[1]) / sl, w: r.w });
        crossings.set(s.rid, list);
      }
      fs += L;
    }
  }
  // 교차로 한가운데(다른 차도 안)에 생긴 횡단보도는 뺌
  for (const [rid, list] of crossings) crossings.set(rid, list.filter((c) => !inOther(c.x, c.z, rid, -1)));
  const allCross = [...crossings.values()].flat();
  const nearAnyCross = (x, z) => allCross.some((c) => Math.abs(c.x - x) < c.w && Math.abs(c.z - z) < c.w && Math.abs((x - c.x) * c.tx + (z - c.z) * c.tz) < 2.6 && Math.hypot(x - c.x, z - c.z) < c.w);
  // 옆에 나란한 다른 차도가 있으면 {sg: 그쪽(-1/1), gap: 중심선 간격}, 없으면 null — 샘플 다수결
  const pairCache = new Map();
  const pairOf = (rid) => { if (rid < 0) return null; if (!pairCache.has(rid)) { const r = world.roads[rid]; pairCache.set(rid, pairSide(samples(r.pts), rid, r.w)); } return pairCache.get(rid); };
  function pairSide(S, rid, w) {
    const vote = { '-1': 0, 1: 0 };
    for (let i = 0; i < S.length; i += 2) for (const sg of [-1, 1]) {
      // 가장자리 밖 1.5·4·6.5m 를 찔러 봄 (가운데 분리대가 있어도 찾도록)
      if ([1.5, 4, 6.5].some((d) => { const [x, z] = at(S[i], sg * (w / 2 + d)); return inOther(x, z, rid, -1); })) vote[sg]++;
    }
    const n = Math.ceil(S.length / 2);
    const sg = vote[1] > n * 0.4 ? 1 : vote['-1'] > n * 0.4 ? -1 : 0;
    if (!sg) return null;
    // 짝 도로 중심선까지 거리 (중앙값) + 짝 도로 id (최빈값)
    const ds = [], ids = new Map();
    for (let i = 0; i < S.length; i += 2) {
      const p = S[i];
      let best = Infinity, bid = -1;
      for (const sgm of near(p.x, p.z)) {
        if (sgm.rid === rid) continue;
        const dx = sgm.b[0] - sgm.a[0], dz = sgm.b[1] - sgm.a[1], L = Math.hypot(dx, dz) || 1;
        if (Math.abs(dx * p.tx + dz * p.tz) < 0.94 * L) continue;
        const cr = ((p.x - sgm.a[0]) * dz - (p.z - sgm.a[1]) * dx) / L, t = ((p.x - sgm.a[0]) * dx + (p.z - sgm.a[1]) * dz) / (L * L);
        if (t < -0.05 || t > 1.05 || Math.abs(cr) > w * 1.6 || Math.abs(cr) >= best) continue;
        best = Math.abs(cr); bid = sgm.rid;
      }
      if (bid >= 0) { ds.push(best); ids.set(bid, (ids.get(bid) || 0) + 1); }
    }
    ds.sort((a, b) => a - b);
    const prid = [...ids].sort((a, b) => b[1] - a[1])[0]?.[0] ?? -1;
    return { sg, gap: ds.length ? ds[ds.length >> 1] : w, prid };
  }
  const onCross = (rid, s, half = 2.4) => (crossings.get(rid) || []).some((c) => Math.abs(c.s - s) < half);

  // ---- 차도 --------------------------------------------------------------
  const uvAsph = (x, z) => [x / 5, z / 5];
  for (const { r, rid } of cars) {
    const S = samples(r.pts), w = r.w, h = w / 2, trunk = r.hw === 'trunk';
    // 아스팔트 (지형 격자 2m 에 맞춰 가로도 나눔)
    ribbon(buf.asphalt, S, -h, h, 0.05, Math.max(1, Math.ceil(w / 2.5)), (p, o) => !inPlaza(...at(p, o)), uvAsph);
    // 중앙선: 넓은 길(공공도로)은 노란 복선, 교내 6m 길은 노란 단선
    const side = w >= 9 || trunk ? pairOf(rid) : null;
    // 짝끼리 서로 알아보면 id 가 작은 쪽만 노란 복선을 그림 (겹쳐 두 줄 되는 것 방지)
    const lineOwner = !side || !(pairOf(side.prid)?.prid === rid && rid > side.prid);
    const keepLine = (p, o) => { const [x, z] = at(p, o); return !inPlaza(x, z) && !inOther(x, z, rid, -0.5, side ? [p.tx, p.tz] : null) && !onCross(rid, p.s, 2.6) && !nearAnyCross(x, z); };
    if (w >= 9 || trunk) {
      // 왕복 분리 도로(방향별로 따로 그려진 길)면 짝 도로와의 한가운데에 노란 복선, 아니면 가운데
      const c = side ? side.sg * Math.min(h - 0.45, side.gap / 2) : 0;
      if (lineOwner) for (const sg of [-1, 1]) ribbon(buf.yellow, S, c + sg * 0.1, c + sg * 0.25, 0.075, 1, keepLine, () => [0, 0]);
      // 짝 도로가 있으면 가운데는 흰 차선(점선)
      if (side) ribbon(buf.white, S, -0.07, 0.07, 0.075, 1, (p, o) => keepLine(p, o) && (p.s % 9) < 4.5, () => [0, 0]);
    }
    else if (w >= 6 && r.hw !== 'living_street') ribbon(buf.yellow, S, -0.075, 0.075, 0.075, 1, keepLine, () => [0, 0]);
    if (trunk) continue; // 큰길은 아스팔트 + 중앙선만

    // 연석 (화강석, 15cm) — 교차로·횡단보도(턱 낮춤)에서 끊음
    const keepCurb = (p, o) => { const [x, z] = at(p, o); return !inPlaza(x, z) && !inOther(x, z, rid, -0.6) && !onCross(rid, p.s, 2.2); };
    for (const sg of [-1, 1]) curb(buf.curb, S, sg * (h - 0.02), sg * (h + 0.2), 0.05, 0.15, keepCurb);

    // 분홍 보행띠: 교내 도로 가장자리 (6m 이상 양쪽, 좁은 길은 한쪽)
    if (CAMPUS.has(r.hw)) {
      const pw = w >= 6 ? 1.2 : 1.0, sides = w >= 6 ? [-1, 1] : [1];
      const keepPink = (p, o) => { const [x, z] = at(p, o); return !inPlaza(x, z) && !inOther(x, z, rid, -0.3) && !onCross(rid, p.s, 2.2); };
      for (const sg of sides) {
        ribbon(buf.pink, S, sg * (h - 0.02), sg * (h - 0.02 - pw), 0.065, 1, keepPink, (x, z) => [x / 1.6, z / 1.6]);
        // 보행띠와 차로 사이 흰 경계선
        ribbon(buf.white, S, sg * (h - 0.02 - pw), sg * (h - 0.14 - pw), 0.075, 1, keepPink, () => [0, 0]);
      }
    }

    // 횡단보도: 흰 줄무늬(차량 진행 방향으로 긴 막대, 길 폭을 가로질러 반복) + 양끝 점형 점자블록
    for (const c of crossings.get(rid) || []) {
      const nx = -c.tz, nz = c.tx, bandL = 3.2, barW = 0.5, gap = 0.5;
      const span = w - 0.8, nb = Math.max(2, Math.floor((span + gap) / (barW + gap)));
      const start = -((nb * barW + (nb - 1) * gap) / 2);
      for (let k = 0; k < nb; k++) {
        const o0 = start + k * (barW + gap);
        flatRect(buf.white, c.x, c.z, c.tx, c.tz, nx, nz, -bandL / 2, bandL / 2, o0, o0 + barW, 0.075, 2, () => [0, 0]);
      }
      for (const sg of [-1, 1]) {
        // 30cm 폭 두 줄 (텍스처 오른쪽 절반 = 점형이 한 칸씩 맞도록)
        for (const d of [0.35, 0.65]) {
          const o0 = Math.min(sg * (h + d), sg * (h + d + 0.3));
          const px = c.x + nx * (o0 + 0.15), pz = c.z + nz * (o0 + 0.15);
          if (inOther(px, pz, rid, -0.5) || inPlaza(px, pz)) continue; // 붙은 차도 위에는 깔지 않음
          flatRect(buf.tactile, c.x, c.z, c.tx, c.tz, nx, nz, -1.5, 1.5, o0, o0 + 0.3, 0.06, 2,
            (a, o) => [0.5 + 0.5 * ((o - o0) / 0.3), (a + 1.5) / 0.3]);
        }
      }
    }
  }

  // 평평한 사각형 패치 (a: 길이 방향 a0..a1, o: 가로 o0..o1), 길이 방향으로 n 칸
  function flatRect(B, cx, cz, tx, tz, nx, nz, a0, a1, o0, o1, lift, n, uvf) {
    const P = (a, o) => { const x = cx + tx * a + nx * o, z = cz + tz * a + nz * o; return V(x, heightAt(x, z) + lift, z); };
    for (let k = 0; k < n; k++) {
      const aa = a0 + ((a1 - a0) * k) / n, ab = a0 + ((a1 - a0) * (k + 1)) / n;
      quad(B, P(aa, o0), P(aa, o1), P(ab, o0), P(ab, o1), uvf(aa, o0), uvf(aa, o1), uvf(ab, o0), uvf(ab, o1), UP);
    }
  }

  // ---- 보도 점자블록 (선형 유도블록, 노란색) ------------------------------
  for (const f of world.roads) {
    if (f.kind === 'road' || (f.hw !== 'footway' && f.hw !== 'pedestrian')) continue;
    const S = samples(f.pts, 3);
    const o = f.hw === 'pedestrian' ? -(f.w / 2 - 0.9) : 0;
    const keep = (p, oo) => { const [x, z] = at(p, oo); return !inPlaza(x, z) && !inZonePlaza(x, z) && !inOther(x, z, -1, -0.4); };
    ribbon(buf.tactile, S, o - 0.15, o + 0.15, 0.06, 1, keep, (x, z, s, u) => [u * 0.5, s / 0.3]);
  }

  // ---- 메시 만들기 --------------------------------------------------------
  let tris = 0;
  for (const [k, B] of Object.entries(buf)) {
    if (!B.p.length) continue;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(B.p, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(B.n, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(B.u, 2));
    g.computeBoundingSphere();
    tris += B.p.length / 9;
    const m = new THREE.Mesh(g, M[k]);
    m.receiveShadow = true;
    m.castShadow = k === 'curb';
    m.name = 'roads-' + k;
    group.add(m);
  }
  const nc = [...crossings.values()].reduce((a, l) => a + l.length, 0);
  console.log(`zone roads: 삼각형 ${tris}, 횡단보도 ${nc}, 재질 ${group.children.length}, ${Math.round(performance.now() - T0)}ms`);
  return { group, merge: true, occlude: false };
}

// 점자블록 캔버스: 왼쪽 절반 = 선형(유도), 오른쪽 절반 = 점형(경고) — 한 칸 30cm
function tactileTex(THREE) {
  const c = document.createElement('canvas'); c.width = 128; c.height = 64;
  const g = c.getContext('2d');
  g.fillStyle = '#d9a514'; g.fillRect(0, 0, 128, 64);
  g.strokeStyle = 'rgba(90,60,0,.55)'; g.lineWidth = 1; g.strokeRect(0.5, 0.5, 63, 63); g.strokeRect(64.5, 0.5, 63, 63);
  // 선형: 길이 방향 돌기 4줄
  for (let k = 0; k < 4; k++) {
    const x = 8 + k * 14;
    g.fillStyle = 'rgba(120,80,0,.5)'; g.fillRect(x + 2, 6, 6, 54);
    g.fillStyle = '#f4c534'; g.fillRect(x, 4, 6, 54);
  }
  // 점형: 5x5 점
  for (let i = 0; i < 5; i++) for (let j = 0; j < 5; j++) {
    const x = 64 + 8 + i * 12, y = 8 + j * 12;
    g.fillStyle = 'rgba(120,80,0,.5)'; g.beginPath(); g.arc(x + 1.5, y + 1.5, 3.6, 0, 7); g.fill();
    g.fillStyle = '#f6c838'; g.beginPath(); g.arc(x, y, 3.6, 0, 7); g.fill();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 4;
  return t;
}
