import * as THREE from 'three';
import { CSS2DObject } from 'three/examples/jsm/renderers/CSS2DRenderer.js';
import { loadTex, rng } from './util.js';

const bronze = () => new THREE.MeshStandardMaterial({ color: 0x7c5a2c, metalness: 0.85, roughness: 0.32 });

// ---- 사자상 (한양 라이언스) : 사진 대신 단순화한 조형
export async function makeLion(p, heightAt) {
  const granite = await loadTex('/tex/granite_diff.jpg');
  const stone = new THREE.MeshStandardMaterial({ map: granite, color: 0xfff6e8, roughness: 0.8 });
  const g = new THREE.Group();
  const y0 = heightAt(p[0], p[1]);
  const plinth = new THREE.Mesh(new THREE.CylinderGeometry(3.4, 3.6, 0.5, 40), stone);
  plinth.position.y = 0.25;
  const ped = new THREE.Mesh(new THREE.BoxGeometry(2.6, 2.2, 1.6), stone);
  ped.position.y = 0.5 + 1.1;
  g.add(plinth, ped);

  const m = bronze();
  const lion = new THREE.Group();
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.55, 1.2, 6, 16), m);
  body.rotation.z = Math.PI / 2; body.position.set(0, 1.25, 0);
  const chest = new THREE.Mesh(new THREE.SphereGeometry(0.66, 20, 16), m);
  chest.position.set(0.72, 1.4, 0);
  const mane = new THREE.Mesh(new THREE.IcosahedronGeometry(0.78, 1), m);
  mane.position.set(1.0, 1.95, 0); mane.scale.set(0.8, 1, 1);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.42, 20, 16), m);
  head.position.set(1.35, 2.0, 0);
  const snout = new THREE.Mesh(new THREE.SphereGeometry(0.24, 16, 12), m);
  snout.position.set(1.7, 1.88, 0); snout.scale.set(1.1, 0.8, 1);
  const jaw = new THREE.Mesh(new THREE.SphereGeometry(0.18, 12, 10), m);
  jaw.position.set(1.62, 1.66, 0); // 포효하는 입
  const ears = [-1, 1].map((s) => { const e = new THREE.Mesh(new THREE.SphereGeometry(0.12, 10, 8), m); e.position.set(1.25, 2.38, 0.24 * s); return e; });
  lion.add(body, chest, mane, head, snout, jaw, ...ears);
  for (const [x, z] of [[0.75, 0.3], [0.75, -0.3], [-0.65, 0.3], [-0.65, -0.3]]) {
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.19, 1.0, 10), m);
    leg.position.set(x, 0.5, z);
    lion.add(leg);
  }
  const tail = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3([new THREE.Vector3(-1.1, 1.3, 0), new THREE.Vector3(-1.6, 1.6, 0.1), new THREE.Vector3(-1.7, 2.2, 0)]), 12, 0.07, 6), m);
  const tuft = new THREE.Mesh(new THREE.SphereGeometry(0.14, 10, 8), m);
  tuft.position.set(-1.7, 2.25, 0);
  lion.add(tail, tuft);
  lion.position.y = 2.7;
  lion.scale.setScalar(1.7);
  g.add(lion);
  g.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  g.position.set(p[0], y0 - 0.05, p[1]);
  g.rotation.y = Math.PI / 2; // 남쪽(역 방향)을 바라봄
  return g;
}

// ---- 노천극장 : 언덕 쪽으로 올라가는 반원형 계단식 객석
export async function makeAmphitheater(pts, heightAt) {
  const granite = await loadTex('/tex/granite_diff.jpg');
  granite.repeat.set(0.25, 0.25);
  const stone = new THREE.MeshStandardMaterial({ map: granite, color: 0xfff4e2, roughness: 0.85 });
  // 중심·크기
  const cx = pts.reduce((a, p) => a + p[0], 0) / pts.length, cz = pts.reduce((a, p) => a + p[1], 0) / pts.length;
  let rmax = 0;
  for (const [x, z] of pts) rmax = Math.max(rmax, Math.hypot(x - cx, z - cz));
  // 오르막 방향
  const e = 6;
  const gx = heightAt(cx + e, cz) - heightAt(cx - e, cz), gz = heightAt(cx, cz + e) - heightAt(cx, cz - e);
  const up = Math.atan2(gz, gx);
  const stageR = Math.max(5, rmax * 0.28);
  const rows = Math.max(6, Math.min(16, Math.floor((rmax * 0.95 - stageR) / 1.3)));
  const span = Math.PI * 0.95;
  const stageX = cx - Math.cos(up) * rmax * 0.35, stageZ = cz - Math.sin(up) * rmax * 0.35;
  const base = heightAt(stageX, stageZ);
  const g = new THREE.Group();
  for (let k = 0; k < rows; k++) {
    const r0 = stageR + 1.2 + k * 1.3, r1 = r0 + 1.3;
    const sh = new THREE.Shape();
    sh.absarc(0, 0, r1, -span / 2, span / 2, false);
    sh.absarc(0, 0, r0, span / 2, -span / 2, true);
    const hgt = 0.6 + (k + 1) * 0.42;
    const geo = new THREE.ExtrudeGeometry(sh, { depth: hgt + 3, bevelEnabled: false, curveSegments: 28 });
    geo.rotateX(-Math.PI / 2);
    geo.translate(0, -3, 0);
    const mesh = new THREE.Mesh(geo, stone);
    mesh.position.y = 0;
    g.add(mesh);
  }
  const stage = new THREE.Mesh(new THREE.CylinderGeometry(stageR, stageR, 1.2, 40, 1, false, -Math.PI / 2, Math.PI), stone);
  stage.rotation.y = Math.PI / 2;
  stage.position.y = 0.6 - 0.6 + 0.3;
  g.add(stage);
  g.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  g.position.set(stageX, base, stageZ);
  // shape의 +x 축(객석 중심 방향)을 오르막 방향으로
  g.rotation.y = -up;
  return { group: g, center: [stageX, stageZ], footprint: pts };
}

// ---- 한양대역 출구 (2호선 초록색)
function signTexture(text, sub) {
  const c = document.createElement('canvas');
  c.width = 512; c.height = 160;
  const g = c.getContext('2d');
  g.fillStyle = '#1f2a22'; g.fillRect(0, 0, 512, 160);
  g.fillStyle = '#3cb44a'; g.beginPath(); g.arc(80, 80, 52, 0, Math.PI * 2); g.fill();
  g.fillStyle = '#fff'; g.font = 'bold 64px Pretendard, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText('2', 80, 84);
  g.textAlign = 'left'; g.font = 'bold 56px Pretendard, sans-serif'; g.fillText(text, 156, 62);
  g.font = '500 34px Pretendard, sans-serif'; g.fillStyle = '#cfe8d2'; g.fillText(sub, 158, 118);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
export function makeStationExits(exits, heightAt, roadIndexNearest) {
  const g = new THREE.Group();
  const glass = new THREE.MeshStandardMaterial({ color: 0x9fb8c4, roughness: 0.1, metalness: 0.1, transparent: true, opacity: 0.45 });
  const frame = new THREE.MeshStandardMaterial({ color: 0x3a3f42, roughness: 0.5, metalness: 0.6 });
  const seen = new Set();
  for (const ex of exits) {
    const key = ex.ref + ':' + Math.round(ex.p[0] / 8) + ',' + Math.round(ex.p[1] / 8);
    if (seen.has(key)) continue;
    seen.add(key);
    const e = new THREE.Group();
    const roof = new THREE.Mesh(new THREE.BoxGeometry(3.4, 0.18, 6), frame);
    roof.position.y = 2.9;
    const sideL = new THREE.Mesh(new THREE.BoxGeometry(0.06, 2.8, 5.6), glass);
    sideL.position.set(-1.65, 1.4, 0);
    const sideR = sideL.clone(); sideR.position.x = 1.65;
    const back = new THREE.Mesh(new THREE.BoxGeometry(3.3, 2.8, 0.06), glass);
    back.position.set(0, 1.4, -2.8);
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(3.2, 1.0), new THREE.MeshBasicMaterial({ map: signTexture('한양대역', `${ex.ref}번 출구`) }));
    sign.position.set(0, 3.5, 2.95);
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.6, 0.12), frame);
    post.position.set(0, 3.0, 2.95);
    e.add(roof, sideL, sideR, back, sign, post);
    e.traverse((o) => { if (o.isMesh) o.castShadow = true; });
    e.position.set(ex.p[0], heightAt(ex.p[0], ex.p[1]), ex.p[1]);
    const dir = roadIndexNearest(ex.p[0], ex.p[1]);
    e.rotation.y = Math.atan2(dir[0], dir[1]);
    g.add(e);
  }
  return g;
}

// ---- 라벨
export function makeLabel(text, sub = '') {
  const div = document.createElement('div');
  div.className = 'lm-label';
  div.innerHTML = sub ? `${text}<small>${sub}</small>` : text;
  return new CSS2DObject(div);
}

// ---- 가로등·벤치
export function makeProps(world, heightAt, buildingIndex, plaza) {
  const R = rng(77);
  const posts = [], benches = [];
  for (const r of world.roads) {
    if (r.kind === 'road' || r.hw === 'steps' || r.hw === 'path') continue;
    let acc = 8 + R() * 22;
    for (let i = 1; i < r.pts.length; i++) {
      const [ax, az] = r.pts[i - 1], [bx, bz] = r.pts[i];
      const L = Math.hypot(bx - ax, bz - az);
      const nx = -(bz - az) / (L || 1), nz = (bx - ax) / (L || 1);
      let d = acc;
      for (; d < L; d += 30) {
        const t = d / L, x = ax + (bx - ax) * t + nx * (r.w / 2 + 0.5), z = az + (bz - az) * t + nz * (r.w / 2 + 0.5);
        if (!buildingIndex.hit(x, z, 0.5)) posts.push([x, z]);
        if (R() < 0.18) {
          const bxp = ax + (bx - ax) * t - nx * (r.w / 2 + 0.8), bzp = az + (bz - az) * t - nz * (r.w / 2 + 0.8);
          if (!buildingIndex.hit(bxp, bzp, 1)) benches.push([bxp, bzp, Math.atan2(nx, nz)]);
        }
      }
      acc = d - L;
    }
  }
  const g = new THREE.Group();
  const iron = new THREE.MeshStandardMaterial({ color: 0x2f2b27, roughness: 0.6, metalness: 0.5 });
  const bulbMat = new THREE.MeshStandardMaterial({ color: 0xfff0d0, emissive: 0xffc070, emissiveIntensity: 2.2 });
  const postGeo = new THREE.CylinderGeometry(0.06, 0.09, 3.6, 6); postGeo.translate(0, 1.8, 0);
  const headGeo = new THREE.CylinderGeometry(0.28, 0.18, 0.32, 8); headGeo.translate(0, 3.75, 0);
  const bulbGeo = new THREE.SphereGeometry(0.17, 10, 8); bulbGeo.translate(0, 3.55, 0);
  const P = new THREE.InstancedMesh(postGeo, iron, posts.length);
  const Hh = new THREE.InstancedMesh(headGeo, iron, posts.length);
  const B = new THREE.InstancedMesh(bulbGeo, bulbMat, posts.length);
  const tmp = new THREE.Object3D();
  posts.forEach(([x, z], i) => { tmp.position.set(x, heightAt(x, z), z); tmp.rotation.set(0, 0, 0); tmp.updateMatrix(); P.setMatrixAt(i, tmp.matrix); Hh.setMatrixAt(i, tmp.matrix); B.setMatrixAt(i, tmp.matrix); });
  P.castShadow = true;
  g.add(P, Hh, B);

  const wood = new THREE.MeshStandardMaterial({ color: 0x8b5a33, roughness: 0.8 });
  const seat = new THREE.BoxGeometry(1.8, 0.08, 0.5); seat.translate(0, 0.45, 0);
  const back = new THREE.BoxGeometry(1.8, 0.4, 0.06); back.translate(0, 0.75, -0.24);
  const legs = new THREE.BoxGeometry(1.6, 0.45, 0.4); legs.translate(0, 0.22, 0);
  const S = new THREE.InstancedMesh(seat, wood, benches.length), Bk = new THREE.InstancedMesh(back, wood, benches.length), L = new THREE.InstancedMesh(legs, iron, benches.length);
  benches.forEach(([x, z, a], i) => { tmp.position.set(x, heightAt(x, z), z); tmp.rotation.set(0, a, 0); tmp.updateMatrix(); S.setMatrixAt(i, tmp.matrix); Bk.setMatrixAt(i, tmp.matrix); L.setMatrixAt(i, tmp.matrix); });
  S.castShadow = Bk.castShadow = true;
  g.add(S, Bk, L);
  return g;
}
