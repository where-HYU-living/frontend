import * as THREE from 'three';
import { HDRLoader } from 'three/examples/jsm/loaders/HDRLoader.js';
import { CSS2DRenderer } from 'three/examples/jsm/renderers/CSS2DRenderer.js';
import { makeHeightFn, SegIndex, pointInPoly, mergeStatic } from './util.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { makeSplat, makeTerrain } from './terrain.js';
import { makeBuildings } from './buildings.js';
import { makeTrees, makePines } from './trees.js';
import { makeHero, makeHeroProps } from './hero.js';
import { makeSite } from './site.js';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { GTAOPass } from 'three/examples/jsm/postprocessing/GTAOPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { makeAmphitheater, makeStationExits, makeLabel, makeProps } from './landmarks.js';
import { makeLion } from './landmarks/lion.js';
import { Player } from './player.js';

const fill = document.getElementById('loading-fill');
const T0 = performance.now(), marks = [];
const progress = (p, tag) => { fill.style.width = `${Math.round(p * 100)}%`; if (tag) marks.push([tag, Math.round(performance.now() - T0)]); };

// ---- 렌더러
const app = document.getElementById('app');
const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5)); // 성능: 레티나 2배 → 1.5배
renderer.setSize(innerWidth, innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
app.appendChild(renderer.domElement);
const labelRenderer = new CSS2DRenderer();
labelRenderer.setSize(innerWidth, innerHeight);
Object.assign(labelRenderer.domElement.style, { position: 'fixed', inset: '0', pointerEvents: 'none' });
app.appendChild(labelRenderer.domElement);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(55, innerWidth / innerHeight, 0.3, 3000);
scene.fog = new THREE.FogExp2(0xc9d7e4, 0.0026);

// ---- 하늘·빛 (봄 오후 — 해가 서남쪽: 사자상 정면을 비춤)
const hemi = new THREE.HemisphereLight(0xdfeaff, 0x56613f, 0.6);
scene.add(hemi);
const sun = new THREE.DirectionalLight(0xfff1dc, 3.0);
const sunDir = new THREE.Vector3(-0.62, 0.66, 0.42).normalize();
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
Object.assign(sun.shadow.camera, { left: -70, right: 70, top: 70, bottom: -70, near: 1, far: 400 });
sun.shadow.bias = -0.0004;
sun.shadow.normalBias = 0.04;
scene.add(sun, sun.target);

function flatten(t, [cx, cz], r, fall) {
  const h0 = makeHeightFn(t)(cx, cz);
  for (let j = 0; j < t.h; j++) for (let i = 0; i < t.w; i++) {
    const x = t.minX + i * t.step, z = t.minZ + j * t.step, d = Math.hypot(x - cx, z - cz);
    if (d > r + fall) continue;
    const k = d < r ? 1 : 1 - (d - r) / fall;
    const s = k * k * (3 - 2 * k);
    t.data[j * t.w + i] = t.data[j * t.w + i] * (1 - s) + h0 * s;
  }
}

async function boot() {
  const world = await (await fetch('/world.json')).json();
  progress(0.1, 'world');
  // 사자상 앞 잔디밭은 실제로 평평함 → 거친 지형 데이터를 그 주변만 평평하게
  flatten(world.terrain, world.landmarks.find((l) => l.key === 'lion').p, 10, 14);
  const heightAt = makeHeightFn(world.terrain);

  const pmrem = new THREE.PMREMGenerator(renderer);
  const [hdr, bg] = await Promise.all([
    new HDRLoader().loadAsync('/env/sky_1k.hdr'),
    new THREE.TextureLoader().loadAsync('/env/sky_bg.jpg'),
  ]);
  scene.environment = pmrem.fromEquirectangular(hdr).texture;
  scene.environmentIntensity = 0.8;
  bg.mapping = THREE.EquirectangularReflectionMapping;
  bg.colorSpace = THREE.SRGBColorSpace;
  scene.background = bg;
  scene.backgroundBlurriness = 0.0;
  progress(0.25, 'sky');

  const lm = Object.fromEntries(world.landmarks.map((l) => [l.key, l]));
  const amphB = world.buildings.find((b) => b.id === lm.amph.bid);
  const plaza = { p: lm.lion.p, r: 9, kind: 'grass' };

  // 바닥
  // 사자상 광장 (회색 화강석 블록) — 2026-07 로드뷰 기준: 105 학생복지관 · 104 애지문 · 사자상 화단 · 102 본관 계단 사이
  const plazaPoly = [[-49, -12], [-15, -16], [-14, -30], [-8, -44], [12, -37], [14, -26], [6, -12], [-1, 5], [-9, 16], [-20, 42], [-49, 42]];
  const splat = makeSplat(world, [plaza], [plazaPoly]);
  const { mesh: terrain, outer } = await makeTerrain(world, splat.canvas, splat.plaza);
  scene.add(terrain, outer);
  progress(0.45, 'terrain');

  // 건물 (노천극장은 별도 조형으로 대체)
  // 주인공 건물(101·102·104·105)은 사진 보고 따로 만든 모델로
  const hero = await makeHero(world, heightAt, lm.lion.p);
  // ---- 구역 플러그인: src/zones/*.js (구역마다 파일 하나 — docs: src/zones/README.md)
  const zones = await loadZones({ THREE, world, heightAt, lm, scene, renderer });
  const zoneSkip = zones.flatMap((z) => z.skipIds || []);
  const zoneReplace = new Set(zones.flatMap((z) => z.replace || []));
  const special = { skip: new Set([lm.amph.bid, ...hero.ids, ...zoneSkip]) };
  const { group: buildings, index: bIndex, info: bInfo } = await makeBuildings(world, heightAt, special);
  for (const [id, inf] of hero.info) { bIndex.add(inf.pts, { id }); bInfo.set(id, inf); }
  for (const z of zones) {
    for (const f of z.footprints || []) { bIndex.add(f.pts, { id: f.id }); bInfo.set(f.id, f); }
    if (z.group) { if (z.merge !== false) mergeStatic(z.group, mergeGeometries); (z.occlude === false ? scene : buildings).add(z.group); }
  }
  if (hero.info.has(lm.aeji.bid)) lm.aeji.p = hero.info.get(lm.aeji.bid).center; // 옮긴 애지문 위치로 라벨·메뉴
  console.log('hero merge', mergeStatic(hero.group, mergeGeometries));
  buildings.add(hero.group);
  scene.add(buildings);
  // 옹벽·석축·계단 (국토지리정보원 수치지도)
  const site = await makeSite(world, heightAt);
  scene.add(site.group);
  console.log(`옹벽 ${site.walls}, 계단 ${site.stairs}`);
  progress(0.6, 'buildings+site');

  // 길 색인
  const roadIdx = new SegIndex(20);
  for (const r of world.roads) for (let i = 1; i < r.pts.length; i++) roadIdx.add(r.pts[i - 1], r.pts[i], r.w);
  const nearestRoadDir = (x, z) => {
    let best = null, bd = Infinity;
    for (const r of world.roads) for (let i = 1; i < r.pts.length; i++) {
      const a = r.pts[i - 1], b = r.pts[i], dx = b[0] - a[0], dz = b[1] - a[1], L = dx * dx + dz * dz || 1;
      const t = Math.max(0, Math.min(1, ((x - a[0]) * dx + (z - a[1]) * dz) / L));
      const px = a[0] + dx * t, pz = a[1] + dz * t, d = Math.hypot(px - x, pz - z);
      if (d < bd) { bd = d; best = [px - x, pz - z]; }
    }
    return best && bd > 0.1 ? best : [0, 1];
  };

  // 랜드마크
  // 사자상은 역사관 정면 계단 앞에서 광장(서쪽)을 바라봄
  // (lion.js 의 조각 모델은 머리가 진행 방향에서 90° 돌아가 있어, 서쪽을 보게 하려면 남쪽 벡터를 넘김)
  const lion = await makeLion(lm.lion.p, heightAt, [0.08, 1]);
  progress(0.62, 'lion');
  const amph = zoneReplace.has('amph') ? { group: new THREE.Group() } : await makeAmphitheater(amphB.pts, heightAt);
  progress(0.64, 'amph');
  // 한양대역 2번 출구 = 애지문 (hero.js 에서 캐노피·계단으로 만듦) → 일반 출구 모형에서 뺌
  const aejiC = lm.aeji.p;
  const exits = makeStationExits(world.exits.filter((e) => !(e.ref === '2' && Math.hypot(e.p[0] - aejiC[0], e.p[1] - aejiC[1]) < 30)), heightAt, nearestRoadDir);
  for (const o of [lion, amph.group, exits]) mergeStatic(o, mergeGeometries);
  scene.add(lion, amph.group, exits);
  const props = makeProps(world, heightAt, bIndex, plaza);
  mergeStatic(props, mergeGeometries);
  scene.add(props);
  { const hp = makeHeroProps(world, heightAt, lm.lion.p); console.log('props merge', mergeStatic(hp, mergeGeometries)); scene.add(hp); }
  // 소나무 (사자상 화단·역사관 앞·애지문 옆)
  { const pn = makePines([[9, 9, 1.15], [13, -9, 1.0], [18, 16, 0.9], [-6, -10, 0.85], [-50, 15, 1.0], [-31, 38, 1.05], [-52, 30, 0.9]], heightAt); mergeStatic(pn, mergeGeometries); scene.add(pn); }
  // 광장 바닥 글씨 HANYANG UNIVERSITY (화강석 상감)
  {
    const c = document.createElement('canvas'); c.width = 2048; c.height = 160;
    const g = c.getContext('2d'); g.fillStyle = 'rgba(70,72,74,.88)'; g.font = 'bold 140px "Times New Roman", serif'; g.textAlign = 'center';
    g.fillText('HANYANG UNIVERSITY', 1024, 132);
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
    const geo = new THREE.PlaneGeometry(16, 1.25, 16, 1); geo.rotateX(-Math.PI / 2); geo.rotateY(-Math.PI / 2);
    const cx = lm.lion.p[0] - 12.5, cz = lm.lion.p[1] - 1;
    const pa = geo.attributes.position;
    for (let k = 0; k < pa.count; k++) pa.setY(k, heightAt(cx + pa.getX(k), cz + pa.getZ(k)) + 0.04);
    const m = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ map: t, transparent: true, roughness: 0.5, polygonOffset: true, polygonOffsetFactor: -2 }));
    m.position.set(cx, 0, cz); m.receiveShadow = true; scene.add(m);
  }
  progress(0.7, 'lion+props');

  // 나무 (사자상 광장·노천극장 객석은 비움)
  const blockIdx = {
    hit: (x, z, pad) => bIndex.hit(x, z, pad) || Math.hypot(x - plaza.p[0], z - plaza.p[1]) < plaza.r + 1 || pointInPoly(x, z, amphB.pts) || pointInPoly(x, z, plazaPoly) || hero.clear.some((q) => pointInPoly(x, z, q)) || zones.some((zn) => (zn.clear || []).some((q) => pointInPoly(x, z, q))),
  };
  const trees = await makeTrees(world, heightAt, blockIdx, roadIdx, scene);
  progress(0.9, 'trees');

  // 라벨
  const labelInfo = [
    ['lion', '사자상', 'Lions', 7.5],
    ['main', '본관', '102', null],
    ['history', '역사관', '101', null],
    ['aeji', '애지문 · 한양대역', '104 · 2번 출구', null],
    ['amph', '노천극장', '209', 6],
  ];
  const labels = [];
  for (const [key, name, sub, hOff] of labelInfo) {
    const l = lm[key];
    const top = l.bid && bInfo.get(l.bid) ? bInfo.get(l.bid).top + 3 : heightAt(l.p[0], l.p[1]) + (hOff || 6);
    const obj = makeLabel(name, sub);
    obj.position.set(l.p[0], top, l.p[1]);
    scene.add(obj);
    labels.push(obj);
  }

  // 플레이어
  const collide = (x, z) => bIndex.hit(x, z, 0.35) || lionHit(x, z);
  const lionHit = (x, z) => Math.hypot(x - lm.lion.p[0], z - lm.lion.p[1]) < 2.1;
  const player = new Player({ scene, camera, dom: renderer.domElement, heightAt, collide, bounds: world.bounds });
  player.occluders = [buildings];
  const spawn = lm.station.p;
  player.teleport(spawn[0] + 4, spawn[1] - 6, lm.lion.p[0], lm.lion.p[1]);

  // 랜드마크 메뉴
  const list = document.getElementById('landmark-list');
  lm.aeji.name = '애지문 (한양대역 2번 출구)';
  const order = ['aeji', 'lion', 'main', 'history', 'amph'];
  order.forEach((key, i) => {
    const l = lm[key];
    const btn = document.createElement('button');
    btn.innerHTML = `<span class="n">${i + 1}</span>${l.name}`;
    btn.onclick = () => {
      // 랜드마크 앞 빈자리 찾기
      const [lx, lz] = l.p;
      for (let r = 10; r < 60; r += 4) for (let a = 0; a < 16; a++) {
        const ang = (a / 16) * Math.PI * 2 + 0.6;
        const x = lx + Math.cos(ang) * r, z = lz + Math.sin(ang) * r;
        if (!collide(x, z) && !pointInPoly(x, z, amphB.pts)) { player.teleport(x, z, lx, lz); return; }
      }
    };
    list.appendChild(btn);
  });
  document.getElementById('attrib').textContent = world.attribution;
  // 시작: 사자상 정면 (서쪽 광장에서 동쪽을 봄 — 뒤로 역사관, 오른쪽 뒤로 애지문·한양대역)
  const heroShot = () => { player.teleport(lm.lion.p[0] - 13, lm.lion.p[1] + 1.5, lm.lion.p[0], lm.lion.p[1]); player.dist = 19; player.pitch = 0.17; };
  { const btn = document.createElement('button'); btn.innerHTML = '<span class="n">★</span>사자상 정면'; btn.onclick = heroShot; list.prepend(btn); }
  heroShot();
  // URL 로 카메라 지정 (스크린샷·디버그용): ?cam=x,z,tx,tz[,dist[,pitch]]  또는  ?go=209 (건물 번호)
  {
    const q = new URLSearchParams(location.search);
    if (q.get('cam')) {
      const [x, z, tx, tz, dist, pitch] = q.get('cam').split(',').map(Number);
      player.teleport(x, z, tx, tz); if (dist) player.dist = dist; if (pitch != null && !isNaN(pitch)) player.pitch = pitch;
    } else if (q.get('go')) {
      const b = world.buildings.find((b) => b.no === q.get('go'));
      if (b) {
        const cx = b.pts.reduce((a, p) => a + p[0], 0) / b.pts.length, cz = b.pts.reduce((a, p) => a + p[1], 0) / b.pts.length;
        for (let r = 25; r < 90; r += 5) { let done = false; for (let a = 0; a < 16 && !done; a++) { const ang = (a / 16) * Math.PI * 2; const x = cx + Math.cos(ang) * r, zz = cz + Math.sin(ang) * r; if (!collide(x, zz)) { player.teleport(x, zz, cx, cz); player.dist = 30; player.pitch = 0.3; done = true; } } if (done) break; }
      }
    }
  }

  // 미니맵
  const mm = document.getElementById('minimap');
  const mg = mm.getContext('2d');
  const mmBase = document.createElement('canvas');
  mmBase.width = mm.width; mmBase.height = mm.height;
  {
    const g = mmBase.getContext('2d');
    g.fillStyle = '#6b4c2e'; g.fillRect(0, 0, mm.width, mm.height);
    const { minX, maxX, minZ, maxZ } = world.bounds;
    const sx = mm.width / (maxX - minX), sz = mm.height / (maxZ - minZ);
    const M = ([x, z]) => [(x - minX) * sx, (z - minZ) * sz];
    for (const a of world.areas) {
      g.fillStyle = a.cls === 'forest' ? '#8c4a24' : a.cls === 'grass' ? '#9a8a45' : '#7a5a3a';
      g.beginPath(); a.pts.forEach((p, i) => (i ? g.lineTo(...M(p)) : g.moveTo(...M(p)))); g.closePath(); g.fill();
    }
    g.lineCap = 'round'; g.lineJoin = 'round';
    for (const r of world.roads) {
      g.strokeStyle = r.kind === 'road' ? '#3b3632' : '#d9b48a';
      g.lineWidth = Math.max(0.8, r.w * sx * (r.kind === 'road' ? 1.2 : 1.6));
      g.beginPath(); r.pts.forEach((p, i) => (i ? g.lineTo(...M(p)) : g.moveTo(...M(p)))); g.stroke();
    }
    g.fillStyle = 'rgba(30,26,22,.85)';
    for (const b of world.buildings) {
      g.beginPath(); b.pts.forEach(([x, z], i) => (i ? g.lineTo((x - minX) * sx, (z - minZ) * sz) : g.moveTo((x - minX) * sx, (z - minZ) * sz))); g.closePath(); g.fill();
    }
    g.fillStyle = '#ffd29a';
    for (const l of world.landmarks) { g.beginPath(); g.arc((l.p[0] - minX) * sx, (l.p[1] - minZ) * sz, 2.5, 0, Math.PI * 2); g.fill(); }
  }
  mm.addEventListener('click', (e) => {
    const r = mm.getBoundingClientRect();
    const { minX, maxX, minZ, maxZ } = world.bounds;
    const x = minX + ((e.clientX - r.left) / r.width) * (maxX - minX), z = minZ + ((e.clientY - r.top) / r.height) * (maxZ - minZ);
    if (!collide(x, z)) player.teleport(x, z);
  });
  const drawMinimap = () => {
    const { minX, maxX, minZ, maxZ } = world.bounds;
    mg.drawImage(mmBase, 0, 0);
    const px = ((player.pos.x - minX) / (maxX - minX)) * mm.width, pz = ((player.pos.z - minZ) / (maxZ - minZ)) * mm.height;
    mg.save(); mg.translate(px, pz); mg.rotate(-player.heading + Math.PI);
    mg.fillStyle = '#fff'; mg.strokeStyle = '#0e4a84'; mg.lineWidth = 2;
    mg.beginPath(); mg.moveTo(0, -7); mg.lineTo(5, 5); mg.lineTo(0, 2); mg.lineTo(-5, 5); mg.closePath(); mg.fill(); mg.stroke();
    mg.restore();
  };

  progress(1, 'labels+player');
  setTimeout(() => document.getElementById('loading').classList.add('done'), 250);

  // ---- 후처리: 주변광 차폐(GTAO) — 건물 모서리·처마·계단 틈에 자연스러운 그늘
  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  const ao = new GTAOPass(scene, camera, innerWidth, innerHeight);
  ao.updateGtaoMaterial({ radius: 1.2, distanceExponent: 1.5, thickness: 2, scale: 1.1 });
  ao.blendIntensity = 0.85;
  composer.addPass(ao);
  composer.addPass(new OutputPass());
  addEventListener('resize', () => composer.setSize(innerWidth, innerHeight));
  const useAO = !/noao/.test(location.search);

  // ---- 루프
  const clock = new THREE.Clock();
  let mmTick = 0;
  renderer.setAnimationLoop(() => {
    const dt = Math.min(0.05, clock.getDelta());
    player.update(dt);
    sun.position.copy(player.pos).addScaledVector(sunDir, 160);
    sun.target.position.copy(player.pos);
    for (const l of labels) {
      const d = l.position.distanceTo(camera.position);
      l.element.style.opacity = d < 320 ? 1 : 0;
    }
    if ((mmTick += dt) > 0.1) { mmTick = 0; drawMinimap(); }
    if (useAO) composer.render(); else renderer.render(scene, camera);
    labelRenderer.render(scene, camera);
  });
  console.table(marks);
  window.__ready = true;
  window.__proto = { marks, zones, world, player, trees, renderer, scene, camera, heroShot };
  console.log(`trees: ${trees.count}, buildings: ${buildings.children.length}`);
}

addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
  labelRenderer.setSize(innerWidth, innerHeight);
});

// 구역 플러그인 불러오기 — 파일 하나가 깨져도 나머지는 뜨게 (개별 try/catch)
async function loadZones(ctx) {
  const mods = /nozones/.test(location.search) ? [] : Object.entries(import.meta.glob('./zones/*.js')).sort();
  const run = async ([path, load], prior) => {
    try {
      const m = await load();
      if (typeof m.default !== 'function') return null;
      const t = performance.now();
      const r = (await m.default({ ...ctx, prior })) || {};
      console.log(`zone ${path}: ${Math.round(performance.now() - t)}ms`);
      return { name: path, ...r };
    } catch (e) { console.error(`zone ${path} 실패`, e); return null; }
  };
  // 성능: 건물 구역들은 동시에 (텍스처 로딩이 겹침), 길(roads)은 다른 구역 광장을 피해야 해서 마지막에
  const isRoads = ([p]) => /roads\.js$/.test(p);
  const out = (await Promise.all(mods.filter((m) => !isRoads(m)).map((m) => run(m, [])))).filter(Boolean);
  for (const m of mods.filter(isRoads)) { const r = await run(m, out); if (r) out.push(r); }
  return out;
}

boot().catch((e) => {
  console.error(e);
  document.querySelector('.loading-sub').textContent = '불러오기 실패: ' + e.message;
});
