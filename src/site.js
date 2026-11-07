import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { loadTex } from './util.js';

// 국토지리정보원 수치지도의 옹벽·석축(상단선 + 높이)과 계단 면을 3D로 세운다.
// 지형 격자(2m, 등고선 보간)는 수직 단차를 뭉개므로, 선 양쪽 지면을 재서 그 사이를 벽으로 채운다.

async function pbr(name, repeat = 1, extra = {}) {
  const [map, normalMap, roughnessMap] = await Promise.all([
    loadTex(`/tex/${name}_diff.jpg`),
    loadTex(`/tex/${name}_nor.jpg`, { srgb: false }),
    loadTex(`/tex/${name}_rough.jpg`, { srgb: false }),
  ]);
  for (const t of [map, normalMap, roughnessMap]) t.repeat.set(repeat, repeat);
  return new THREE.MeshStandardMaterial({ map, normalMap, roughnessMap, roughness: 1, ...extra });
}

// 폴리라인 → 두께 있는 벽 (윗면·양옆), uv = (길이 m, 높이 m)
function wallGeometry(pts, heightAt, h, thick = 0.4) {
  const P = [], N = [], U = [], I = [];
  let dist = 0;
  const cols = [];
  for (let i = 0; i < pts.length; i++) {
    const a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)];
    let tx = b[0] - a[0], tz = b[1] - a[1];
    const L = Math.hypot(tx, tz) || 1; tx /= L; tz /= L;
    const nx = -tz, nz = tx; // 선의 왼쪽
    const d = Math.max(1.5, Math.min(4, h));
    const hA = heightAt(pts[i][0] + nx * d, pts[i][1] + nz * d), hB = heightAt(pts[i][0] - nx * d, pts[i][1] - nz * d), h0 = heightAt(pts[i][0], pts[i][1]);
    let top = Math.max(hA, hB, h0) + 0.25, bot = Math.min(hA, hB, h0) - 0.4;
    // 지형에 단차가 거의 없으면 낮은 경계벽(화단·난간벽)으로
    if (top - bot < 0.9) { top = h0 + Math.min(0.8, h * 0.5); bot = h0 - 0.3; }
    if (i > 0) dist += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
    cols.push({ x: pts[i][0], z: pts[i][1], nx, nz, top, bot, dist });
  }
  const quad = (a, b, c, d) => { const k = P.length / 3; I.push(k, k + 1, k + 2, k, k + 2, k + 3); for (const v of [a, b, c, d]) { P.push(v.p[0], v.p[1], v.p[2]); U.push(v.u[0], v.u[1]); } };
  for (let i = 1; i < cols.length; i++) {
    const c0 = cols[i - 1], c1 = cols[i];
    for (const s of [1, -1]) {
      const o0 = [c0.x + c0.nx * thick * 0.5 * s, c0.z + c0.nz * thick * 0.5 * s], o1 = [c1.x + c1.nx * thick * 0.5 * s, c1.z + c1.nz * thick * 0.5 * s];
      const v = (o, y, d, yb) => ({ p: [o[0], y, o[1]], u: [d, y - yb] });
      const f = [v(o0, c0.bot, c0.dist, c0.bot), v(o1, c1.bot, c1.dist, c0.bot), v(o1, c1.top, c1.dist, c0.bot), v(o0, c0.top, c0.dist, c0.bot)];
      quad(...(s > 0 ? f : f.reverse()));
    }
    const t = (c, s) => ({ p: [c.x + c.nx * thick * 0.5 * s, c.top, c.z + c.nz * thick * 0.5 * s], u: [c.dist, s * 0.2] });
    quad(t(c0, -1), t(c1, -1), t(c1, 1), t(c0, 1));
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(U, 2));
  g.setIndex(I);
  g.computeVertexNormals();
  return g;
}

// 계단 면 → 경사 방향으로 단을 쌓은 상자들
function stairGeometry(poly, heightAt, rise = 0.16) {
  const hs = poly.map(([x, z]) => heightAt(x, z));
  const cx = poly.reduce((a, p) => a + p[0], 0) / poly.length, cz = poly.reduce((a, p) => a + p[1], 0) / poly.length;
  // 경사 방향: 꼭짓점 높이로 평면 맞추기 (최소제곱)
  let sxx = 0, sxz = 0, szz = 0, sxh = 0, szh = 0;
  const hm = hs.reduce((a, b) => a + b, 0) / hs.length;
  poly.forEach(([x, z], i) => { const dx = x - cx, dz = z - cz, dh = hs[i] - hm; sxx += dx * dx; sxz += dx * dz; szz += dz * dz; sxh += dx * dh; szh += dz * dh; });
  const det = sxx * szz - sxz * sxz || 1;
  let gx = (sxh * szz - szh * sxz) / det, gz = (szh * sxx - sxh * sxz) / det;
  const gl = Math.hypot(gx, gz);
  const hmin = Math.min(...hs), hmax = Math.max(...hs);
  if (gl < 1e-3 || hmax - hmin < 0.25) return null; // 거의 평평 → 계단으로 안 만듦
  gx /= gl; gz /= gl;
  const px = -gz, pz = gx;
  const S = poly.map(([x, z]) => (x - cx) * gx + (z - cz) * gz), T = poly.map(([x, z]) => (x - cx) * px + (z - cz) * pz);
  const s0 = Math.min(...S), s1 = Math.max(...S), t0 = Math.min(...T), t1 = Math.max(...T);
  const n = Math.max(2, Math.min(80, Math.round((hmax - hmin) / rise)));
  const parts = [];
  const ang = Math.atan2(gx, gz);
  for (let k = 0; k < n; k++) {
    const a = s0 + ((s1 - s0) * k) / n, b = s0 + ((s1 - s0) * (k + 1)) / n;
    const top = hmin + ((hmax - hmin) * (k + 1)) / n, bot = hmin - 0.6;
    const box = new THREE.BoxGeometry(t1 - t0, top - bot, b - a + 0.02);
    box.rotateY(ang);
    const mid = (a + b) / 2, tm = (t0 + t1) / 2;
    box.translate(cx + gx * mid + px * tm, (top + bot) / 2, cz + gz * mid + pz * tm);
    parts.push(box);
  }
  return mergeGeometries(parts);
}

export async function makeSite(world, heightAt) {
  const [stone, conc, granite] = await Promise.all([
    pbr('stoneblock', 1 / 2.5, { color: 0xd8d0c0 }),
    pbr('concwall', 1 / 3, { color: 0xc9c4ba }),
    pbr('granite', 1 / 1.2, { color: 0xd9d4ca }),
  ]);
  const group = new THREE.Group();
  group.name = 'site';
  const stoneG = [], concG = [];
  for (const w of world.retaining || []) {
    const g = wallGeometry(w.pts, heightAt, w.h);
    (w.kind === '석축' || w.mat === '석축' || w.mat === '자연석' ? stoneG : concG).push(g);
  }
  for (const [list, mat] of [[stoneG, stone], [concG, conc]]) {
    if (!list.length) continue;
    const m = new THREE.Mesh(mergeGeometries(list), mat);
    m.castShadow = m.receiveShadow = true;
    group.add(m);
  }
  const st = (world.stairs || []).map((s) => stairGeometry(s.pts, heightAt)).filter(Boolean);
  if (st.length) {
    const m = new THREE.Mesh(mergeGeometries(st.map((g) => g.toNonIndexed())), granite);
    m.castShadow = m.receiveShadow = true;
    group.add(m);
  }
  return { group, walls: (world.retaining || []).length, stairs: st.length };
}
