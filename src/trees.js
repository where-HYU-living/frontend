import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { loadTex, rng, pointInPoly, bbox } from './util.js';

// 단풍잎 모양 알파 텍스처
function leafTexture() {
  const S = 128;
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const g = c.getContext('2d');
  g.translate(S / 2, S / 2);
  g.fillStyle = '#fff';
  const lobes = [[0, -1], [0.8, -0.45], [0.62, 0.42], [-0.62, 0.42], [-0.8, -0.45]];
  for (const [x, y] of lobes) {
    g.beginPath();
    g.ellipse(x * 22, y * 22, 18, 26, Math.atan2(y, x) + Math.PI / 2, 0, Math.PI * 2);
    g.fill();
  }
  g.beginPath(); g.arc(0, 0, 26, 0, Math.PI * 2); g.fill();
  g.fillRect(-2, 20, 4, 36);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// 봄 (4월 초): 새잎 연두 · 느티나무 초록 · 벚꽃 분홍
const PALETTES = {
  maple: ['#7fb446', '#8fc451', '#6ea43c', '#9ccf5c', '#78ad44'],
  orange: ['#5d9338', '#6aa040', '#4f8530', '#73a84a', '#588c35'],
  ginkgo: ['#ffd0d6', '#ffdde0', '#f9bcc6', '#ffe8ea', '#fbc6cf'],
};

// 나무 한 종류의 줄기·잎 지오메트리 만들기
function buildVariant(kind, seed) {
  const R = rng(seed);
  const tall = kind === 'ginkgo';
  const trunkH = tall ? 4.2 : 3.0;
  const parts = [];
  const trunk = new THREE.CylinderGeometry(0.16, 0.3, trunkH, 7);
  trunk.translate(0, trunkH / 2, 0);
  parts.push(trunk);
  const branchTips = [];
  const nb = tall ? 5 : 4;
  for (let i = 0; i < nb; i++) {
    const len = 1.6 + R() * 1.2;
    const br = new THREE.CylinderGeometry(0.05, 0.11, len, 5);
    br.translate(0, len / 2, 0);
    const tilt = (tall ? 0.45 : 0.75) + R() * 0.35, yaw = (i / nb) * Math.PI * 2 + R() * 0.6;
    const m = new THREE.Matrix4().makeRotationY(yaw).multiply(new THREE.Matrix4().makeRotationZ(tilt));
    const y0 = trunkH * (0.6 + R() * 0.35);
    m.setPosition(0, y0, 0);
    br.applyMatrix4(m);
    parts.push(br);
    branchTips.push(new THREE.Vector3(0, len, 0).applyMatrix4(m));
  }
  const wood = mergeGeometries(parts);

  // 잎 카드: 가지 끝과 수관 중심 주변에 덩어리(퍼프)로 뿌린다
  const pal = PALETTES[kind].map((h) => new THREE.Color(h));
  const cards = [];
  const centers = branchTips.concat([new THREE.Vector3(0, trunkH + (tall ? 2.6 : 1.4), 0), new THREE.Vector3(0, trunkH + (tall ? 0.8 : 0.2), 0)]);
  if (tall) centers.push(new THREE.Vector3(0, trunkH + 4.0, 0));
  const tmp = new THREE.Object3D();
  for (const c of centers) {
    const rad = tall ? 1.35 : 1.65;
    const n = tall ? 40 : 46;
    for (let k = 0; k < n; k++) {
      const q = new THREE.PlaneGeometry(1.15, 1.15);
      const u = R() * 2 - 1, th = R() * Math.PI * 2, rr = Math.cbrt(R()) * rad;
      const s = Math.sqrt(1 - u * u);
      tmp.position.set(c.x + rr * s * Math.cos(th), c.y + rr * u * (tall ? 1.3 : 0.8), c.z + rr * s * Math.sin(th));
      tmp.rotation.set(R() * Math.PI, R() * Math.PI, R() * Math.PI);
      const sc = 0.8 + R() * 0.6;
      tmp.scale.set(sc, sc, sc);
      tmp.updateMatrix();
      q.applyMatrix4(tmp.matrix);
      const col = pal[Math.floor(R() * pal.length)].clone().multiplyScalar(0.85 + R() * 0.3);
      const cols = new Float32Array(q.attributes.position.count * 3);
      for (let v = 0; v < q.attributes.position.count; v++) col.toArray(cols, v * 3);
      q.setAttribute('color', new THREE.BufferAttribute(cols, 3));
      q.deleteAttribute('normal');
      cards.push(q);
    }
  }
  const leaves = mergeGeometries(cards);
  // 잎 노멀은 수관 바깥 방향 → 덩어리처럼 부드럽게 빛을 받음
  const p = leaves.attributes.position;
  const nrm = new Float32Array(p.count * 3);
  for (let v = 0; v < p.count; v++) {
    const d = new THREE.Vector3(p.getX(v), p.getY(v) - (trunkH + 1), p.getZ(v)).normalize();
    d.toArray(nrm, v * 3);
  }
  leaves.setAttribute('normal', new THREE.BufferAttribute(nrm, 3));
  return { wood, leaves };
}

export async function makeTrees(world, heightAt, buildingIndex, roadIndex, scene) {
  const R = rng(20261107);
  const spots = [];
  const ok = (x, z, pad = 2.2) => !buildingIndex.hit(x, z, pad) && !roadIndex.near(x, z, 0.8);
  const { minX, maxX, minZ, maxZ } = world.bounds;
  const inside = (x, z) => x > minX + 4 && x < maxX - 4 && z > minZ + 4 && z < maxZ - 4;

  // 1) 길 따라 가로수
  for (const r of world.roads) {
    if (r.hw === 'steps' || r.hw === 'trunk') continue;
    const gap = r.kind === 'road' ? 11 : 9;
    for (let i = 1; i < r.pts.length; i++) {
      const [ax, az] = r.pts[i - 1], [bx, bz] = r.pts[i];
      const L = Math.hypot(bx - ax, bz - az);
      const nx = -(bz - az) / (L || 1), nz = (bx - ax) / (L || 1);
      for (let d = R() * gap; d < L; d += gap) {
        const t = d / L, side = R() < 0.5 ? -1 : 1;
        const off = r.w / 2 + 1.6 + R() * 1.2;
        const x = ax + (bx - ax) * t + nx * off * side, z = az + (bz - az) * t + nz * off * side;
        if (inside(x, z) && ok(x, z) && R() < 0.75) spots.push([x, z]);
      }
    }
  }
  // 2) 숲·공원
  for (const a of world.areas) {
    if (a.cls === 'track' || a.sub === 'pitch') continue;
    const b = bbox(a.pts);
    const area = (b.x1 - b.x0) * (b.z1 - b.z0);
    const dens = a.cls === 'forest' ? 1 / 30 : 1 / 140;
    const n = Math.min(500, Math.floor(area * dens));
    for (let k = 0; k < n; k++) {
      const x = b.x0 + R() * (b.x1 - b.x0), z = b.z0 + R() * (b.z1 - b.z0);
      if (inside(x, z) && pointInPoly(x, z, a.pts) && ok(x, z)) spots.push([x, z]);
    }
  }
  // 너무 가까운 나무 솎아내기
  const kept = [], cell = new Map();
  for (const [x, z] of spots) {
    const ci = Math.floor(x / 3.2), cj = Math.floor(z / 3.2);
    let clash = false;
    for (let di = -1; di <= 1 && !clash; di++) for (let dj = -1; dj <= 1 && !clash; dj++) {
      for (const [ox, oz] of cell.get((ci + di) * 7919 + cj + dj) || []) if (Math.hypot(ox - x, oz - z) < 3.2) { clash = true; break; }
    }
    if (clash) continue;
    const k = ci * 7919 + cj;
    if (!cell.has(k)) cell.set(k, []);
    cell.get(k).push([x, z]);
    kept.push([x, z]);
  }

  const bark = await loadTex('/tex/bark_diff.jpg');
  bark.repeat.set(1, 2);
  const woodMat = new THREE.MeshStandardMaterial({ map: bark, color: 0x8a7a6a, roughness: 0.95 });
  const leafMat = new THREE.MeshStandardMaterial({ map: leafTexture(), vertexColors: true, alphaTest: 0.5, side: THREE.DoubleSide, roughness: 0.75 });
  const uTime = { value: 0 };
  leafMat.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = uTime;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float uTime;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        #ifdef USE_INSTANCING
          vec3 ip = vec3(instanceMatrix[3][0], 0.0, instanceMatrix[3][2]);
        #else
          vec3 ip = vec3(0.0);
        #endif
        float sway = max(position.y - 2.0, 0.0);
        transformed.x += sin(uTime * 1.4 + ip.x * 0.21 + position.y * 0.7) * 0.045 * sway;
        transformed.z += cos(uTime * 1.1 + ip.z * 0.17 + position.x) * 0.035 * sway;
        transformed.y += sin(uTime * 2.3 + position.x * 3.0 + position.z * 2.0) * 0.03;`);
  };

  const kinds = ['maple', 'maple', 'orange', 'orange', 'ginkgo', 'maple'];
  const variants = kinds.map((k, i) => ({ kind: k, ...buildVariant(k, 101 + i * 37) }));
  const buckets = variants.map(() => []);
  for (const p of kept) buckets[Math.floor(R() * variants.length)].push(p);

  const tmp = new THREE.Object3D();
  const group = new THREE.Group();
  group.name = 'trees';
  const treeSpots = [];
  variants.forEach((v, vi) => {
    const list = buckets[vi];
    if (!list.length) return;
    const wood = new THREE.InstancedMesh(v.wood, woodMat, list.length);
    const leaves = new THREE.InstancedMesh(v.leaves, leafMat, list.length);
    list.forEach(([x, z], i) => {
      tmp.position.set(x, heightAt(x, z) - 0.1, z);
      tmp.rotation.set(0, R() * Math.PI * 2, 0);
      const s = 0.85 + R() * 0.55;
      tmp.scale.set(s, s * (0.9 + R() * 0.25), s);
      tmp.updateMatrix();
      wood.setMatrixAt(i, tmp.matrix);
      leaves.setMatrixAt(i, tmp.matrix);
      treeSpots.push({ x, z, kind: v.kind });
    });
    wood.castShadow = leaves.castShadow = true;
    wood.receiveShadow = leaves.receiveShadow = true;
    group.add(wood, leaves);
  });

  // 떨어진 낙엽
  const fallen = makeFallenLeaves(treeSpots, heightAt, buildingIndex, R);
  group.add(fallen);

  scene.add(group);
  return { group, uTime, count: kept.length, treeSpots };
}

function makeFallenLeaves(spots, heightAt, buildingIndex, R) {
  const N = Math.min(9000, spots.length * 6); // 봄: 벚꽃잎만 조금
  const geo = new THREE.PlaneGeometry(0.16, 0.16);
  geo.rotateX(-Math.PI / 2);
  const mat = new THREE.MeshStandardMaterial({ map: leafTexture(), alphaTest: 0.5, side: THREE.DoubleSide, roughness: 0.9 });
  const mesh = new THREE.InstancedMesh(geo, mat, N);
  const tmp = new THREE.Object3D();
  const all = [...PALETTES.maple, ...PALETTES.orange, ...PALETTES.ginkgo, '#8a5a2b', '#a06a30'].map((h) => new THREE.Color(h));
  let n = 0;
  for (let k = 0; k < N; k++) {
    const s = spots[Math.floor(R() * spots.length)];
    if (s.kind !== 'ginkgo') continue;
    const a = R() * Math.PI * 2, d = Math.sqrt(R()) * 5.5;
    const x = s.x + Math.cos(a) * d, z = s.z + Math.sin(a) * d;
    if (buildingIndex.hit(x, z)) continue;
    tmp.position.set(x, heightAt(x, z) + 0.04 + R() * 0.02, z);
    tmp.rotation.set((R() - 0.5) * 0.3, R() * Math.PI * 2, (R() - 0.5) * 0.3);
    const sc = 0.7 + R() * 0.8;
    tmp.scale.set(sc, 1, sc);
    tmp.updateMatrix();
    mesh.setMatrixAt(n, tmp.matrix);
    mesh.setColorAt(n, new THREE.Color(PALETTES.ginkgo[Math.floor(R() * PALETTES.ginkgo.length)]));
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
