import * as THREE from 'three';

// 결정적 난수 (같은 결과가 매번 나오도록)
export function rng(seed = 1) {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13; s >>>= 0;
    s ^= s >>> 17;
    s ^= s << 5; s >>>= 0;
    return s / 4294967296;
  };
}
export const hash = (n) => {
  let x = Math.sin(n * 127.1) * 43758.5453;
  return x - Math.floor(x);
};

// 지형 높이 (bilinear)
export function makeHeightFn(t) {
  const { step, w, h, minX, minZ, data } = t;
  return (x, z) => {
    const fx = (x - minX) / step, fz = (z - minZ) / step;
    const i = Math.max(0, Math.min(w - 2, Math.floor(fx)));
    const j = Math.max(0, Math.min(h - 2, Math.floor(fz)));
    const tx = Math.max(0, Math.min(1, fx - i)), tz = Math.max(0, Math.min(1, fz - j));
    const a = data[j * w + i], b = data[j * w + i + 1], c = data[(j + 1) * w + i], d = data[(j + 1) * w + i + 1];
    return (a * (1 - tx) + b * tx) * (1 - tz) + (c * (1 - tx) + d * tx) * tz;
  };
}

// 다각형마다 경계 상자를 한 번만 계산해 두고 먼저 거른다 (나무 배치 등에서 수십만 번 불림)
const _bb = new WeakMap();
export function pointInPoly(x, z, pts) {
  let b = _bb.get(pts);
  if (!b) {
    b = [Infinity, Infinity, -Infinity, -Infinity];
    for (const [px, pz] of pts) { if (px < b[0]) b[0] = px; if (pz < b[1]) b[1] = pz; if (px > b[2]) b[2] = px; if (pz > b[3]) b[3] = pz; }
    _bb.set(pts, b);
  }
  if (x < b[0] || x > b[2] || z < b[1] || z > b[3]) return false;
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const xi = pts[i][0], zi = pts[i][1], xj = pts[j][0], zj = pts[j][1];
    if (zi > z !== zj > z && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) inside = !inside;
  }
  return inside;
}

export function polyArea(pts) {
  let a = 0;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) a += (pts[j][0] + pts[i][0]) * (pts[j][1] - pts[i][1]);
  return Math.abs(a / 2);
}

export function bbox(pts) {
  let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity;
  for (const [x, z] of pts) { x0 = Math.min(x0, x); z0 = Math.min(z0, z); x1 = Math.max(x1, x); z1 = Math.max(z1, z); }
  return { x0, z0, x1, z1 };
}

// 폴리곤 공간 색인 (충돌·배치 검사용)
export class PolyIndex {
  constructor(cell = 24) { this.cell = cell; this.map = new Map(); this.items = []; }
  key(i, j) { return i * 100003 + j; }
  add(pts, data = null) {
    const b = bbox(pts);
    const item = { pts, b, data };
    this.items.push(item);
    for (let i = Math.floor(b.x0 / this.cell); i <= Math.floor(b.x1 / this.cell); i++)
      for (let j = Math.floor(b.z0 / this.cell); j <= Math.floor(b.z1 / this.cell); j++) {
        const k = this.key(i, j);
        if (!this.map.has(k)) this.map.set(k, []);
        this.map.get(k).push(item);
      }
  }
  hit(x, z, pad = 0) {
    const list = this.map.get(this.key(Math.floor(x / this.cell), Math.floor(z / this.cell)));
    if (!list) return null;
    for (const it of list) {
      if (x < it.b.x0 - pad || x > it.b.x1 + pad || z < it.b.z0 - pad || z > it.b.z1 + pad) continue;
      if (pointInPoly(x, z, it.pts)) return it;
      if (pad > 0 && (pointInPoly(x + pad, z, it.pts) || pointInPoly(x - pad, z, it.pts) || pointInPoly(x, z + pad, it.pts) || pointInPoly(x, z - pad, it.pts))) return it;
    }
    return null;
  }
}

// 선분 색인 (길 근처인지)
export class SegIndex {
  constructor(cell = 20) { this.cell = cell; this.map = new Map(); }
  add(a, b, w) {
    const x0 = Math.min(a[0], b[0]) - w, x1 = Math.max(a[0], b[0]) + w, z0 = Math.min(a[1], b[1]) - w, z1 = Math.max(a[1], b[1]) + w;
    for (let i = Math.floor(x0 / this.cell); i <= Math.floor(x1 / this.cell); i++)
      for (let j = Math.floor(z0 / this.cell); j <= Math.floor(z1 / this.cell); j++) {
        const k = i * 100003 + j;
        if (!this.map.has(k)) this.map.set(k, []);
        this.map.get(k).push({ a, b, w });
      }
  }
  near(x, z, extra = 0) {
    const list = this.map.get(Math.floor(x / this.cell) * 100003 + Math.floor(z / this.cell));
    if (!list) return false;
    for (const s of list) {
      const dx = s.b[0] - s.a[0], dz = s.b[1] - s.a[1];
      const L = dx * dx + dz * dz || 1;
      const t = Math.max(0, Math.min(1, ((x - s.a[0]) * dx + (z - s.a[1]) * dz) / L));
      const px = s.a[0] + dx * t - x, pz = s.a[1] + dz * t - z;
      if (px * px + pz * pz < (s.w / 2 + extra) ** 2) return true;
    }
    return false;
  }
}

// 텍스처 로딩
const loader = new THREE.TextureLoader();
export function loadTex(url, { srgb = true, repeat = 1, aniso = 8 } = {}) {
  return new Promise((res, rej) =>
    loader.load(url, (t) => {
      t.wrapS = t.wrapT = THREE.RepeatWrapping;
      t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
      t.repeat.set(repeat, repeat);
      t.anisotropy = aniso;
      res(t);
    }, undefined, rej)
  );
}
export function loadImage(url) {
  return new Promise((res, rej) => { const im = new Image(); im.onload = () => res(im); im.onerror = rej; im.src = url; });
}

// 성능: 움직이지 않는 메시들을 재질별로 하나로 합친다 (그리기 호출 수 줄이기)
// 다중 재질·인스턴스·CSS 라벨 등 합칠 수 없는 것은 그대로 둔다
export function mergeStatic(root, mergeGeometries) {
  root.updateMatrixWorld(true);
  const inv = root.matrixWorld.clone().invert();
  const buckets = new Map(), victims = [];
  root.traverse((o) => {
    if (!o.isMesh || o.isInstancedMesh || o.isSkinnedMesh || Array.isArray(o.material) || o.morphTargetInfluences) return;
    const g = o.geometry;
    const key = [o.material.uuid, o.castShadow, o.receiveShadow, o.renderOrder, Object.keys(g.attributes).sort().join()].join('|');
    if (!buckets.has(key)) buckets.set(key, { mat: o.material, cast: o.castShadow, recv: o.receiveShadow, order: o.renderOrder, items: [] });
    buckets.get(key).items.push(o);
  });
  let before = 0, after = 0;
  for (const b of buckets.values()) {
    before += b.items.length;
    if (b.items.length < 2) { after++; continue; }
    const geos = b.items.map((o) => {
      let g = o.geometry.index ? o.geometry.toNonIndexed() : o.geometry.clone();
      for (const n of Object.keys(g.morphAttributes)) delete g.morphAttributes[n];
      return g.applyMatrix4(inv.clone().multiply(o.matrixWorld));
    });
    const merged = mergeGeometries(geos);
    if (!merged) { after += b.items.length; continue; }
    const m = new (b.items[0].constructor)(merged, b.mat);
    Object.assign(m, { castShadow: b.cast, receiveShadow: b.recv, renderOrder: b.order });
    root.add(m);
    victims.push(...b.items);
    after++;
  }
  for (const o of victims) o.removeFromParent();
  return { before, after };
}
