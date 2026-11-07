import * as THREE from 'three';
import { findGrandPitch, toWorld, pitchLines, ribbonMesh, turfMesh, pitchRect } from '../world/pitch.ts';

// 대운동장 축구장 (OSM 축구 경기장 99.8×66.8m, 동쪽으로 13° 기울어 있음).
// 지형을 평평하게 깎지 않고 지면을 따라 잔디판·라인·골대를 얹는다.

const geo = (m, withUv) => {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(m.position, 3));
  if (withUv) g.setAttribute('uv', new THREE.BufferAttribute(m.uv, 2));
  g.setIndex(new THREE.BufferAttribute(m.index, 1));
  g.computeVertexNormals();
  // 위를 보는 면이 되도록 법선을 보정 (바닥판은 항상 +y)
  const n = g.getAttribute('normal');
  for (let i = 0; i < n.count; i++) if (n.getY(i) < 0) n.setXYZ(i, -n.getX(i), -n.getY(i), -n.getZ(i));
  return g;
};

function stripeTexture(stripes) {
  const c = document.createElement('canvas');
  c.width = 512; c.height = 8;
  const x = c.getContext('2d');
  const w = c.width / stripes;
  for (let i = 0; i < stripes; i++) { x.fillStyle = i % 2 ? '#4f8f3c' : '#5aa046'; x.fillRect(i * w, 0, Math.ceil(w), c.height); }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.magFilter = THREE.LinearFilter;
  t.anisotropy = 4;
  return t;
}

function netTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const x = c.getContext('2d');
  x.strokeStyle = '#ffffff'; x.lineWidth = 3;
  for (let i = 0; i <= 64; i += 16) { x.beginPath(); x.moveTo(i, 0); x.lineTo(i, 64); x.moveTo(0, i); x.lineTo(64, i); x.stroke(); }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export default async function ({ world, heightAt }) {
  const f = findGrandPitch(world.areas || []);
  if (!f) return { group: new THREE.Group() };
  const group = new THREE.Group();
  group.name = 'stadium';
  const ang = Math.atan2(f.uz, f.ux); // 로컬 +x(긴 변) 방향의 월드 각도

  // 잔디
  const turf = new THREE.Mesh(
    geo(turfMesh(f, heightAt, 0.05, 2), true),
    new THREE.MeshStandardMaterial({ map: stripeTexture(14), roughness: 1, metalness: 0, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }),
  );
  turf.receiveShadow = true;
  group.add(turf);

  // 라인
  const lines = pitchLines(f.length, f.width).map((l) => ({ w: l.w, pts: l.pts.map(([x, z]) => toWorld(f, x, z)) }));
  const lineMesh = new THREE.Mesh(
    geo(ribbonMesh(lines, heightAt, 0.07, 1.5), false),
    new THREE.MeshBasicMaterial({ color: 0xf4f4ee, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 }),
  );
  group.add(lineMesh);

  // 골대 (골라인 위, 폭 7.32 높이 2.44, 그물은 뒤로 2m)
  const white = new THREE.MeshStandardMaterial({ color: 0xf2f2f2, roughness: 0.5 });
  const netMat = new THREE.MeshBasicMaterial({ map: netTexture(), transparent: true, alphaTest: 0.3, side: THREE.DoubleSide, opacity: 0.85 });
  const R = 0.06, GW = 7.32, GH = 2.44, GD = 2;
  for (const s of [-1, 1]) {
    const [gx, gz] = toWorld(f, s * f.length / 2, 0);
    const g = new THREE.Group();
    g.position.set(gx, heightAt(gx, gz), gz);
    g.rotation.y = -ang; // 로컬 x → 월드 (cos, sin) 이 되도록
    const post = (z) => { const m = new THREE.Mesh(new THREE.CylinderGeometry(R, R, GH, 8), white); m.position.set(0, GH / 2, z); m.castShadow = true; return m; };
    const bar = new THREE.Mesh(new THREE.CylinderGeometry(R, R, GW, 8), white);
    bar.rotation.x = Math.PI / 2; bar.position.set(0, GH, 0);
    g.add(post(-GW / 2), post(GW / 2), bar);
    const back = s; // 그물은 경기장 바깥쪽(+s)으로
    const mk = (w, h, rep) => { const m = netMat.clone(); m.map = netMat.map.clone(); m.map.needsUpdate = true; m.map.repeat.set(rep[0], rep[1]); return new THREE.Mesh(new THREE.PlaneGeometry(w, h), m); };
    const rear = mk(GW, GH, [GW / 0.5 / 4, GH / 0.5 / 4]); rear.position.set(back * GD, GH / 2, 0); rear.rotation.y = Math.PI / 2;
    const top = mk(GD, GW, [GD / 2, GW / 2]); top.rotation.x = -Math.PI / 2; top.position.set(back * GD / 2, GH, 0);
    for (const t of [-1, 1]) { const side = mk(GD, GH, [GD / 2, GH / 2]); side.position.set(back * GD / 2, GH / 2, t * GW / 2); g.add(side); }
    g.add(rear, top);
    group.add(g);
  }

  // 코너 깃대
  const flagMat = new THREE.MeshStandardMaterial({ color: 0xff8a1f, roughness: 0.7, side: THREE.DoubleSide });
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    const [x, z] = toWorld(f, sx * f.length / 2, sz * f.width / 2), y = heightAt(x, z);
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 1.5, 6), white);
    pole.position.set(x, y + 0.75, z);
    const flag = new THREE.Mesh(new THREE.PlaneGeometry(0.4, 0.3), flagMat);
    flag.position.set(x + 0.2 * f.ux, y + 1.35, z + 0.2 * f.uz); flag.rotation.y = -ang;
    group.add(pole, flag);
  }

  return { group, clear: [pitchRect(f, 3)], merge: false, occlude: false };
}
