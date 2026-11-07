// 조각용 SDF(부호 거리 함수) 도구 — 점토처럼 매끈하게 이어지는 형태를 만든다
import * as THREE from 'three';
import { MarchingCubes } from 'three/examples/jsm/objects/MarchingCubes.js';

// ---- 기본 도형 (p: [x,y,z])
export const sphere = (p, c, r) => Math.hypot(p[0] - c[0], p[1] - c[1], p[2] - c[2]) - r;
export function ellipsoid(p, c, r) {
  const x = (p[0] - c[0]) / r[0], y = (p[1] - c[1]) / r[1], z = (p[2] - c[2]) / r[2];
  const k0 = Math.hypot(x, y, z);
  const k1 = Math.hypot(x / r[0], y / r[1], z / r[2]);
  return k1 === 0 ? -Math.min(...r) : (k0 * (k0 - 1)) / k1;
}
// 굵기가 a→b로 변하는 캡슐
export function capsule(p, a, b, ra, rb = ra) {
  const pax = p[0] - a[0], pay = p[1] - a[1], paz = p[2] - a[2];
  const bax = b[0] - a[0], bay = b[1] - a[1], baz = b[2] - a[2];
  const h = Math.max(0, Math.min(1, (pax * bax + pay * bay + paz * baz) / (bax * bax + bay * bay + baz * baz)));
  return Math.hypot(pax - bax * h, pay - bay * h, paz - baz * h) - (ra + (rb - ra) * h);
}
export function box(p, c, half, round = 0) {
  const qx = Math.abs(p[0] - c[0]) - half[0] + round, qy = Math.abs(p[1] - c[1]) - half[1] + round, qz = Math.abs(p[2] - c[2]) - half[2] + round;
  return Math.hypot(Math.max(qx, 0), Math.max(qy, 0), Math.max(qz, 0)) + Math.min(Math.max(qx, qy, qz), 0) - round;
}
// 부드러운 합치기·빼기
export function smin(a, b, k) {
  const h = Math.max(k - Math.abs(a - b), 0) / k;
  return Math.min(a, b) - h * h * k * 0.25;
}
export function smax(a, b, k) { return -smin(-a, -b, k); }

// ---- 노이즈 (돌 깎은 질감·갈기)
function hash3(x, y, z) {
  let h = x * 374761393 + y * 668265263 + z * 2147483647;
  h = (h ^ (h >>> 13)) * 1274126177;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
}
export function noise3(x, y, z) {
  const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z);
  const xf = x - xi, yf = y - yi, zf = z - zi;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf), w = zf * zf * (3 - 2 * zf);
  const L = (a, b, t) => a + (b - a) * t;
  return L(
    L(L(hash3(xi, yi, zi), hash3(xi + 1, yi, zi), u), L(hash3(xi, yi + 1, zi), hash3(xi + 1, yi + 1, zi), u), v),
    L(L(hash3(xi, yi, zi + 1), hash3(xi + 1, yi, zi + 1), u), L(hash3(xi, yi + 1, zi + 1), hash3(xi + 1, yi + 1, zi + 1), u), v),
    w
  ) * 2 - 1;
}
export function fbm(x, y, z, oct = 4) {
  let s = 0, a = 0.5, f = 1;
  for (let i = 0; i < oct; i++) { s += a * noise3(x * f, y * f, z * f); a *= 0.5; f *= 2.03; }
  return s;
}

// ---- SDF → 메시 (마칭큐브)
// sdf(p) 를 정육면체 [center ± half] 안에서 샘플링
export function polygonize(sdf, { center = [0, 0, 0], half = 1, res = 96, maxPoly = 200000 } = {}) {
  const mc = new MarchingCubes(res, new THREE.MeshBasicMaterial(), false, false, maxPoly);
  mc.isolation = 0;
  const f = mc.field, n = res, h = n / 2;
  const p = [0, 0, 0];
  for (let z = 0; z < n; z++)
    for (let y = 0; y < n; y++)
      for (let x = 0; x < n; x++) {
        p[0] = center[0] + ((x - h) / h) * half;
        p[1] = center[1] + ((y - h) / h) * half;
        p[2] = center[2] + ((z - h) / h) * half;
        f[x + y * n + z * n * n] = -sdf(p);
      }
  mc.update();
  const count = mc.count;
  const pos = mc.geometry.getAttribute('position').array.slice(0, count * 3);
  const nor = mc.geometry.getAttribute('normal').array.slice(0, count * 3);
  for (let i = 0; i < pos.length; i += 3) {
    pos[i] = center[0] + pos[i] * half;
    pos[i + 1] = center[1] + pos[i + 1] * half;
    pos[i + 2] = center[2] + pos[i + 2] * half;
  }
  mc.geometry.dispose();
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array((pos.length / 3) * 2), 2));
  g.computeBoundingSphere();
  return g;
}

// ---- 돌 재질 (UV 없이 세 방향 투영 = 트라이플래너)
export function stoneMaterial(map, { color = 0xd9d4cc, roughness = 0.92, scale = 0.6, contrast = 0.45 } = {}) {
  const m = new THREE.MeshStandardMaterial({ color, roughness, metalness: 0, map });
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uTriScale = { value: scale };
    sh.uniforms.uContrast = { value: contrast };
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vTriPos;\nvarying vec3 vTriNor;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvTriPos = (modelMatrix * vec4(position,1.0)).xyz;\nvTriNor = normalize(mat3(modelMatrix) * normal);');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vTriPos;\nvarying vec3 vTriNor;\nuniform float uTriScale;\nuniform float uContrast;')
      .replace('#include <map_fragment>', `
        vec3 bw = pow(abs(vTriNor), vec3(4.0)); bw /= (bw.x + bw.y + bw.z);
        vec3 tp = vTriPos * uTriScale;
        vec4 tc = texture2D(map, tp.yz) * bw.x + texture2D(map, tp.xz) * bw.y + texture2D(map, tp.xy) * bw.z;
        // 텍스처는 얼룩(반점)만 쓰고 밝기는 재질 색으로
        float lum = dot(tc.rgb, vec3(0.299, 0.587, 0.114));
        diffuseColor.rgb *= mix(vec3(1.0), vec3(lum / 0.5), uContrast);`);
  };
  // map 정의를 유지시키기 위해 uv 없는 지오메트리에서도 USE_MAP 사용
  return m;
}
