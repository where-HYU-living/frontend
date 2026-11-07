import * as THREE from 'three';
import { nearestDoor, doorPromptText } from './doors';
import { lampGlow, sampleLamps } from './streetlamps';

// 3D 월드 부가물: 정문 아치(B5) · 문 마커와 '들어가기' 안내(E1) · 밤 가로등(M2).
// buildWorld 가 한 번 만들고 frame(dt) 를 매 프레임 부른다. 입력 리스너는 dispose() 에서 모두 지운다.
export function makeExtras({ Q, scene, camera, world, heightAt, collide, player, bIndex, host }) {
  const offs = [];
  const on = (t, type, fn) => { t.addEventListener(type, fn); offs.push(() => t.removeEventListener(type, fn)); };

  // ---- 가로등 (InstancedMesh 1개: 기둥+전구를 정점 색으로). 품질 low 에서는 만들지 않는다
  let lamps = null;
  if (Q.streetlamps) {
    const spots = sampleLamps(world.roads, { spacing: 30, max: 500 }).filter(([x, z]) => !bIndex.hit(x, z, 0.6));
    const pole = new THREE.CylinderGeometry(0.06, 0.09, 4.4, 6); pole.translate(0, 2.2, 0);
    const bulb = new THREE.SphereGeometry(0.28, 8, 6); bulb.translate(0, 4.5, 0);
    const paint = (g, c) => { const a = new Float32Array(g.attributes.position.count * 3); for (let i = 0; i < a.length; i += 3) a.set(c, i); g.setAttribute('color', new THREE.BufferAttribute(a, 3)); return g; };
    const geo = mergeTwo(paint(pole, [0.16, 0.17, 0.19]), paint(bulb, [1.0, 0.8, 0.45]));
    const mat = new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false, fog: true });
    lamps = new THREE.InstancedMesh(geo, mat, spots.length);
    const m = new THREE.Matrix4();
    spots.forEach(([x, z], i) => { m.makeTranslation(x, heightAt(x, z), z); lamps.setMatrixAt(i, m); });
    lamps.instanceMatrix.needsUpdate = true; lamps.frustumCulled = false; lamps.visible = false;
    scene.add(lamps);
  }
  const setNight = (t) => {
    if (!lamps) return;
    const g = lampGlow(t);
    lamps.visible = g > 0.01;
    lamps.material.color.setScalar(g);
  };

  // ---- 정문·후문 아치
  const gateObjs = [];
  const roadTangent = (x, z) => {
    let best = [1, 0], bd = Infinity;
    for (const r of world.roads) for (let i = 1; i < r.pts.length; i++) {
      const a = r.pts[i - 1], b = r.pts[i], dx = b[0] - a[0], dz = b[1] - a[1], L = dx * dx + dz * dz || 1;
      const k = Math.max(0, Math.min(1, ((x - a[0]) * dx + (z - a[1]) * dz) / L));
      const d = Math.hypot(a[0] + dx * k - x, a[1] + dz * k - z);
      if (d < bd) { bd = d; best = [dx, dz]; }
    }
    const n = Math.hypot(best[0], best[1]) || 1;
    return [best[0] / n, best[1] / n];
  };
  const setGates = (items) => {
    for (const g of gateObjs) { scene.remove(g); g.traverse((o) => { o.geometry?.dispose(); o.material?.map?.dispose(); o.material?.dispose(); }); }
    gateObjs.length = 0;
    const blue = new THREE.MeshStandardMaterial({ color: 0x0e4a84, roughness: 0.55 });
    const white = new THREE.MeshStandardMaterial({ color: 0xf1f3f6, roughness: 0.6 });
    for (const it of items) {
      const g = new THREE.Group();
      const W = 9, H = 5.6;
      for (const s of [-1, 1]) { const p = new THREE.Mesh(new THREE.BoxGeometry(0.9, H, 0.9), blue); p.position.set(s * W / 2, H / 2, 0); p.castShadow = true; g.add(p); }
      const beam = new THREE.Mesh(new THREE.BoxGeometry(W + 1.4, 0.9, 1.1), blue); beam.position.y = H + 0.1; beam.castShadow = true; g.add(beam);
      const cap = new THREE.Mesh(new THREE.BoxGeometry(W + 2, 0.18, 1.4), white); cap.position.y = H + 0.65; g.add(cap);
      const c = document.createElement('canvas'); c.width = 512; c.height = 96;
      const cx = c.getContext('2d'); cx.fillStyle = '#0e4a84'; cx.fillRect(0, 0, 512, 96);
      cx.fillStyle = '#fff'; cx.font = 'bold 54px "Pretendard", system-ui, sans-serif'; cx.textAlign = 'center'; cx.textBaseline = 'middle'; cx.fillText(it.name.length > 12 ? it.name.slice(0, 12) : it.name, 256, 50);
      const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
      const sign = new THREE.Mesh(new THREE.PlaneGeometry(W - 1.6, 0.72), new THREE.MeshBasicMaterial({ map: tex, side: THREE.DoubleSide }));
      sign.position.set(0, H + 0.1, 0.57); g.add(sign);
      const back = sign.clone(); back.position.z = -0.57; back.rotation.y = Math.PI; g.add(back);
      // 아치 평면(가로 방향)이 길과 직각이 되도록: 로컬 x 축 = 길의 법선
      const [tx, tz] = roadTangent(it.x, it.z);
      g.rotation.y = Math.atan2(-tz, tx) + Math.PI / 2; // 로컬 z 축(아치를 통과하는 방향)이 길 접선과 같아진다
      g.position.set(it.x, heightAt(it.x, it.z), it.z);
      scene.add(g); gateObjs.push(g);
    }
  };

  // ---- 문 마커 + 안내
  let doors = []; // { id, x, z (서 있는 자리), fx, fz (건물 쪽), title, onEnter, mesh }
  const doorGeo = new THREE.BoxGeometry(1.1, 2.1, 0.12);
  const doorMat = new THREE.MeshBasicMaterial({ color: 0xffd27a, toneMapped: false });
  const glowMat = new THREE.MeshBasicMaterial({ color: 0xffb347, transparent: true, opacity: 0.22, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
  const beamGeo = new THREE.CylinderGeometry(0.5, 0.5, 14, 10, 1, true);
  const touch = matchMedia?.('(pointer: coarse)').matches ?? false;
  const prompt = document.createElement('button');
  prompt.type = 'button'; prompt.className = 'w3d-door-prompt'; prompt.hidden = true;
  host.appendChild(prompt);
  let current = null;
  const enter = () => { if (current) current.onEnter(); };
  on(prompt, 'click', (e) => { e.stopPropagation(); enter(); });
  on(window, 'keydown', (e) => {
    if (e.code !== 'KeyE' || e.repeat || !current) return;
    const tag = e.target?.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || e.ctrlKey || e.metaKey || e.altKey) return;
    enter();
  });
  const freeSpotNear = (x, z) => {
    if (!collide(x, z)) return [x, z];
    for (let r = 1.5; r <= 24; r += 1.5) for (let a = 0; a < 16; a++) {
      const ang = (a / 16) * Math.PI * 2, px = x + Math.cos(ang) * r, pz = z + Math.sin(ang) * r;
      if (!collide(px, pz)) return [px, pz];
    }
    return [x, z];
  };
  const clearDoors = () => { for (const d of doors) { scene.remove(d.mesh); d.mesh.traverse((o) => { if (o.userData.own) o.geometry.dispose(); }); } doors = []; current = null; prompt.hidden = true; };
  const setDoors = (items) => {
    clearDoors();
    for (const it of items) {
      const [x, z] = freeSpotNear(it.x, it.z);
      const g = new THREE.Group();
      const door = new THREE.Mesh(doorGeo, doorMat); door.position.y = 3.2;
      const halo = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 3.6), glowMat); halo.position.y = 3.2; halo.position.z = -0.05;
      const beam = new THREE.Mesh(beamGeo, glowMat); beam.position.y = 7;
      g.add(door, halo, beam);
      g.position.set(x, heightAt(x, z), z);
      scene.add(g);
      doors.push({ ...it, x, z, mesh: g, door });
    }
  };

  let tick = 0, time = 0;
  const frame = (dt) => {
    time += dt;
    for (const d of doors) { d.mesh.rotation.y = Math.atan2(camera.position.x - d.x, camera.position.z - d.z); d.door.position.y = 3.2 + Math.sin(time * 2 + d.x) * 0.12; }
    if ((tick += dt) < 0.12) return;
    tick = 0;
    const near = doors.length ? nearestDoor(doors, player.pos.x, player.pos.z) : null;
    if (near !== current) {
      current = near;
      prompt.hidden = !near;
      if (near) prompt.textContent = doorPromptText(near.title, touch);
    }
  };
  const dispose = () => { for (const f of offs) f(); offs.length = 0; clearDoors(); prompt.remove(); setGates([]); if (lamps) { scene.remove(lamps); lamps.geometry.dispose(); lamps.material.dispose(); } };
  return { setDoors, setGates, setNight, frame, dispose };
}

function mergeTwo(a, b) {
  const g = new THREE.BufferGeometry();
  for (const name of ['position', 'normal', 'color']) {
    const A = a.attributes[name].array, B = b.attributes[name].array, out = new Float32Array(A.length + B.length);
    out.set(A); out.set(B, A.length);
    g.setAttribute(name, new THREE.BufferAttribute(out, 3));
  }
  const ia = a.index.array, ib = b.index.array, off = a.attributes.position.count, idx = new Uint32Array(ia.length + ib.length);
  idx.set(ia); for (let i = 0; i < ib.length; i++) idx[ia.length + i] = ib[i] + off;
  g.setIndex(new THREE.BufferAttribute(idx, 1));
  return g;
}
