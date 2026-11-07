import * as THREE from 'three';

// 과잠 입은 한양대생 (단순화한 귀여운 캐릭터)
function makeStudent() {
  const g = new THREE.Group();
  const skin = new THREE.MeshStandardMaterial({ color: 0xf2c9a5, roughness: 0.7 });
  const jacket = new THREE.MeshStandardMaterial({ color: 0x141f3c, roughness: 0.85 });
  const sleeve = new THREE.MeshStandardMaterial({ color: 0xf3efe6, roughness: 0.8 });
  const pants = new THREE.MeshStandardMaterial({ color: 0x3b64a0, roughness: 0.9 }); // 청바지
  const hair = new THREE.MeshStandardMaterial({ color: 0x2a1d16, roughness: 0.6 });
  const shoe = new THREE.MeshStandardMaterial({ color: 0xf5f5f0, roughness: 0.6 });

  const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.27, 0.32, 6, 14), jacket);
  torso.position.y = 0.92; torso.scale.set(1.12, 1, 1.0);
  // 등판: 아치형 HANYANG / UNIV. / 사자 / Since 1939
  const W = 512, H = 512;
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  const cg = c.getContext('2d'); cg.fillStyle = '#f3efe6'; cg.strokeStyle = '#f3efe6'; cg.textAlign = 'center'; cg.textBaseline = 'middle';
  cg.font = '900 96px Pretendard, Arial Black, sans-serif';
  const word = 'HANYANG', R = 290, span = 1.75, cx = W / 2, cy = 345;
  for (let i = 0; i < word.length; i++) {
    const a = -span / 2 + (span * (i + 0.5)) / word.length;
    cg.save(); cg.translate(cx + Math.sin(a) * R, cy - Math.cos(a) * R); cg.rotate(a); cg.fillText(word[i], 0, 0); cg.restore();
  }
  cg.font = '900 88px Pretendard, Arial Black, sans-serif'; cg.fillText('UNIV.', cx, 170);
  // 사자: 참고 이미지(public/tex/lion-patch.png)를 불러와 등판에 합성
  const lionImg = new Image();
  lionImg.onload = () => { cg.drawImage(lionImg, cx - 105, 218, 210, 186); tex.needsUpdate = true; };
  lionImg.src = `${import.meta.env.BASE_URL}tex/lion-patch.png`;
  cg.font = 'italic 44px Georgia, serif'; cg.fillText('Since 1939', cx, 458);
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4;
  const arc = 0.56 / 0.272;
  const letters = new THREE.Mesh(new THREE.CylinderGeometry(0.273, 0.273, 0.54, 24, 1, true, Math.PI - arc / 2, arc), new THREE.MeshStandardMaterial({ map: tex, transparent: true, roughness: 0.85, side: THREE.FrontSide }));
  letters.position.y = 0.95; letters.scale.set(1.12, 1, 1);
  // 흰 줄 들어간 리브 (목깃·밑단)
  const rib = (r, y) => { const g2 = new THREE.Group(); const t = new THREE.Mesh(new THREE.TorusGeometry(r, 0.03, 8, 24), jacket); t.rotation.x = Math.PI / 2; const w = new THREE.Mesh(new THREE.TorusGeometry(r, 0.012, 6, 24), sleeve); w.rotation.x = Math.PI / 2; w.position.y = 0.0; w.scale.set(1.02, 1.02, 1); g2.add(t, w); g2.position.y = y; return g2; };
  // 앞판: 왼가슴 H 패치 + 단추
  const hc = document.createElement('canvas'); hc.width = 128; hc.height = 128;
  const hg = hc.getContext('2d'); hg.fillStyle = '#f3efe6'; hg.fillRect(8, 8, 112, 112); hg.fillStyle = '#141f3c'; hg.font = '900 100px Pretendard, Arial Black, sans-serif'; hg.textAlign = 'center'; hg.textBaseline = 'middle'; hg.fillText('H', 64, 70);
  const htex = new THREE.CanvasTexture(hc); htex.colorSpace = THREE.SRGBColorSpace;
  const harc = 0.13 / 0.272;
  const hPatch = new THREE.Mesh(new THREE.CylinderGeometry(0.274, 0.274, 0.13, 12, 1, true, -harc / 2, harc), new THREE.MeshStandardMaterial({ map: htex, roughness: 0.85 }));
  hPatch.position.y = 1.08; hPatch.rotation.y = 0.5; hPatch.scale.set(1.12, 1, 1);
  const btnMat = new THREE.MeshStandardMaterial({ color: 0xf3efe6, roughness: 0.5 });
  const buttons = [1.14, 1.0, 0.86, 0.72].map((y) => { const b = new THREE.Mesh(new THREE.SphereGeometry(0.022, 8, 6), btnMat); b.position.set(0, y, 0.272 * 1.0 + 0.004); return b; });
  const collar = rib(0.21, 1.3), hem = rib(0.235, 0.66);

  const head = new THREE.Mesh(new THREE.SphereGeometry(0.34, 24, 18), skin);
  head.position.y = 1.55;
  const hairCap = new THREE.Mesh(new THREE.SphereGeometry(0.36, 24, 18, 0, Math.PI * 2, 0, Math.PI * 0.55), hair);
  hairCap.position.y = 1.58; hairCap.rotation.x = -0.25;
  const eyes = [-1, 1].map((s) => { const e = new THREE.Mesh(new THREE.SphereGeometry(0.035, 8, 6), new THREE.MeshStandardMaterial({ color: 0x1b1410 })); e.position.set(0.11 * s, 1.55, 0.31); return e; });

  const limb = (r, len, mat) => { const m = new THREE.Mesh(new THREE.CapsuleGeometry(r, len, 4, 10), mat); m.position.y = -len / 2 - r * 0.5; const pivot = new THREE.Group(); pivot.add(m); return pivot; };
  const armL = limb(0.105, 0.36, sleeve), armR = limb(0.105, 0.36, sleeve);
  armL.position.set(-0.36, 1.18, 0); armR.position.set(0.36, 1.18, 0);
  const cuffMat = jacket; for (const a of [armL, armR]) { const cf = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.11, 0.07, 12), cuffMat); cf.position.y = -0.4; a.add(cf); }
  const legL = limb(0.1, 0.38, pants), legR = limb(0.1, 0.38, pants);
  legL.position.set(-0.13, 0.62, 0); legR.position.set(0.13, 0.62, 0);
  const sole = new THREE.MeshStandardMaterial({ color: 0xd8d6cf, roughness: 0.8 });
  for (const l of [legL, legR]) {
    const s = new THREE.Mesh(new THREE.SphereGeometry(1, 14, 10), shoe); s.scale.set(0.115, 0.075, 0.18); s.position.set(0, -0.545, 0.06);
    const so = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.03, 0.34), sole); so.position.set(0, -0.605, 0.06);
    l.add(s, so);
  }
  g.add(torso, letters, hPatch, ...buttons, collar, hem, head, hairCap, ...eyes, armL, armR, legL, legR);
  g.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  g.userData = { armL, armR, legL, legR, head };
  return g;
}

export class Player {
  constructor({ scene, camera, dom, heightAt, collide, bounds }) {
    this.scene = scene; this.camera = camera; this.heightAt = heightAt; this.collide = collide; this.bounds = bounds;
    this.mesh = makeStudent();
    scene.add(this.mesh);
    this.pos = new THREE.Vector3();
    this.heading = 0;
    this.speed = 0;
    this.phase = 0;
    this.yaw = Math.PI * 0.85; this.pitch = 0.32; this.dist = 10;
    this.keys = new Set();
    this.joy = { x: 0, y: 0 };
    this.camPos = new THREE.Vector3();
    this.ray = new THREE.Raycaster();
    this.occluders = null;
    this.offs = [];
    this.#bind(dom);
  }
  // 모든 입력 리스너를 지운다 (R3F 재마운트·HMR 에서 입력이 중복되지 않게)
  dispose() { for (const off of this.offs) off(); this.offs = []; this.keys.clear(); }
  #bind(dom) {
    const on = (t, type, fn, opts) => { t.addEventListener(type, fn, opts); this.offs.push(() => t.removeEventListener(type, fn, opts)); };
    on(window, 'keydown', (e) => { if (e.target.tagName === 'INPUT') return; this.keys.add(e.code); });
    on(window, 'keyup', (e) => this.keys.delete(e.code));
    on(window, 'blur', () => this.keys.clear());
    let drag = null;
    on(dom, 'pointerdown', (e) => { if (e.pointerType === 'touch' && e.clientX < 180 && e.clientY > innerHeight - 220) return; drag = { x: e.clientX, y: e.clientY, id: e.pointerId }; dom.setPointerCapture(e.pointerId); });
    on(dom, 'pointermove', (e) => {
      if (!drag || e.pointerId !== drag.id) return;
      this.yaw -= (e.clientX - drag.x) * 0.006;
      this.pitch = Math.max(0.05, Math.min(1.25, this.pitch + (e.clientY - drag.y) * 0.004));
      drag.x = e.clientX; drag.y = e.clientY;
    });
    on(dom, 'pointerup', () => (drag = null));
    on(dom, 'wheel', (e) => { this.dist = Math.max(3.5, Math.min(60, this.dist * (1 + e.deltaY * 0.001))); e.preventDefault(); }, { passive: false });

    // 터치 조이스틱
    const base = document.getElementById('joystick'), knob = document.getElementById('joystick-knob');
    if (base) {
      let id = null;
      const move = (e) => {
        const r = base.getBoundingClientRect();
        let dx = e.clientX - (r.left + r.width / 2), dy = e.clientY - (r.top + r.height / 2);
        const L = Math.hypot(dx, dy), M = 42;
        if (L > M) { dx *= M / L; dy *= M / L; }
        knob.style.transform = `translate(${dx}px, ${dy}px)`;
        this.joy = { x: dx / M, y: -dy / M };
      };
      on(base, 'pointerdown', (e) => { id = e.pointerId; base.setPointerCapture(id); move(e); });
      on(base, 'pointermove', (e) => e.pointerId === id && move(e));
      const end = () => { id = null; knob.style.transform = ''; this.joy = { x: 0, y: 0 }; };
      on(base, 'pointerup', end); on(base, 'pointercancel', end);
    }
  }
  teleport(x, z, faceX, faceZ) {
    this.pos.set(x, this.heightAt(x, z), z);
    if (faceX !== undefined) {
      this.heading = Math.atan2(faceX - x, faceZ - z);
      this.yaw = this.heading + Math.PI;
    }
    this.camPos.set(0, 0, 0);
  }
  update(dt) {
    const k = this.keys;
    let ix = (k.has('KeyD') || k.has('ArrowRight') ? 1 : 0) - (k.has('KeyA') || k.has('ArrowLeft') ? 1 : 0) + this.joy.x;
    let iz = (k.has('KeyW') || k.has('ArrowUp') ? 1 : 0) - (k.has('KeyS') || k.has('ArrowDown') ? 1 : 0) + this.joy.y;
    const mag = Math.min(1, Math.hypot(ix, iz));
    const run = k.has('ShiftLeft') || k.has('ShiftRight') || Math.hypot(this.joy.x, this.joy.y) > 0.95;
    const target = mag > 0.05 ? (run ? 7.5 : 4.2) * mag : 0;
    this.speed += (target - this.speed) * Math.min(1, dt * 8);
    if (mag > 0.05) {
      // 카메라 기준 앞/옆
      const fwdX = -Math.sin(this.yaw), fwdZ = -Math.cos(this.yaw);
      const rx = -fwdZ, rz = fwdX;
      const dx = fwdX * iz + rx * ix, dz = fwdZ * iz + rz * ix;
      const want = Math.atan2(dx, dz);
      let d = want - this.heading;
      d = Math.atan2(Math.sin(d), Math.cos(d));
      this.heading += d * Math.min(1, dt * 10);
    }
    if (this.speed > 0.01) {
      const sx = Math.sin(this.heading) * this.speed * dt, sz = Math.cos(this.heading) * this.speed * dt;
      const b = this.bounds;
      const nx = Math.max(b.minX + 2, Math.min(b.maxX - 2, this.pos.x + sx));
      const nz = Math.max(b.minZ + 2, Math.min(b.maxZ - 2, this.pos.z + sz));
      if (!this.collide(nx, nz)) { this.pos.x = nx; this.pos.z = nz; }
      else if (!this.collide(nx, this.pos.z)) this.pos.x = nx;
      else if (!this.collide(this.pos.x, nz)) this.pos.z = nz;
    }
    const gy = this.heightAt(this.pos.x, this.pos.z);
    this.pos.y += (gy - this.pos.y) * Math.min(1, dt * 14);

    // 걷기 애니메이션
    const u = this.mesh.userData;
    this.phase += dt * this.speed * 2.4;
    const amp = Math.min(1, this.speed / 4.2) * 0.7;
    u.armL.rotation.x = Math.sin(this.phase) * amp; u.armR.rotation.x = -Math.sin(this.phase) * amp;
    u.legL.rotation.x = -Math.sin(this.phase) * amp; u.legR.rotation.x = Math.sin(this.phase) * amp;
    this.mesh.position.set(this.pos.x, this.pos.y + Math.abs(Math.sin(this.phase)) * 0.06 * amp, this.pos.z);
    this.mesh.rotation.y = this.heading;
    u.head.rotation.z = Math.sin(this.phase * 0.5) * 0.04 * amp;

    // 3인칭 카메라
    const tgt = new THREE.Vector3(this.pos.x, this.pos.y + 1.4, this.pos.z);
    const cp = new THREE.Vector3(
      tgt.x + Math.sin(this.yaw) * Math.cos(this.pitch) * this.dist,
      tgt.y + Math.sin(this.pitch) * this.dist,
      tgt.z + Math.cos(this.yaw) * Math.cos(this.pitch) * this.dist
    );
    const floor = this.heightAt(cp.x, cp.z) + 0.6;
    if (cp.y < floor) cp.y = floor;
    // 건물에 카메라가 파묻히지 않도록
    if (this.occluders) {
      const dir = cp.clone().sub(tgt);
      const len = dir.length();
      this.ray.set(tgt, dir.normalize());
      this.ray.far = len;
      const hit = this.ray.intersectObjects(this.occluders, true)[0];
      if (hit) cp.copy(tgt).addScaledVector(dir, Math.max(1.2, hit.distance - 0.6));
    }
    if (this.camPos.lengthSq() === 0) this.camPos.copy(cp);
    this.camPos.lerp(cp, Math.min(1, dt * 6));
    this.camera.position.copy(this.camPos);
    this.camera.lookAt(tgt);
  }
}
