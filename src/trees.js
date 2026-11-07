import * as THREE from 'three';
import { loadTex, rng, pointInPoly, bbox } from './util.js';

// ───────── 수종 (봄, 4월 초) ─────────
//  broad   : 숲·건물 둘레 활엽수(참나무·단풍 섞임) — 새잎 연두
//  zelkova : 느티나무 가로수(왕십리로 등) — 꽃병 모양, 연초록
//  ginkgo  : 은행나무 가로수(살곶이길·사근동) — 곧은 원뿔, 막 돋은 노란연두 잎이라 성김
//  cherry  : 왕벚나무(본관 북쪽 길·백남학술정보관 길가) — 분홍 꽃
//  pine    : 소나무(건물 둘레·비탈 숲) — 굽은 붉은 줄기, 납작한 짙은 초록 잎층
const PAL = {
  broad: ['#86b94a', '#97c757', '#7aad42', '#a6d166', '#6f9f3c', '#8fbf4c'],
  zelkova: ['#7cb244', '#8cc152', '#6fa63c', '#99ca5c', '#82b84a'],
  ginkgo: ['#b8d467', '#c7de7a', '#a8c95a', '#d2e38d'],
  cherry: ['#ffffff', '#fff3f6', '#f7e6ec', '#ffeef3', '#f2dde4'],
  pine: ['#3a6a32', '#2f5a2c', '#447239', '#35612f', '#4d7a3e'],
};
const BARK = { broad: '#8a7a6a', zelkova: '#9a8e80', ginkgo: '#7f7467', cherry: '#6a5550', pine: '#a0705a' };

// ───────── 텍스처 아틀라스 (재질 하나 → 수종·칸마다 그리기 호출 1번) ─────────
// 1024×1024 캔버스: [잎 덩어리 | 벚꽃 덩어리] / [솔잎 덩어리 | 은행 새순 | 나무껍질]
const AW = 1024;
const RECT = {
  leaf: [0, 0, 512, 512],
  cherry: [512, 0, 512, 512],
  pine: [0, 512, 512, 512],
  ginkgo: [512, 512, 256, 512],
  bark: [768, 512, 256, 512],
};
// 캔버스 픽셀 사각형 → UV (flipY: 캔버스 위쪽 = v 1)
const uvOf = ([x, y, w, h], pad = 0) => [(x + pad) / AW, 1 - (y + h - pad) / AW, (x + w - pad) / AW, 1 - (y + pad) / AW];

function makeAtlas(barkImg) {
  const c = document.createElement('canvas');
  c.width = c.height = AW;
  const g = c.getContext('2d');
  const R = rng(777);
  const gray = (lo, hi) => { const v = Math.round(lo + R() * (hi - lo)); return `rgb(${v},${v},${v})`; };

  // 잎 하나 (끝이 뾰족한 달걀꼴 + 잎맥)
  const leaf = (x, y, ang, L, W, fill) => {
    g.save(); g.translate(x, y); g.rotate(ang);
    g.fillStyle = fill;
    g.beginPath();
    g.moveTo(0, 0);
    g.bezierCurveTo(W * 0.9, L * 0.15, W * 0.7, L * 0.75, 0, L);
    g.bezierCurveTo(-W * 0.7, L * 0.75, -W * 0.9, L * 0.15, 0, 0);
    g.fill();
    g.strokeStyle = 'rgba(0,0,0,0.18)'; g.lineWidth = 1.2;
    g.beginPath(); g.moveTo(0, L * 0.05); g.lineTo(0, L * 0.85); g.stroke();
    g.restore();
  };
  // 잔가지 + 잔잎이 많이 달린 덩어리 (가장자리가 들쭉날쭉하도록)
  {
    const [x0, y0, w] = RECT.leaf, cx = x0 + w / 2, cy = y0 + w / 2;
    g.strokeStyle = 'rgb(70,60,50)'; g.lineCap = 'round';
    const twigs = [];
    for (let i = 0; i < 9; i++) {
      const a = (i / 9) * Math.PI * 2 + R() * 0.5, L = 150 + R() * 70;
      twigs.push([a, L]);
      g.lineWidth = 3;
      g.beginPath(); g.moveTo(cx, cy); g.lineTo(cx + Math.cos(a) * L, cy + Math.sin(a) * L); g.stroke();
    }
    // 바깥쪽부터 → 안쪽 잎이 위에 겹쳐 안쪽이 촘촘
    for (let pass = 0; pass < 2; pass++) for (const [a, L] of twigs) {
      for (let t = 0.25; t < 1.05; t += 0.085) {
        const bx = cx + Math.cos(a) * L * t, by = cy + Math.sin(a) * L * t;
        for (const side of [-1, 1]) {
          if (R() < 0.15) continue;
          const la = a - Math.PI / 2 + side * (0.6 + R() * 0.5) + (pass ? 0.4 : 0);
          leaf(bx, by, la, 34 + R() * 20, 15 + R() * 7, gray(150, 255));
        }
      }
      leaf(cx + Math.cos(a) * L, cy + Math.sin(a) * L, a - Math.PI / 2, 40, 17, gray(170, 255));
    }
    // 빈틈 채우기
    for (let k = 0; k < 40; k++) {
      const a = R() * Math.PI * 2, r = Math.sqrt(R()) * 150;
      leaf(cx + Math.cos(a) * r, cy + Math.sin(a) * r, R() * 6.28, 30 + R() * 16, 14 + R() * 6, gray(130, 235));
    }
  }
  // 벚꽃: 다섯 잎 꽃 수백 송이 + 꽃받침·어린 잎 약간 (색 그대로 그림, 정점색은 거의 흰색)
  {
    const [x0, y0, w] = RECT.cherry, cx = x0 + w / 2, cy = y0 + w / 2;
    g.strokeStyle = 'rgb(75,52,48)'; g.lineCap = 'round';
    const tips = [];
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2 + R() * 0.4, L = 140 + R() * 80;
      g.lineWidth = 4;
      g.beginPath(); g.moveTo(cx, cy);
      const mx = cx + Math.cos(a + 0.2) * L * 0.5, my = cy + Math.sin(a + 0.2) * L * 0.5;
      g.quadraticCurveTo(mx, my, cx + Math.cos(a) * L, cy + Math.sin(a) * L); g.stroke();
      tips.push([a, L]);
    }
    const flower = (x, y, r, col) => {
      g.fillStyle = col;
      const rot = R() * 6.28;
      for (let p = 0; p < 5; p++) {
        const a = rot + (p / 5) * Math.PI * 2;
        g.beginPath(); g.ellipse(x + Math.cos(a) * r * 0.55, y + Math.sin(a) * r * 0.55, r * 0.55, r * 0.42, a, 0, Math.PI * 2); g.fill();
      }
      g.fillStyle = 'rgb(214,92,128)';
      g.beginPath(); g.arc(x, y, r * 0.22, 0, Math.PI * 2); g.fill();
    };
    const pinks = ['rgb(255,236,242)', 'rgb(255,222,232)', 'rgb(252,206,220)', 'rgb(255,246,248)', 'rgb(246,196,212)'];
    for (const [a, L] of tips) for (let k = 0; k < 18; k++) {
      const t = 0.3 + R() * 0.75, s = (R() - 0.5) * 70;
      const x = cx + Math.cos(a) * L * t - Math.sin(a) * s, y = cy + Math.sin(a) * L * t + Math.cos(a) * s;
      if (R() < 0.18) leaf(x, y, R() * 6.28, 16, 8, 'rgb(150,170,90)');
      flower(x, y, 11 + R() * 6, pinks[Math.floor(R() * pinks.length)]);
    }
    for (let k = 0; k < 90; k++) {
      const a = R() * Math.PI * 2, r = Math.sqrt(R()) * 165;
      flower(cx + Math.cos(a) * r, cy + Math.sin(a) * r, 10 + R() * 6, pinks[Math.floor(R() * pinks.length)]);
    }
  }
  // 솔잎 다발: 잔가지에서 바늘잎이 부채꼴로 (위에서 볼 때 둥근 덩어리)
  {
    const [x0, y0, w] = RECT.pine, cx = x0 + w / 2, cy = y0 + w / 2;
    g.lineCap = 'round';
    for (let b = 0; b < 46; b++) {
      const a = R() * Math.PI * 2, r = Math.sqrt(R()) * 165;
      const bx = cx + Math.cos(a) * r, by = cy + Math.sin(a) * r;
      const dir = a + (R() - 0.5) * 0.8;
      for (let n = 0; n < 26; n++) {
        const na = dir + (R() - 0.5) * 2.4, L = 30 + R() * 34;
        g.strokeStyle = gray(120, 255); g.lineWidth = 2.2;
        g.beginPath(); g.moveTo(bx, by); g.lineTo(bx + Math.cos(na) * L, by + Math.sin(na) * L); g.stroke();
      }
    }
  }
  // 은행 새순: 회색 잔가지에 작은 부채꼴 잎이 드문드문 (4월 초라 성김)
  {
    const [x0, y0, w, h] = RECT.ginkgo, cx = x0 + w / 2, cy = y0 + h / 2;
    g.lineCap = 'round';
    const fan = (x, y, ang, r) => {
      g.fillStyle = gray(170, 255);
      g.beginPath(); g.moveTo(x, y); g.arc(x, y, r, ang - 0.7, ang + 0.7); g.closePath(); g.fill();
    };
    for (let i = 0; i < 7; i++) {
      const sx = cx + (R() - 0.5) * 60, sy = y0 + 60 + i * 62;
      const a = (i % 2 ? 0.15 : Math.PI - 0.15) + (R() - 0.5) * 0.4, L = 70 + R() * 40;
      g.strokeStyle = 'rgb(95,88,80)'; g.lineWidth = 3;
      const ex = sx + Math.cos(a) * L, ey = sy - Math.abs(Math.sin(a)) * 20 - 10;
      g.beginPath(); g.moveTo(sx, sy); g.lineTo(ex, ey); g.stroke();
      for (let k = 0; k < 7; k++) {
        const t = 0.2 + R() * 0.85, px = sx + (ex - sx) * t, py = sy + (ey - sy) * t;
        for (let f = 0; f < 3; f++) fan(px + (R() - 0.5) * 8, py, -Math.PI / 2 + (R() - 0.5) * 1.6, 11 + R() * 7);
      }
    }
  }
  // 나무껍질 (불투명)
  {
    const [x, y, w, h] = RECT.bark;
    if (barkImg) g.drawImage(barkImg, x, y, w, h);
    else { g.fillStyle = '#777'; g.fillRect(x, y, w, h); }
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

// ───────── 지오메트리 조립기 (위치·노멀·UV·색 직접 쌓기) ─────────
class Builder {
  constructor() { this.p = []; this.n = []; this.uv = []; this.c = []; this.idx = []; }
  get count() { return this.p.length / 3; }
  // 줄기·가지: 점 열(중심선)을 따라 원통 고리, UV 는 껍질 영역
  limb(path, radii, radial, color) {
    const [u0, v0, u1, v1] = uvOf(RECT.bark, 6);
    const base = this.count, col = new THREE.Color(color);
    const up = new THREE.Vector3(), side = new THREE.Vector3(), fwd = new THREE.Vector3(), tmp = new THREE.Vector3();
    let len = 0;
    for (let i = 0; i < path.length; i++) {
      if (i > 0) len += path[i].distanceTo(path[i - 1]);
      fwd.subVectors(path[Math.min(i + 1, path.length - 1)], path[Math.max(i - 1, 0)]).normalize();
      tmp.set(Math.abs(fwd.y) < 0.9 ? 0 : 1, Math.abs(fwd.y) < 0.9 ? 1 : 0, 0);
      side.crossVectors(fwd, tmp).normalize(); up.crossVectors(side, fwd).normalize();
      const vv = v0 + ((len / 3) % 1) * (v1 - v0) * 0.98;
      for (let k = 0; k <= radial; k++) {
        const a = (k / radial) * Math.PI * 2;
        const nx = side.x * Math.cos(a) + up.x * Math.sin(a), ny = side.y * Math.cos(a) + up.y * Math.sin(a), nz = side.z * Math.cos(a) + up.z * Math.sin(a);
        this.p.push(path[i].x + nx * radii[i], path[i].y + ny * radii[i], path[i].z + nz * radii[i]);
        this.n.push(nx, ny, nz);
        this.uv.push(u0 + (k / radial) * (u1 - u0), vv);
        const ao = 0.75 + 0.25 * Math.min(1, path[i].y / 3);
        this.c.push(col.r * ao, col.g * ao, col.b * ao);
      }
    }
    const row = radial + 1;
    for (let i = 0; i < path.length - 1; i++) for (let k = 0; k < radial; k++) {
      const a = base + i * row + k, b = a + row;
      this.idx.push(a, b, a + 1, a + 1, b, b + 1);
    }
  }
  // 잎 카드 한 장: 중심, 앞면 방향(바깥쪽으로 치우침), 크기, 색, 수관 중심(노멀용)
  card(pos, nrm, size, roll, color, rect, crown, squash = 1) {
    const [u0, v0, u1, v1] = uvOf(rect, 4);
    const t1 = new THREE.Vector3(), t2 = new THREE.Vector3();
    t1.set(Math.abs(nrm.y) < 0.95 ? 0 : 1, Math.abs(nrm.y) < 0.95 ? 1 : 0, 0).cross(nrm).normalize();
    t2.crossVectors(nrm, t1).normalize();
    const cr = Math.cos(roll), sr = Math.sin(roll);
    const a = t1.clone().multiplyScalar(cr).addScaledVector(t2, sr).multiplyScalar(size / 2);
    const b = t2.clone().multiplyScalar(cr).addScaledVector(t1, -sr).multiplyScalar((size / 2) * squash);
    const base = this.count;
    const corners = [[-1, -1, u0, v0], [1, -1, u1, v0], [1, 1, u1, v1], [-1, 1, u0, v1]];
    const v = new THREE.Vector3(), d = new THREE.Vector3();
    for (const [sx, sy, u, w] of corners) {
      v.copy(pos).addScaledVector(a, sx).addScaledVector(b, sy);
      // 노멀 = 수관 바깥 방향 80% + 카드 방향 20% → 덩어리처럼 부드럽게
      d.subVectors(v, crown.c).multiply(crown.inv).normalize().multiplyScalar(0.8).addScaledVector(nrm, 0.2).normalize();
      this.p.push(v.x, v.y, v.z); this.n.push(d.x, d.y, d.z); this.uv.push(u, w);
      this.c.push(color.r, color.g, color.b);
    }
    this.idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
  }
  build() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.p, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.n, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.c, 3));
    g.setIndex(this.idx);
    g.computeBoundingSphere();
    return g;
  }
}

const V = (x, y, z) => new THREE.Vector3(x, y, z);
// 가지: 시작점·방향·길이 → 살짝 위로 휘는 3점 경로
function branch(B, from, yaw, tilt, len, r0, color, bendUp = 0.25) {
  const dir = V(Math.sin(tilt) * Math.cos(yaw), Math.cos(tilt), Math.sin(tilt) * Math.sin(yaw));
  const mid = from.clone().addScaledVector(dir, len * 0.5);
  const tip = from.clone().addScaledVector(dir, len);
  tip.y += len * bendUp;
  B.limb([from, mid, tip], [r0, r0 * 0.65, r0 * 0.3], 5, color);
  return tip;
}

// 퍼프(잎 덩어리) 하나에 카드 n장: 바깥쪽을 보도록 방향을 치우치고, 안쪽 카드는 어둡게(그늘)
function puff(B, R, center, rad, n, opt) {
  const { pal, rect, crown, size = [1.5, 2.1], flat = 0.8, ao = 0.55, squash = 1 } = opt;
  const p = new THREE.Vector3(), nrm = new THREE.Vector3(), col = new THREE.Color();
  for (let k = 0; k < n; k++) {
    // 껍질 쪽에 몰리도록 반지름 분포 (안은 비어도 카드가 가림)
    const u = R() * 2 - 1, th = R() * Math.PI * 2, rr = (0.45 + 0.55 * Math.sqrt(R())) * rad;
    const s = Math.sqrt(1 - u * u);
    p.set(center.x + rr * s * Math.cos(th), center.y + rr * u * flat, center.z + rr * s * Math.sin(th));
    // 앞면 = 퍼프 바깥 + 수관 바깥 + 흔들림
    nrm.subVectors(p, center).normalize().multiplyScalar(0.7)
      .add(p.clone().sub(crown.c).normalize().multiplyScalar(0.5))
      .add(V(R() - 0.5, R() - 0.5, R() - 0.5).multiplyScalar(0.9)).normalize();
    // 수관 속 깊이·높이로 그늘 (안쪽·아래쪽 어둡게)
    const depth = Math.min(1, p.clone().sub(crown.c).multiply(crown.inv).length());
    const hgt = Math.min(1, Math.max(0, (p.y - crown.lo) / (crown.hi - crown.lo)));
    const shade = (1 - ao) + ao * (0.55 * depth + 0.45 * hgt);
    col.set(pal[Math.floor(R() * pal.length)]).multiplyScalar(shade * (0.9 + R() * 0.2));
    B.card(p, nrm, size[0] + R() * (size[1] - size[0]), R() * Math.PI * 2, col, rect, crown, squash);
  }
}
const crownOf = (cx, cy, cz, rx, ry, lo, hi) => ({ c: V(cx, cy, cz), inv: V(1 / rx, 1 / ry, 1 / rx), lo, hi });

// ───────── 수종별 나무 한 그루 ─────────
function buildSpecies(kind, seed) {
  const R = rng(seed);
  const B = new Builder();
  const bark = BARK[kind];
  if (kind === 'broad' || kind === 'zelkova') {
    const zel = kind === 'zelkova';
    const H = zel ? 2.6 : 3.2;
    B.limb([V(0, -0.3, 0), V(0.05, H * 0.5, 0), V(0, H, 0.05)], [zel ? 0.36 : 0.28, zel ? 0.3 : 0.22, zel ? 0.26 : 0.17], 7, bark);
    const nb = zel ? 7 : 5, tips = [];
    for (let i = 0; i < nb; i++) {
      const yaw = (i / nb) * Math.PI * 2 + R() * 0.5;
      const tilt = zel ? 0.38 + R() * 0.25 : 0.7 + R() * 0.35;
      const len = zel ? 4.2 + R() * 1.4 : 2.2 + R() * 1.0;
      tips.push(branch(B, V(0, H * (zel ? 0.92 : 0.65 + R() * 0.3), 0), yaw, tilt, len, zel ? 0.17 : 0.12, bark, zel ? 0.05 : 0.2));
    }
    const top = zel ? H + 5.2 : H + 2.6;
    const crown = zel ? crownOf(0, H + 4.4, 0, 5.2, 2.6, H + 1.5, H + 7.2) : crownOf(0, H + 2.0, 0, 3.6, 2.6, H - 0.5, H + 4.6);
    const opt = { pal: PAL[kind], rect: RECT.leaf, crown, size: zel ? [1.6, 2.2] : [1.5, 2.1] };
    for (const t of tips) puff(B, R, t, zel ? 1.8 : 1.7, zel ? 14 : 17, opt);
    puff(B, R, V(0, top, 0), zel ? 2.4 : 2.0, zel ? 20 : 20, opt);
    if (!zel) puff(B, R, V(0, H + 0.6, 0), 1.8, 12, opt);
    return B.build();
  }
  if (kind === 'ginkgo') {
    const H = 9.5;
    B.limb([V(0, -0.3, 0), V(0, 3, 0.03), V(0.04, 6, 0), V(0, H, 0)], [0.3, 0.24, 0.17, 0.08], 7, bark);
    const crown = crownOf(0, 6.5, 0, 2.6, 4.2, 2.6, H + 0.8);
    const opt = { pal: PAL.ginkgo, rect: RECT.ginkgo, crown, size: [1.2, 1.6], squash: 1.6, ao: 0.4 };
    for (let i = 0; i < 10; i++) {
      const y = 3.0 + i * 0.6, yaw = i * 2.4 + R() * 0.6, len = 2.6 - i * 0.17 + R() * 0.4;
      const tip = branch(B, V(0, y, 0), yaw, 0.95 + R() * 0.3, len, 0.07, bark, 0.3);
      puff(B, R, tip.clone().lerp(V(0, y, 0), 0.25), 0.9, 7, opt);
    }
    puff(B, R, V(0, H, 0), 0.8, 6, opt);
    return B.build();
  }
  if (kind === 'cherry') {
    const H = 1.9;
    B.limb([V(0, -0.3, 0), V(0.08, H * 0.5, 0), V(0, H, 0)], [0.32, 0.27, 0.23], 7, bark);
    const crown = crownOf(0, H + 2.6, 0, 4.4, 2.2, H + 0.6, H + 5.0);
    const opt = { pal: PAL.cherry, rect: RECT.cherry, crown, size: [1.6, 2.1], flat: 0.65, ao: 0.4 };
    const tips = [];
    for (let i = 0; i < 5; i++) {
      const yaw = (i / 5) * Math.PI * 2 + R() * 0.5;
      const t = branch(B, V(0, H, 0), yaw, 0.8 + R() * 0.3, 3.0 + R() * 0.9, 0.15, bark, 0.15);
      tips.push(t);
      // 곁가지
      tips.push(branch(B, t.clone().lerp(V(0, H, 0), 0.4), yaw + 0.9, 0.7, 1.6, 0.07, bark, 0.2));
    }
    for (const t of tips) puff(B, R, t, 1.4, 10, opt);
    puff(B, R, V(0, H + 3.4, 0), 2.2, 16, opt);
    return B.build();
  }
  // pine: 굽은 줄기 + 층층이 납작한 솔잎 판
  const Hp = 8.5, lean = 0.9;
  const path = [V(0, -0.3, 0), V(lean * 0.3, Hp * 0.25, 0.15), V(lean * 0.9, Hp * 0.5, -0.2), V(lean * 1.4, Hp * 0.75, 0.1), V(lean * 1.5, Hp, 0)];
  B.limb(path, [0.3, 0.25, 0.2, 0.15, 0.08], 6, bark);
  const crown = crownOf(lean * 1.2, Hp * 0.78, 0, 3.0, 2.2, Hp * 0.45, Hp + 0.8);
  const opt = { pal: PAL.pine, rect: RECT.pine, crown, size: [1.7, 2.3], ao: 0.6 };
  const tierAt = [0.5, 0.6, 0.7, 0.8, 0.9, 1.0];
  tierAt.forEach((t, i) => {
    const i0 = Math.min(path.length - 2, Math.floor(t * (path.length - 1)));
    const base = path[i0].clone().lerp(path[i0 + 1], t * (path.length - 1) - i0);
    const yaw = i * 2.2 + R() * 0.8, reach = (1 - t) * 3.2 + 0.6;
    const tip = i < 5 ? branch(B, base, yaw, 1.2, reach, 0.08, bark, 0.12) : base.clone().add(V(0, 0.3, 0));
    const pr = 1.7 - t * 0.6;
    // 판: 카드를 거의 수평으로 (위아래에서 보면 솔잎 덩어리, 옆에서 보면 얇은 층)
    const nrm = new THREE.Vector3(), col = new THREE.Color(), p = new THREE.Vector3();
    for (let k = 0; k < 9; k++) {
      const a = R() * Math.PI * 2, r = Math.sqrt(R()) * pr;
      p.set(tip.x + Math.cos(a) * r, tip.y + (R() - 0.5) * 0.5, tip.z + Math.sin(a) * r);
      nrm.set((R() - 0.5) * 0.7 + Math.cos(a) * 0.3, 1, (R() - 0.5) * 0.7 + Math.sin(a) * 0.3).normalize();
      const shade = 0.6 + 0.4 * (t - 0.4) / 0.6;
      col.set(PAL.pine[Math.floor(R() * PAL.pine.length)]).multiplyScalar(shade * (0.9 + R() * 0.2));
      B.card(p, nrm, opt.size[0] + R() * 0.6, R() * 6.28, col, RECT.pine, crown);
    }
    // 옆모습용 세운 카드 2장
    for (let k = 0; k < 2; k++) {
      const a = R() * Math.PI * 2;
      p.set(tip.x + Math.cos(a) * pr * 0.6, tip.y + 0.1, tip.z + Math.sin(a) * pr * 0.6);
      nrm.set(Math.cos(a), 0.35, Math.sin(a)).normalize();
      col.set(PAL.pine[k]).multiplyScalar(0.8);
      B.card(p, nrm, 1.8, R() * 6.28, col, RECT.pine, crown, 0.55);
    }
  });
  return B.build();
}

// ───────── 배치 ─────────
const TREE_CUT = 0.2;
const SPECIES = ['broad', 'broad2', 'zelkova', 'ginkgo', 'cherry', 'pine'];
// 실제 크기 배율 [최소, 폭]
const SCALE = { broad: [0.9, 0.4], broad2: [0.9, 0.4], zelkova: [0.95, 0.3], ginkgo: [0.9, 0.35], cherry: [0.9, 0.3], pine: [0.85, 0.45] };

export async function makeTrees(world, heightAt, buildingIndex, roadIndex, scene, quality = { treeShadows: true }) {
  const R = rng(20261107);
  const { minX, maxX, minZ, maxZ } = world.bounds;
  const inside = (x, z) => x > minX + 4 && x < maxX - 4 && z > minZ + 4 && z < maxZ - 4;
  const ok = (x, z, pad = 2.2) => inside(x, z) && !buildingIndex.hit(x, z, pad) && !roadIndex.near(x, z, 0.8);

  // 구운 실측 자료 (scripts/fetch-trees.mjs) — 없으면 숲만 채움
  let data = { streets: [], sites: [], osmTrees: [] };
  try { const r = await fetch('/trees.json'); if (r.ok) data = await r.json(); } catch { /* 자료 없음 */ }

  // 가까운 나무 솎기용 격자 (먼저 넣은 실측 나무가 우선)
  const spots = [], grid = new Map();
  const G = 3;
  const free = (x, z, d) => {
    const ci = Math.floor(x / G), cj = Math.floor(z / G), rr = Math.ceil(d / G);
    for (let di = -rr; di <= rr; di++) for (let dj = -rr; dj <= rr; dj++) {
      for (const [ox, oz] of grid.get((ci + di) * 7919 + cj + dj) || []) if (Math.hypot(ox - x, oz - z) < d) return false;
    }
    return true;
  };
  const put = (x, z, kind, d = 3.2) => {
    if (!free(x, z, d)) return false;
    const k = Math.floor(x / G) * 7919 + Math.floor(z / G);
    if (!grid.has(k)) grid.set(k, []);
    grid.get(k).push([x, z]);
    spots.push([x, z, kind]);
    return true;
  };
  const OSMKIND = (s) => (/벚|Prunus/i.test(s) ? 'cherry' : /은행|Ginkgo/i.test(s) ? 'ginkgo' : /소나무|Pinus|needle/i.test(s) ? 'pine' : /느티|Zelkova|Platanus|버즘/i.test(s) ? 'zelkova' : 'broad');

  // 1) OSM 개별 나무 (있으면 그대로)
  for (const t of data.osmTrees || []) if (ok(t.p[0], t.p[1], 1.2)) put(t.p[0], t.p[1], OSMKIND(t.species), 2.5);

  // 2) 가로수 줄: 도로 양쪽 보도에 일정 간격 (도로에서 밀어내며 빈 자리 찾기)
  for (const s of data.streets || []) {
    const pts = s.pts;
    let carry = R() * s.gap;
    for (let i = 1; i < pts.length; i++) {
      const [ax, az] = pts[i - 1], [bx, bz] = pts[i];
      const L = Math.hypot(bx - ax, bz - az);
      if (L < 0.01) continue;
      const nx = -(bz - az) / L, nz = (bx - ax) / L;
      let d = carry;
      for (; d < L; d += s.gap) {
        const cx = ax + (bx - ax) * (d / L), cz = az + (bz - az) * (d / L);
        for (const side of [-1, 1]) {
          if (R() < 0.12) continue; // 군데군데 빈 자리
          for (let off = s.wide ? 6 : 3.2; off < (s.wide ? 16 : 9); off += 0.8) {
            const x = cx + nx * off * side, z = cz + nz * off * side;
            if (ok(x, z, 1.4) && !roadIndex.near(x, z, 1.5)) { put(x, z, s.species, s.gap * 0.6); break; }
          }
        }
      }
      carry = d - L;
    }
  }

  // 3) 건물 둘레 수목 (로드뷰 메모: 소나무 군식·열식, 활엽수 숲 등)
  const pineSlopes = [];
  for (const s of data.sites || []) {
    const kind = s.species === 'broad' ? (R() < 0.5 ? 'broad' : 'broad2') : s.species;
    const ring = s.ring;
    let placed = 0;
    for (let tries = 0; tries < s.n * 12 && placed < s.n; tries++) {
      let x, z;
      if (ring) {
        const i = Math.floor(R() * ring.length), j = (i + 1) % ring.length, t = R();
        const ex = ring[i][0] + (ring[j][0] - ring[i][0]) * t, ez = ring[i][1] + (ring[j][1] - ring[i][1]) * t;
        const b = bbox(ring), cx = (b.x0 + b.x1) / 2, cz = (b.z0 + b.z1) / 2;
        const ox = ex - cx, oz = ez - cz, ol = Math.hypot(ox, oz) || 1;
        const push = s.slope ? 4 + R() * 12 : 2.8 + R() * 4;
        x = ex + (ox / ol) * push; z = ez + (oz / ol) * push;
      } else {
        const a = R() * Math.PI * 2, r = 12 + R() * 14;
        x = s.c[0] + Math.cos(a) * r; z = s.c[1] + Math.sin(a) * r;
      }
      if (ok(x, z, 1.6) && put(x, z, kind, kind === 'pine' ? 2.8 : 3.4)) placed++;
    }
    if (s.species === 'pine' && s.slope && s.c) pineSlopes.push(s.c);
  }

  // 4) 숲 (무작위 채움은 여기만): 소나무·활엽수 섞인 서울 도심 산림. 소나무 비탈 메모 근처는 소나무 많이
  for (const a of world.areas) {
    const park = a.sub === 'park' || a.sub === 'garden';
    if (a.cls !== 'forest' && !park) continue;
    const b = bbox(a.pts);
    const area = (b.x1 - b.x0) * (b.z1 - b.z0);
    const n = Math.min(500, Math.floor(area * (park ? 1 / 220 : 1 / 30)));
    for (let k = 0; k < n; k++) {
      const x = b.x0 + R() * (b.x1 - b.x0), z = b.z0 + R() * (b.z1 - b.z0);
      if (!pointInPoly(x, z, a.pts) || !ok(x, z)) continue;
      const nearPine = pineSlopes.some((c) => Math.hypot(c[0] - x, c[1] - z) < 80);
      const u = R(), pPine = park ? 0.15 : nearPine ? 0.6 : 0.38;
      const kind = u < pPine ? 'pine' : u < pPine + (1 - pPine) * 0.42 ? 'broad' : u < pPine + (1 - pPine) * 0.84 ? 'broad2' : 'zelkova';
      put(x, z, kind);
    }
  }

  // ── 재질 하나 (아틀라스) + 수종 지오메트리
  const barkTex = await loadTex('/tex/bark_diff.jpg').catch(() => null);
  const atlas = makeAtlas(barkTex && barkTex.image);
  const mat = new THREE.MeshStandardMaterial({ map: atlas, vertexColors: true, alphaTest: 0.5, side: THREE.DoubleSide, roughness: 0.8 });
  const geos = {
    broad: buildSpecies('broad', 101), broad2: buildSpecies('broad', 211),
    zelkova: buildSpecies('zelkova', 303), ginkgo: buildSpecies('ginkgo', 404),
    cherry: buildSpecies('cherry', 505), pine: buildSpecies('pine', 606),
  };
  const uTime = { value: 0 }; // (바람 흔들림은 뺐음 — main.js 호환용으로만 남김)

  // 공간 칸(260m)·수종별 InstancedMesh → 화면·그림자 범위 밖 칸은 통째로 건너뜀
  const CELL = 260;
  const tmp = new THREE.Object3D();
  const group = new THREE.Group();
  group.name = 'trees';
  const treeSpots = [];
  const buckets = new Map();
  // 성능: 나무 20% 솎기 (별도 난수라 나머지 배치는 그대로)
  const thin = rng(31337);
  const kept = spots.filter(() => thin() >= TREE_CUT);
  spots.length = 0; spots.push(...kept);
  for (const s of spots) {
    const k = s[2] + '|' + Math.floor(s[0] / CELL) + ',' + Math.floor(s[1] / CELL);
    if (!buckets.has(k)) buckets.set(k, []);
    buckets.get(k).push(s);
  }
  for (const [k, list] of buckets) {
    const kind = k.split('|')[0];
    const mesh = new THREE.InstancedMesh(geos[kind], mat, list.length);
    const [s0, sw] = SCALE[kind];
    list.forEach(([x, z], i) => {
      tmp.position.set(x, heightAt(x, z) - 0.1, z);
      tmp.rotation.set(0, R() * Math.PI * 2, 0);
      const s = s0 + R() * sw;
      tmp.scale.set(s, s * (0.9 + R() * 0.2), s);
      tmp.updateMatrix();
      mesh.setMatrixAt(i, tmp.matrix);
      treeSpots.push({ x, z, kind: kind === 'broad2' ? 'broad' : kind });
    });
    mesh.computeBoundingSphere();
    mesh.castShadow = quality.treeShadows;
    mesh.receiveShadow = true;
    group.add(mesh);
  }

  // 벚나무 아래 떨어진 꽃잎
  group.add(makePetals(treeSpots, heightAt, buildingIndex, R));

  scene.add(group);
  return { group, uTime, count: spots.length, treeSpots };
}

function makePetals(spots, heightAt, buildingIndex, R) {
  const cherries = spots.filter((s) => s.kind === 'cherry');
  const N = Math.min(6000, cherries.length * 50);
  const c = document.createElement('canvas');
  c.width = c.height = 32;
  const g = c.getContext('2d');
  g.fillStyle = '#fff';
  g.beginPath(); g.ellipse(16, 16, 9, 14, 0, 0, Math.PI * 2); g.fill();
  const tex = new THREE.CanvasTexture(c);
  const geo = new THREE.PlaneGeometry(0.12, 0.12);
  geo.rotateX(-Math.PI / 2);
  const mat = new THREE.MeshStandardMaterial({ map: tex, alphaTest: 0.5, side: THREE.DoubleSide, roughness: 0.9 });
  const mesh = new THREE.InstancedMesh(geo, mat, Math.max(1, N));
  const tmp = new THREE.Object3D();
  const cols = ['#ffe3ea', '#ffd3de', '#fff0f3', '#f8c9d6'].map((h) => new THREE.Color(h));
  let n = 0;
  for (let k = 0; k < N; k++) {
    const s = cherries[Math.floor(R() * cherries.length)];
    const a = R() * Math.PI * 2, d = Math.sqrt(R()) * 5;
    const x = s.x + Math.cos(a) * d, z = s.z + Math.sin(a) * d;
    if (buildingIndex.hit(x, z)) continue;
    tmp.position.set(x, heightAt(x, z) + 0.04 + R() * 0.02, z);
    tmp.rotation.set((R() - 0.5) * 0.3, R() * Math.PI * 2, (R() - 0.5) * 0.3);
    const sc = 0.7 + R() * 0.8;
    tmp.scale.set(sc, 1, sc);
    tmp.updateMatrix();
    mesh.setMatrixAt(n, tmp.matrix);
    mesh.setColorAt(n, cols[Math.floor(R() * cols.length)]);
    n++;
  }
  mesh.count = n;
  mesh.receiveShadow = true;
  return mesh;
}

// 굽은 소나무 (사자상·애지문 주변 — 로드뷰에 보이는 적송)
export function makePines(spots, heightAt) {
  const R = rng(4242);
  const bark = new THREE.MeshStandardMaterial({ color: 0x8a5a3c, roughness: 0.95 });
  const needles = new THREE.MeshStandardMaterial({ color: 0x2f5a2c, roughness: 0.9, flatShading: true });
  const g = new THREE.Group(); g.name = 'pines';
  for (const [x, z, s = 1] of spots) {
    const t = new THREE.Group();
    const lean = (R() - 0.5) * 0.5, H = (6 + R() * 3) * s;
    const curve = new THREE.CatmullRomCurve3([new THREE.Vector3(0, 0, 0), new THREE.Vector3(lean * 1.5, H * 0.35, 0.3), new THREE.Vector3(lean * 3, H * 0.7, -0.4), new THREE.Vector3(lean * 3.6, H, 0.2)]);
    t.add(new THREE.Mesh(new THREE.TubeGeometry(curve, 16, 0.22 * s, 7), bark));
    for (let k = 0; k < 6; k++) { // 층층이 납작한 잎 덩어리
      const p = curve.getPoint(0.5 + k * 0.1);
      const pad = new THREE.Mesh(new THREE.IcosahedronGeometry(1, 1), needles);
      const r = (2.4 - k * 0.25) * s * (0.8 + R() * 0.4);
      pad.scale.set(r, r * 0.32, r * (0.75 + R() * 0.3));
      const a = R() * Math.PI * 2, o = (k < 4 ? 1.1 : 0.3) * s;
      pad.position.set(p.x + Math.cos(a) * o, p.y + 0.2, p.z + Math.sin(a) * o);
      t.add(pad);
    }
    t.position.set(x, heightAt(x, z) - 0.1, z);
    t.rotation.y = R() * Math.PI * 2;
    t.traverse((m) => { if (m.isMesh) { m.castShadow = true; m.receiveShadow = true; } });
    g.add(t);
  }
  return g;
}
