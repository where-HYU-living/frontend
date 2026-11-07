import * as THREE from 'three';

// 과잠 입은 한양대생 (단순화한 귀여운 캐릭터)
function makeStudent() {
  const g = new THREE.Group();
  const skin = new THREE.MeshStandardMaterial({ color: 0xf2c9a5, roughness: 0.7 });
  const jacket = new THREE.MeshStandardMaterial({ color: 0x0e4a84, roughness: 0.75 });
  const sleeve = new THREE.MeshStandardMaterial({ color: 0xf3efe6, roughness: 0.8 });
  const pants = new THREE.MeshStandardMaterial({ color: 0x2d2f36, roughness: 0.85 });
  const hair = new THREE.MeshStandardMaterial({ color: 0x2a1d16, roughness: 0.6 });
  const shoe = new THREE.MeshStandardMaterial({ color: 0xf5f5f0, roughness: 0.6 });
  const bag = new THREE.MeshStandardMaterial({ color: 0xc98a3c, roughness: 0.8 });

  const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.27, 0.32, 6, 14), jacket);
  torso.position.y = 0.92;
  // 등판 HYU 글자
  const c = document.createElement('canvas'); c.width = 256; c.height = 128;
  const cg = c.getContext('2d'); cg.fillStyle = '#f3efe6'; cg.font = 'bold 80px Pretendard, sans-serif'; cg.textAlign = 'center'; cg.textBaseline = 'middle'; cg.fillText('HYU', 128, 68);
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
  const letters = new THREE.Mesh(new THREE.PlaneGeometry(0.34, 0.17), new THREE.MeshStandardMaterial({ map: tex, transparent: true, roughness: 0.8 }));
  letters.position.set(0, 1.0, -0.28); letters.rotation.y = Math.PI;

  const head = new THREE.Mesh(new THREE.SphereGeometry(0.34, 24, 18), skin);
  head.position.y = 1.55;
  const hairCap = new THREE.Mesh(new THREE.SphereGeometry(0.36, 24, 18, 0, Math.PI * 2, 0, Math.PI * 0.55), hair);
  hairCap.position.y = 1.58; hairCap.rotation.x = -0.25;
  const eyes = [-1, 1].map((s) => { const e = new THREE.Mesh(new THREE.SphereGeometry(0.035, 8, 6), new THREE.MeshStandardMaterial({ color: 0x1b1410 })); e.position.set(0.11 * s, 1.55, 0.31); return e; });
  const pack = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.42, 0.18), bag);
  pack.position.set(0, 0.98, -0.32);

  const limb = (r, len, mat) => { const m = new THREE.Mesh(new THREE.CapsuleGeometry(r, len, 4, 10), mat); m.position.y = -len / 2 - r * 0.5; const pivot = new THREE.Group(); pivot.add(m); return pivot; };
  const armL = limb(0.085, 0.36, sleeve), armR = limb(0.085, 0.36, sleeve);
  armL.position.set(-0.33, 1.18, 0); armR.position.set(0.33, 1.18, 0);
  const legL = limb(0.1, 0.34, pants), legR = limb(0.1, 0.34, pants);
  legL.position.set(-0.13, 0.62, 0); legR.position.set(0.13, 0.62, 0);
  for (const l of [legL, legR]) { const s = new THREE.Mesh(new THREE.BoxGeometry(0.17, 0.09, 0.26), shoe); s.position.set(0, -0.6, 0.04); l.add(s); }
  g.add(torso, letters, head, hairCap, ...eyes, pack, armL, armR, legL, legR);
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
