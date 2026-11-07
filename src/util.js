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

export function pointInPoly(x, z, pts) {
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [xi, zi] = pts[i], [xj, zj] = pts[j];
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
