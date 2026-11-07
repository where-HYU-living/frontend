import { inkFor } from '../lib/grade';
import * as THREE from 'three';
import { CSS2DObject } from 'three/examples/jsm/renderers/CSS2DRenderer.js';
import { HDRLoader } from 'three/examples/jsm/loaders/HDRLoader.js';
import { makeHeightFn, SegIndex, pointInPoly, mergeStatic } from '../util.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { makeSplat, makeTerrain } from '../terrain.js';
import { makeBuildings } from '../buildings.js';
import { makeTrees, makePines } from '../trees.js';
import { makeHero, makeHeroProps } from '../hero.js';
import { makeSite } from '../site.js';
import { makeAmphitheater, makeStationExits, makeLabel, makeProps } from '../landmarks.js';
import { makeLion } from '../landmarks/lion.js';
import { Player } from '../player.js';
import { makeCrowdStudent, lookKey } from './crowdStudent.js';
import { lightAt, starsAt } from './timeOfDay';
import { makeExtras } from './worldExtras.js';

// 장면 내용만 만든다 (렌더러 루프·후처리·리사이즈는 호출하는 쪽 몫: R3F WorldCanvas).
// 반환값의 frame(dt) 를 매 프레임 부르면 플레이어·태양·LOD·미니맵이 갱신된다.

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

export async function buildWorld({ Q, renderer, domElement, scene, camera, marks = [], progress = () => {}, worldUrl = '/world.json' }) {
  // ---- 안개·빛 (봄 오후 — 해가 서남쪽: 사자상 정면을 비춤)
  scene.fog = new THREE.FogExp2(0xc9d7e4, 0.0026);
  const hemi = new THREE.HemisphereLight(0xdfeaff, 0x56613f, 0.6);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xfff1dc, 3.0);
  const sunDir = new THREE.Vector3(-0.62, 0.66, 0.42).normalize();
  // 밤하늘 별 (카메라를 따라다니는 큰 구). 슬라이더가 밤 쪽일수록 또렷해진다
  const starGeo = new THREE.BufferGeometry();
  {
    const N = 700, pos = new Float32Array(N * 3);
    for (let i = 0; i < N; i++) {
      const u = Math.random(), v = Math.random() * 0.92 + 0.04; // 위쪽 반구
      const th = u * Math.PI * 2, ph = Math.acos(v), r = 1500;
      pos.set([r * Math.sin(ph) * Math.cos(th), r * Math.cos(ph), r * Math.sin(ph) * Math.sin(th)], i * 3);
    }
    starGeo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  }
  const starMat = new THREE.PointsMaterial({ color: 0xffffff, size: 2.2, sizeAttenuation: false, transparent: true, opacity: 0, fog: false, depthWrite: false });
  const stars = new THREE.Points(starGeo, starMat);
  stars.visible = false; stars.frustumCulled = false; stars.renderOrder = -1;
  scene.add(stars);
  // t: 0(낮) ~ 1(밤). 조명·안개·하늘 밝기·별이 같이 부드럽게 바뀐다
  let extras = null; // 정문·문 마커·가로등 (플레이어가 만들어진 뒤에 생성)
  let lastT = 0;
  const setTimeOfDay = (t) => {
    lastT = t;
    const L = lightAt(t);
    sun.intensity = L.sun; sun.color.setHex(L.sunColor); sunDir.set(...L.sunDir).normalize();
    hemi.intensity = L.hemi; scene.environmentIntensity = L.env; scene.backgroundIntensity = L.bg;
    scene.fog.color.setHex(L.fog); scene.fog.density = L.fogDensity;
    renderer.toneMappingExposure = L.exposure;
    starMat.opacity = starsAt(t); stars.visible = starMat.opacity > 0.01;
    extras?.setNight(t);
  };
  sun.castShadow = true;
  sun.shadow.mapSize.set(Q.shadowMap, Q.shadowMap);
  Object.assign(sun.shadow.camera, { left: -70, right: 70, top: 70, bottom: -70, near: 1, far: 400 });
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.04;
  scene.add(sun, sun.target);
  const world = await (await fetch(worldUrl)).json();
  // 동네 모드(집 주변 조각): 캠퍼스 전용 조형(사자상·hero·구역·노천극장·출입구)은 만들지 않는다
  const lite = !!world.site;
  progress(0.1, 'world');
  // 사자상 앞 잔디밭은 실제로 평평함 → 거친 지형 데이터를 그 주변만 평평하게
  if (!lite) flatten(world.terrain, world.landmarks.find((l) => l.key === 'lion').p, 10, 14);
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

  // 동네 모드에는 캠퍼스 랜드마크가 없다: 조각 밖 먼 곳에 더미를 두어 반경 판정이 모두 거짓이 되게 한다
  const FAR = lite ? [world.site.point[0] + 9000, world.site.point[1] + 9000] : null;
  const lm = lite
    ? Object.fromEntries(['lion', 'main', 'history', 'aeji', 'amph', 'station'].map((k) => [k, { key: k, name: '', p: FAR, bid: -1 }]))
    : Object.fromEntries(world.landmarks.map((l) => [l.key, l]));
  const amphB = lite ? { pts: [] } : world.buildings.find((b) => b.id === lm.amph.bid);
  const plaza = { p: lm.lion.p, r: lite ? 0 : 9, kind: 'grass' };

  // 바닥
  // 사자상 광장 (회색 화강석 블록) — 2026-07 로드뷰 기준: 105 학생복지관 · 104 애지문 · 사자상 화단 · 102 본관 계단 사이
  const plazaPoly = [[-49, -12], [-15, -16], [-14, -30], [-8, -44], [12, -37], [14, -26], [6, -12], [-1, 5], [-9, 16], [-20, 42], [-49, 42]];
  const splat = makeSplat(world, lite ? [] : [plaza], lite ? [] : [plazaPoly]);
  const { mesh: terrain, outer } = await makeTerrain(world, splat.canvas, splat.plaza);
  scene.add(terrain, outer);
  progress(0.45, 'terrain');

  // 건물 (노천극장은 별도 조형으로 대체)
  // 주인공 건물(101·102·104·105)은 사진 보고 따로 만든 모델로
  const hero = lite ? { ids: [], info: new Map(), group: new THREE.Group(), clear: [] } : await makeHero(world, heightAt, lm.lion.p);
  // ---- 구역 플러그인: src/zones/*.js (구역마다 파일 하나 — docs: src/zones/README.md)
  const zones = lite ? [] : await loadZones({ THREE, world, heightAt, lm, scene, renderer });
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
  if (!lite) {
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
  }
  progress(0.7, 'lion+props');

  // 나무 (사자상 광장·노천극장 객석은 비움)
  const blockIdx = {
    hit: (x, z, pad) => bIndex.hit(x, z, pad) || Math.hypot(x - plaza.p[0], z - plaza.p[1]) < plaza.r + 1 || pointInPoly(x, z, amphB.pts) || pointInPoly(x, z, plazaPoly) || hero.clear.some((q) => pointInPoly(x, z, q)) || zones.some((zn) => (zn.clear || []).some((q) => pointInPoly(x, z, q))),
  };
  const trees = await makeTrees(world, heightAt, blockIdx, roadIdx, scene, Q);
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
  const LABEL_NEAR = 90; // 랜드마크 이름표는 건물이 커서 조금 더 멀리서도 보인다
  for (const [key, name, sub, hOff] of lite ? [] : labelInfo) {
    const l = lm[key];
    const top = l.bid && bInfo.get(l.bid) ? bInfo.get(l.bid).top + 3 : heightAt(l.p[0], l.p[1]) + (hOff || 6);
    const obj = makeLabel(name, sub);
    obj.position.set(l.p[0], top, l.p[1]);
    scene.add(obj);
    labels.push(obj);
  }

  // 말풍선 (React 가 setMarkers 로 그룹별 목록을 넘김: 매물/기숙사/단지 …). 클릭하면 onClick, 멀면 숨김
  const markerGroups = new Map();
  const MARKER_NEAR = 60; // 플레이어에서 수평 거리 (m). 이보다 멀면 말풍선을 숨긴다
  const setMarkers = (items, group = 'listing') => {
    for (const o of markerGroups.get(group) || []) { scene.remove(o); o.element.remove(); }
    const objs = [];
    for (const it of items) {
      const el = document.createElement('button');
      el.type = 'button';
      el.className = 'w3d-marker';
      el.style.setProperty('--mk', it.color);
      el.style.setProperty('--mk-ink', inkFor(it.color)); // 노랑·주황·회색 핀은 짙은 글자
      if (it.icon) { const ic = document.createElement('span'); ic.className = 'w3d-ico'; ic.innerHTML = it.icon; el.appendChild(ic); }
      el.appendChild(document.createTextNode(it.text));
      if (it.label) el.setAttribute('aria-label', it.label);
      el.addEventListener('click', (e) => { e.stopPropagation(); it.onClick?.(); });
      const obj = new CSS2DObject(el);
      obj.position.set(it.x, heightAt(it.x, it.z) + 10, it.z);
      scene.add(obj);
      objs.push(obj);
    }
    markerGroups.set(group, objs);
  };

  // 다른 접속자 (멀티플레이). React 의 net 쪽이 보간한 위치를 매 프레임 넘긴다.
  // 캐릭터는 정점 색으로 합친 가벼운 모델(src/world/crowdStudent.js, 접속자당 draw call 7). 같은 외형은 지오메트리를 공유한다.
  // 멀수록 그림자 → 이름표 → 몸 순서로 끈다.
  const remotes = new Map();
  const LOD = { shadowM: 35, labelM: 50, hideM: 180 }; // src/net/lod.ts 와 같은 값
  const setRemotePlayers = (list) => {
    const seen = new Set();
    const px = player.pos.x, pz = player.pos.z;
    for (const r of list) {
      seen.add(r.id);
      let m = remotes.get(r.id);
      if (!m) {
        const g = new THREE.Group();
        const el = document.createElement('div'); el.className = 'w3d-nick';
        const tag = new CSS2DObject(el); tag.position.set(0, 2.3, 0); g.add(tag);
        scene.add(g);
        m = { g, tag, el, sig: '', model: null, key: '', amp: 0, walking: false };
        remotes.set(r.id, m);
      }
      const want = lookKey(r.look).key;
      if (m.key !== want) { // 외형이 바뀌었거나 처음: 모델 교체 (지오메트리는 공유라 싸다)
        if (m.model) m.g.remove(m.model);
        m.model = makeCrowdStudent(r.look); m.key = want; m.g.add(m.model);
      }
      const d = Math.hypot(r.x - px, r.z - pz);
      const visible = d <= LOD.hideM, label = d <= LOD.labelM, shadow = d <= LOD.shadowM;
      if (m.g.visible !== visible) m.g.visible = visible;
      if (!visible) continue;
      m.model.traverse((o) => { if (o.isMesh && o.castShadow !== shadow) o.castShadow = shadow; });
      if (m.tag.visible !== label) m.tag.visible = label; // 숨긴 CSS2D 는 DOM 갱신을 건너뛴다
      if (label) {
        const sig = `${r.nickname}|${r.chat || ''}|${r.emote ? 1 : 0}`;
        if (m.sig !== sig) {
          m.sig = sig; m.el.textContent = r.chat ? `${r.nickname}: ${r.chat}` : r.nickname;
          if (r.emote && !r.chat) { const ic = document.createElement('span'); ic.className = 'w3d-ico'; ic.innerHTML = r.emote; m.el.appendChild(ic); }
        }
      }
      // 걷기: 팔다리 흔들기 + 살짝 통통 (내 캐릭터와 같은 방식)
      m.amp += ((r.walking ? 0.7 : 0) - m.amp) * 0.2;
      const ph = performance.now() * 0.0096 + m.g.id, sw = Math.sin(ph) * m.amp, u = m.model.userData;
      u.armL.rotation.x = sw; u.armR.rotation.x = -sw; u.legL.rotation.x = -sw; u.legR.rotation.x = sw;
      m.g.position.set(r.x, heightAt(r.x, r.z) + Math.abs(Math.sin(ph)) * 0.04 * m.amp, r.z);
      m.g.rotation.y = r.r;
    }
    for (const [id, m] of remotes) if (!seen.has(id)) { scene.remove(m.g); m.el.remove(); remotes.delete(id); }
  };

  // 빛 기둥+깃발 (모집 중인 청년안심주택 강조). React 가 setBeacons 로 전체 교체
  const beaconObjs = [];
  const beaconMat = (c) => new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: 0.28, depthWrite: false, blending: THREE.AdditiveBlending });
  const setBeacons = (items) => {
    for (const g of beaconObjs) { scene.remove(g); g.traverse((o) => { o.geometry?.dispose(); o.material?.dispose(); }); }
    beaconObjs.length = 0;
    for (const it of items) {
      const g = new THREE.Group();
      const y = heightAt(it.x, it.z);
      const pillar = new THREE.Mesh(new THREE.CylinderGeometry(1.2, 1.2, 60, 16, 1, true), beaconMat(it.color)); pillar.position.y = 30;
      const flag = new THREE.Mesh(new THREE.PlaneGeometry(5, 3), new THREE.MeshBasicMaterial({ color: it.color, side: THREE.DoubleSide })); flag.position.set(2.6, 24, 0);
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 14, 6), new THREE.MeshBasicMaterial({ color: 0xffffff })); pole.position.y = 21;
      g.add(pillar, flag, pole); g.position.set(it.x, y, it.z);
      scene.add(g); beaconObjs.push(g);
    }
  };

  // 플레이어
  const collide = (x, z) => bIndex.hit(x, z, 0.35) || lionHit(x, z);
  const lionHit = (x, z) => Math.hypot(x - lm.lion.p[0], z - lm.lion.p[1]) < 2.1;
  const player = new Player({ scene, camera, dom: domElement, heightAt, collide, bounds: world.bounds });

  // 내 캐릭터 머리 위 말풍선 (서버가 되돌려 준 내 chat/emote)
  const selfEl = document.createElement('div'); selfEl.className = 'w3d-nick';
  const selfTag = new CSS2DObject(selfEl); selfTag.position.set(0, 2.3, 0); selfTag.visible = false; player.mesh.add(selfTag);
  let selfSig = '';
  const setSelfBubble = ({ chat, emote } = {}) => {
    const sig = `${chat || ''}|${emote ? 1 : 0}`;
    if (sig === selfSig) return;
    selfSig = sig;
    selfTag.visible = !!(chat || emote);
    selfEl.textContent = chat || '';
    if (emote && !chat) { const ic = document.createElement('span'); ic.className = 'w3d-ico'; ic.innerHTML = emote; selfEl.appendChild(ic); }
  };

  player.occluders = [buildings];
  extras = makeExtras({ Q, scene, camera, world, heightAt, collide, player, bIndex, host: domElement.parentElement || document.body });
  extras.setNight(lastT);
  { const off = player.dispose.bind(player); player.dispose = () => { extras.dispose(); off(); }; }
  // 동네 모드: 집 앞 길 위에서 시작해 집을 바라봄
  const homeSpot = () => {
    const [hx, hz] = world.site.point;
    for (let r = 7; r < 60; r += 3) for (let a = 0; a < 16; a++) {
      const ang = Math.PI / 2 + (a / 16) * Math.PI * 2, x = hx + Math.cos(ang) * r, z = hz + Math.sin(ang) * r;
      if (!collide(x, z) && x > world.bounds.minX + 8 && x < world.bounds.maxX - 8 && z > world.bounds.minZ + 8 && z < world.bounds.maxZ - 8) return [x, z];
    }
    return [hx, hz + 12];
  };
  if (lite) { const [x, z] = homeSpot(); player.teleport(x, z, world.site.point[0], world.site.point[1]); }
  else { const spawn = lm.station.p; player.teleport(spawn[0] + 4, spawn[1] - 6, lm.lion.p[0], lm.lion.p[1]); }

  // 랜드마크 이동 (메뉴는 React 쪽에서 api.landmarks 로 그림)
  if (!lite) lm.aeji.name = '애지문 (한양대역 2번 출구)';
  const order = ['aeji', 'lion', 'main', 'history', 'amph'];
  const goToLandmark = (key) => {
    const l = lm[key];
    if (!l) return false;
    // 랜드마크 앞 빈자리 찾기
    const [lx, lz] = l.p;
    for (let r = 10; r < 60; r += 4) for (let a = 0; a < 16; a++) {
      const ang = (a / 16) * Math.PI * 2 + 0.6;
      const x = lx + Math.cos(ang) * r, z = lz + Math.sin(ang) * r;
      if (!collide(x, z) && !pointInPoly(x, z, amphB.pts)) { player.teleport(x, z, lx, lz); return true; }
    }
    return false;
  };
  // 지점 (x,z) 가 보이는 빈자리(25~90m 바깥)로 이동해 그쪽을 바라봄. 빈자리가 없으면 false
  const goToPlace = (cx, cz) => {
    for (let r = 25; r < 90; r += 5) for (let a = 0; a < 16; a++) {
      const ang = (a / 16) * Math.PI * 2;
      const x = cx + Math.cos(ang) * r, z = cz + Math.sin(ang) * r;
      if (!collide(x, z)) { player.teleport(x, z, cx, cz); player.dist = 30; player.pitch = 0.3; return true; }
    }
    return false;
  };
  const attrib = document.getElementById('attrib');
  if (attrib) attrib.textContent = world.attribution;
  // 시작: 사자상 정면 (서쪽 광장에서 동쪽을 봄 — 뒤로 역사관, 오른쪽 뒤로 애지문·한양대역)
  const heroShot = () => {
    if (lite) { const [x, z] = homeSpot(); player.teleport(x, z, world.site.point[0], world.site.point[1]); player.dist = 12; player.pitch = 0.2; return; }
    player.teleport(lm.lion.p[0] - 13, lm.lion.p[1] + 1.5, lm.lion.p[0], lm.lion.p[1]); player.dist = 19; player.pitch = 0.17;
  };
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
        goToPlace(cx, cz);
      }
    }
  }

  // 미니맵 (React 쪽이 #minimap canvas 를 깔아 둠. 없으면 미니맵 없이 동작)
  const mm = document.getElementById('minimap') || document.createElement('canvas');
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
  let mmTick = 0, lodTick = 1;
  const frame = (dt) => {
    player.update(dt);
    extras.frame(dt);
    stars.position.copy(camera.position);
    sun.position.copy(player.pos).addScaledVector(sunDir, 160);
    sun.target.position.copy(player.pos);
    const ppx = player.pos.x, ppz = player.pos.z;
    for (const l of labels) l.element.style.display = Math.hypot(l.position.x - ppx, l.position.z - ppz) < LABEL_NEAR ? '' : 'none';
    for (const objs of markerGroups.values()) for (const o of objs) o.element.style.display = Math.hypot(o.position.x - ppx, o.position.z - ppz) < MARKER_NEAR ? '' : 'none';
    if ((lodTick += dt) > 0.25) { lodTick = 0; trees.update(camera.position); }
    if ((mmTick += dt) > 0.1) { mmTick = 0; drawMinimap(); }
  };
  console.log(`trees: ${trees.count}, buildings: ${buildings.children.length}`);
  return {
    world, zones, player, trees, labels, sun, sunDir, frame, marks, heroShot,
    // React 메뉴 층이 쓰는 API (dispose 제외, 타입: src/main.d.ts)
    api: {
      landmarks: lite ? [{ key: 'hero', name: '집 앞' }] : [{ key: 'hero', name: '사자상 정면' }, ...order.map((key) => ({ key, name: lm[key].name }))],
      goToPlace,
      setMarkers,
      setBeacons,
      setDoors: (items) => extras.setDoors(items),
      setGates: (items) => extras.setGates(items),
      setTimeOfDay,
      setRemotePlayers,
      setSelfBubble,
      setAppearance: (look) => player.setAppearance(look),
      goToLandmark: (key) => (key === 'hero' ? (heroShot(), true) : goToLandmark(key)),
      teleport: (x, z, faceX, faceZ) => { if (collide(x, z)) return false; player.teleport(x, z, faceX, faceZ); return true; },
      getPose: () => ({ p: [player.pos.x, player.pos.y, player.pos.z], heading: player.heading }),
    },
  };
}

// 구역 플러그인 불러오기 — 파일 하나가 깨져도 나머지는 뜨게 (개별 try/catch)
async function loadZones(ctx) {
  const mods = /nozones/.test(location.search) ? [] : Object.entries(import.meta.glob('../zones/*.js')).sort();
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
