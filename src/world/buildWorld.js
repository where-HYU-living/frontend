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
import { pickLabels } from './labelCull';
import { campusLabelSpots } from './campusLabels';
import { visiblePlaces } from '../app/data/hiddenBuildings';

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
  // 불러오는 동안은 안개를 짙게: 사자상 앞(1단계)은 또렷하고, 그 뒤로 채워지는 먼 건물·나무는 안개 속에서 나타난다
  const LOAD_FOG = 0.0075;
  scene.fog = new THREE.FogExp2(0xc9d7e4, LOAD_FOG);
  scene.background = new THREE.Color(0xc9d7e4); // 하늘 사진이 오기 전까지 안개색 (로딩 중에도 화면이 보인다)
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
  let fogScale = Q.fogScale; // 품질 '최저'는 시야 끝이 짧아 안개를 짙게
  const setTimeOfDay = (t) => {
    lastT = t;
    const L = lightAt(t);
    sun.intensity = L.sun; sun.color.setHex(L.sunColor); sunDir.set(...L.sunDir).normalize();
    // 환경광(HDR)을 끈 품질에서는 그만큼을 반구광으로 채워 너무 어두워지지 않게
    hemi.intensity = L.hemi + (scene.environment ? 0 : L.env * 0.9); scene.environmentIntensity = L.env; scene.backgroundIntensity = L.bg;
    scene.fog.color.setHex(L.fog); scene.fog.density = L.fogDensity * fogScale;
    if (scene.background?.isColor) scene.background.setHex(L.fog); // 하늘 사진이 없으면 안개색 하늘
    renderer.toneMappingExposure = L.exposure;
    starMat.opacity = starsAt(t); stars.visible = starMat.opacity > 0.01;
    extras?.setNight(t);
  };
  sun.castShadow = Q.shadows;
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
  // 로딩 중에도 장면을 그리므로, 카메라를 처음부터 시작 자리(heroShot 과 같은 구도)에 둔다 → 건물·나무가 채워지는 게 보인다
  {
    const introCam = (x, z, fx, fz, dist, pitch) => {
      const y = heightAt(x, z) + 1.4, yaw = Math.atan2(fx - x, fz - z) + Math.PI;
      const cx = x + Math.sin(yaw) * Math.cos(pitch) * dist, cz = z + Math.cos(yaw) * Math.cos(pitch) * dist;
      camera.position.set(cx, Math.max(y + Math.sin(pitch) * dist, heightAt(cx, cz) + 0.6), cz);
      camera.lookAt(x, y, z);
    };
    if (lite) introCam(world.site.point[0], world.site.point[1] + 7, world.site.point[0], world.site.point[1], 12, 0.2);
    else { const [lx, lz] = world.landmarks.find((l) => l.key === 'lion').p; introCam(lx - 13, lz + 1.5, lx, lz, 19, 0.17); }
  }

  // 하늘(HDR 환경광 + 배경 사진, 합계 약 1.7MB). 품질 '최저'는 받지 않고 안개색 하늘 — 나중에 품질을 올리면 그때 받는다
  let curQ = Q;
  let skyP = null, skyBg = null;
  const applySky = () => {
    const on = curQ.env && scene.userData.envRT;
    scene.environment = on ? scene.userData.envRT.texture : null;
    if (on) scene.background = skyBg;
    else if (!scene.background?.isColor) scene.background = new THREE.Color(0xc9d7e4);
  };
  const loadSky = () => (skyP ??= (async () => {
    const pmrem = new THREE.PMREMGenerator(renderer);
    const [hdr, bg] = await Promise.all([
      new HDRLoader().loadAsync('/env/sky_1k.hdr'),
      new THREE.TextureLoader().loadAsync('/env/sky_bg.jpg'),
    ]);
    if (!scene.children.includes(sun)) { pmrem.dispose(); hdr.dispose(); bg.dispose(); return; } // 받는 사이 월드가 내려갔다
    const envRT = pmrem.fromEquirectangular(hdr);
    scene.userData.envRT = envRT; // 렌더 타깃 텍스처는 texture.dispose() 로는 GL 에서 안 지워진다 → disposeScene 이 envRT.dispose()
    // 환경맵을 만든 뒤 PMREM 생성기(내부 평면 geometry·블러 재질·렌더 타깃)와 원본 HDR 은 더 쓰지 않는다 → 월드 전환마다 쌓이던 누수(3-4)
    pmrem.dispose(); hdr.dispose();
    bg.mapping = THREE.EquirectangularReflectionMapping;
    bg.colorSpace = THREE.SRGBColorSpace;
    skyBg = bg;
    scene.userData.skyBg = bg; // 환경광을 끈 동안 배경에서 빠져 있어도 월드를 내릴 때 해제
  })());
  if (Q.env) await loadSky();
  scene.environmentIntensity = 0.8;
  scene.backgroundBlurriness = 0.0;
  applySky();
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

  // ── 1단계: 시작 화면(사자상 정면)에 보이는 것부터. 이게 끝나면 화면을 공개한다 ──
  // 주인공 건물(101·102·104·105)은 사진 보고 따로 만든 모델로
  const hero = lite ? { ids: [], info: new Map(), group: new THREE.Group(), clear: [] } : await makeHero(world, heightAt, lm.lion.p);
  if (hero.info.has(lm.aeji.bid)) lm.aeji.p = hero.info.get(lm.aeji.bid).center; // 옮긴 애지문 위치로 라벨·메뉴
  console.log('hero merge', mergeStatic(hero.group, mergeGeometries));
  scene.add(hero.group); // 아래에서 buildings 로 옮긴다 (카메라 가림 판정용)
  // 사자상은 역사관 정면 계단 앞에서 광장(서쪽)을 바라봄
  // (lion.js 의 조각 모델은 머리가 진행 방향에서 90° 돌아가 있어, 서쪽을 보게 하려면 남쪽 벡터를 넘김)
  if (!lite) {
    const lion = await makeLion(lm.lion.p, heightAt, [-1, 0.08]); // 서쪽(첫 화면 카메라·광장) 쪽을 바라보게
    mergeStatic(lion, mergeGeometries);
    scene.add(lion);
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
    progress(0.5, 'hero'); // 0.5 이상이면 메뉴 층이 가림막을 걷는다 (App.tsx Loading)
  }

  // ── 2단계: 나머지 캠퍼스 (먼 곳은 짙은 안개 뒤에서 채워진다) ──
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
  buildings.add(hero.group); // 장면에서 buildings 아래로 옮김
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

  // 랜드마크 (사자상·앞마당은 1단계에서 만들었다)
  if (!lite) {
    const amph = zoneReplace.has('amph') ? { group: new THREE.Group() } : await makeAmphitheater(amphB.pts, heightAt);
    progress(0.64, 'amph');
    // 한양대역 2번 출구 = 애지문 (hero.js 에서 캐노피·계단으로 만듦) → 일반 출구 모형에서 뺌
    const aejiC = lm.aeji.p;
    const exits = makeStationExits(world.exits.filter((e) => !(e.ref === '2' && Math.hypot(e.p[0] - aejiC[0], e.p[1] - aejiC[1]) < 30)), heightAt, nearestRoadDir);
    for (const o of [amph.group, exits]) mergeStatic(o, mergeGeometries);
    scene.add(amph.group, exits);
    const props = makeProps(world, heightAt, bIndex, plaza);
    mergeStatic(props, mergeGeometries);
    scene.add(props);
  }
  progress(0.7, 'amph+props');

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
  // 캠퍼스 건물 이름표 (랜드마크와 같은 모양 "이름 / 번호"). 수가 많아 랜드마크보다 가까이서만, 겹치면 가장 먼저 숨긴다
  const bLabels = [];
  const BLABEL_NEAR = 60;
  for (const s of lite ? [] : campusLabelSpots(visiblePlaces, world.buildings)) {
    const inf = bInfo.get(s.bid);
    const obj = makeLabel(s.name, s.sub);
    // 입구가 있으면 문 위 4.5m (간판처럼, 문 앞에 서도 보이게). 없으면 지붕 위
    obj.position.set(s.x, s.door ? heightAt(s.x, s.z) + 4.5 : inf ? inf.top + 3 : heightAt(s.x, s.z) + 12, s.z);
    scene.add(obj);
    bLabels.push(obj);
  }

  // 말풍선 (React 가 setMarkers 로 그룹별 목록을 넘김: 매물/기숙사/단지 …). 클릭하면 onClick, 멀면 숨김
  const markerGroups = new Map();
  const MARKER_NEAR = 60; // 플레이어에서 수평 거리 (m). 이보다 멀면 말풍선을 숨긴다
  const GROUP_PRIO = { home: 3, mybuilding: 3, route: 3, gate: 2 }; // 겹치면 먼저 자리를 차지하는 그룹 (랜드마크 이름표는 1, 나머지 0)
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
        const sig = `${r.nickname}|${r.chat || ''}|${r.emote || ""}`;
        if (m.sig !== sig) {
          m.sig = sig; m.el.textContent = r.chat ? `${r.nickname}: ${r.chat}` : r.nickname;
          if (r.emote) { const ic = document.createElement('span'); ic.className = 'w3d-ico'; ic.innerHTML = r.emote; m.el.appendChild(ic); }
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

  // 도보 경로 (4단계 F6): 지형을 따라 바닥에 파란 띠 + 흰 화살표. React 가 월드 범위 안 구간만 잘라 넘긴다 (src/app/route)
  let routeObj = null;
  const setRoute = (segments) => {
    if (routeObj) { scene.remove(routeObj); routeObj.traverse((o) => { o.geometry?.dispose(); o.material?.dispose(); }); routeObj = null; }
    if (!segments || !segments.length) return { points: 0, arrows: 0 };
    const g = new THREE.Group(); g.name = 'walk-route';
    const W = 0.7, Y = 0.16; // 반폭(m), 지면 위 높이
    const pos = [], idx = [], apos = [];
    let pts = 0, arrows = 0;
    for (const seg of segments) {
      const base = pos.length / 3;
      for (let i = 0; i < seg.length; i++) {
        const a = seg[Math.max(0, i - 1)], b = seg[Math.min(seg.length - 1, i + 1)];
        let dx = b.x - a.x, dz = b.z - a.z; const L = Math.hypot(dx, dz) || 1; dx /= L; dz /= L;
        const nx = -dz * W, nz = dx * W, p = seg[i];
        pos.push(p.x + nx, heightAt(p.x + nx, p.z + nz) + Y, p.z + nz, p.x - nx, heightAt(p.x - nx, p.z - nz) + Y, p.z - nz);
        if (i > 0) { const k = base + (i - 1) * 2; idx.push(k, k + 1, k + 2, k + 1, k + 3, k + 2); }
        pts++;
      }
      // 화살표: 10m 마다 진행 방향 쐐기
      let acc = 0;
      for (let i = 1; i < seg.length; i++) {
        const a = seg[i - 1], b = seg[i], L = Math.hypot(b.x - a.x, b.z - a.z); acc += L;
        if (acc < 10 || L < 0.01) continue; acc = 0;
        const dx = (b.x - a.x) / L, dz = (b.z - a.z) / L, y = heightAt(b.x, b.z) + Y + 0.03, s = 0.55;
        apos.push(b.x + dx * s, y, b.z + dz * s, b.x - dx * s * 0.6 - dz * s, y, b.z - dz * s * 0.6 + dx * s, b.x - dx * s * 0.6 + dz * s, y, b.z - dz * s * 0.6 - dx * s);
        arrows++;
      }
    }
    const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); geo.setIndex(idx);
    const mat = new THREE.MeshBasicMaterial({ color: 0x1c7ed6, transparent: true, opacity: 0.85, depthWrite: false, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -4 });
    const ribbon = new THREE.Mesh(geo, mat); ribbon.renderOrder = 2; g.add(ribbon);
    if (apos.length) {
      const ag = new THREE.BufferGeometry(); ag.setAttribute('position', new THREE.Float32BufferAttribute(apos, 3));
      const am = new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.DoubleSide, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -6 });
      const arrowMesh = new THREE.Mesh(ag, am); arrowMesh.renderOrder = 3; g.add(arrowMesh);
    }
    scene.add(g); routeObj = g;
    return { points: pts, arrows };
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
    const sig = `${chat || ''}|${emote || ""}`;
    if (sig === selfSig) return;
    selfSig = sig;
    selfTag.visible = !!(chat || emote);
    selfEl.textContent = chat || '';
    if (emote) { const ic = document.createElement('span'); ic.className = 'w3d-ico'; ic.innerHTML = emote; selfEl.appendChild(ic); }
  };

  player.occluders = [buildings];
  extras = makeExtras({ Q, scene, camera, world, heightAt, collide, player, bIndex, host: domElement.parentElement || document.body });
  extras.setNight(lastT);
  { const off = player.dispose.bind(player); player.dispose = () => { extras.dispose(); off(); }; }
  // 동네 모드: 집 앞 길 위에서 시작해 집을 바라봄. 벽에 붙지 않게 첫 빈자리에서 같은 방향으로 더 물러난다(건물·이름표가 한 화면에)
  const HOME_BACK = 10, HOME_DIST = 14, HOME_PITCH = 0.14; // 첫 빈자리에서 더 물러날 거리(m)·카메라 거리·각도
  const homeSpot = () => {
    const [hx, hz] = world.site.point;
    const ok = (x, z) => !collide(x, z) && x > world.bounds.minX + 8 && x < world.bounds.maxX - 8 && z > world.bounds.minZ + 8 && z < world.bounds.maxZ - 8;
    for (let r = 7; r < 60; r += 3) for (let a = 0; a < 16; a++) {
      const ang = Math.PI / 2 + (a / 16) * Math.PI * 2, c = Math.cos(ang), sn = Math.sin(ang);
      if (!ok(hx + c * r, hz + sn * r)) continue;
      let best = r;
      for (let k = r + 1; k <= r + HOME_BACK; k++) { if (!ok(hx + c * k, hz + sn * k)) break; best = k; }
      return [hx + c * best, hz + sn * best];
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
    if (lite) { const [x, z] = homeSpot(); player.teleport(x, z, world.site.point[0], world.site.point[1]); player.dist = HOME_DIST; player.pitch = HOME_PITCH; return; }
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

  // 미니맵 (React 쪽이 #minimap canvas·#minimap-hint 를 깔아 둠. 없으면 미니맵 없이 동작)
  // 동그란 창, 내 위치가 늘 가운데(북쪽 위). 한 번 누르면 표시만, 두 번 누르면 그 자리로 이동.
  const mm = document.getElementById('minimap') || document.createElement('canvas');
  const mmHint = document.getElementById('minimap-hint');
  const mg = mm.getContext('2d');
  const MM_R = 150; // 미니맵 반지름이 보여 주는 거리(m)
  const mmS = (mm.width / 2) / MM_R; // 캔버스 px / m
  const mmBase = document.createElement('canvas');
  {
    const { minX, maxX, minZ, maxZ } = world.bounds;
    mmBase.width = Math.ceil((maxX - minX) * mmS); mmBase.height = Math.ceil((maxZ - minZ) * mmS);
    const g = mmBase.getContext('2d');
    g.fillStyle = '#6b4c2e'; g.fillRect(0, 0, mmBase.width, mmBase.height);
    const M = ([x, z]) => [(x - minX) * mmS, (z - minZ) * mmS];
    const poly = (pts) => { g.beginPath(); pts.forEach((p, i) => (i ? g.lineTo(...M(p)) : g.moveTo(...M(p)))); };
    for (const a of world.areas) {
      g.fillStyle = a.cls === 'forest' ? '#8c4a24' : a.cls === 'grass' ? '#9a8a45' : '#7a5a3a';
      poly(a.pts); g.closePath(); g.fill();
    }
    g.lineCap = 'round'; g.lineJoin = 'round';
    for (const r of world.roads) {
      g.strokeStyle = r.kind === 'road' ? '#3b3632' : '#d9b48a';
      g.lineWidth = Math.max(1, r.w * mmS * (r.kind === 'road' ? 1 : 1.3));
      poly(r.pts); g.stroke();
    }
    g.fillStyle = 'rgba(30,26,22,.85)';
    for (const b of world.buildings) { poly(b.pts); g.closePath(); g.fill(); }
    g.fillStyle = '#ffd29a';
    for (const l of world.landmarks) { g.beginPath(); g.arc(...M(l.p), 4, 0, Math.PI * 2); g.fill(); }
  }
  /** 화면 좌표 → 월드 좌표 (원 밖이면 null) */
  const mmToWorld = (cx, cy) => {
    const r = mm.getBoundingClientRect();
    const u = ((cx - r.left) / r.width) * 2 - 1, v = ((cy - r.top) / r.height) * 2 - 1;
    if (u * u + v * v > 1) return null;
    return [player.pos.x + u * MM_R, player.pos.z + v * MM_R];
  };
  let mmHover = null, mmMark = null, mmPulse = 0; // mmMark: 한 번 누른 자리(월드 좌표), mmPulse: 이동 직후 퍼지는 원
  let hintTimer = 0;
  const mmAbort = new AbortController(); // 월드를 다시 만들면 같은 캔버스에 리스너가 쌓이지 않게
  { const off = player.dispose.bind(player); player.dispose = () => { mmAbort.abort(); clearTimeout(hintTimer); mmHint?.classList.remove('is-on'); off(); }; }
  const mmOn = (type, fn) => mm.addEventListener(type, fn, { signal: mmAbort.signal });
  const setHint = (text, ms = 0) => {
    if (!mmHint) return;
    mmHint.textContent = text;
    mmHint.classList.toggle('is-on', !!text);
    clearTimeout(hintTimer);
    if (ms) hintTimer = setTimeout(() => setHint(''), ms);
  };
  const IDLE_HINT = '두 번 누르면 그 자리로 이동해요';
  mmOn('pointerenter', () => setHint(IDLE_HINT));
  mmOn('pointerleave', () => { mmHover = null; mmMark = null; setHint(''); drawMinimap(); });
  mmOn('pointermove', (e) => { mmHover = mmToWorld(e.clientX, e.clientY); drawMinimap(); });
  mmOn('click', (e) => {
    const p = mmToWorld(e.clientX, e.clientY);
    if (!p || e.detail > 1) return;
    mmMark = p;
    setHint(collide(p[0], p[1]) ? '건물 안이라 갈 수 없어요' : '한 번 더 누르면 이동해요');
    drawMinimap();
  });
  mmOn('dblclick', (e) => {
    const p = mmToWorld(e.clientX, e.clientY);
    if (!p) return;
    if (collide(p[0], p[1])) { setHint('건물 안이라 갈 수 없어요', 1600); return; }
    player.teleport(p[0], p[1]);
    mmMark = null; mmPulse = 1;
    setHint('이동했어요', 1200);
    drawMinimap();
  });
  const drawMinimap = () => {
    const { minX, minZ } = world.bounds;
    const W = mm.width, H = mm.height, c = W / 2;
    const px = player.pos.x, pz = player.pos.z;
    const toMM = ([x, z]) => [c + (x - px) * mmS, c + (z - pz) * mmS];
    mg.clearRect(0, 0, W, H);
    mg.save();
    mg.beginPath(); mg.arc(c, c, c, 0, Math.PI * 2); mg.clip();
    mg.fillStyle = '#5a4128'; mg.fillRect(0, 0, W, H); // 지도 밖
    mg.drawImage(mmBase, c - (px - minX) * mmS, c - (pz - minZ) * mmS);
    const dot = (p, r, fill, stroke) => { const [x, y] = toMM(p); mg.beginPath(); mg.arc(x, y, r, 0, Math.PI * 2); if (fill) { mg.fillStyle = fill; mg.fill(); } if (stroke) { mg.strokeStyle = stroke; mg.lineWidth = 3; mg.stroke(); } };
    if (mmHover && !mmMark) {
      const bad = collide(mmHover[0], mmHover[1]);
      dot(mmHover, 9, bad ? 'rgba(220,60,60,.25)' : 'rgba(255,255,255,.25)', bad ? 'rgba(220,60,60,.9)' : 'rgba(255,255,255,.95)');
    }
    if (mmMark) {
      const bad = collide(mmMark[0], mmMark[1]);
      dot(mmMark, 11, bad ? 'rgba(220,60,60,.3)' : 'rgba(14,74,132,.35)', bad ? '#dc3c3c' : '#fff');
      dot(mmMark, 3.5, bad ? '#dc3c3c' : '#fff');
    }
    if (mmPulse > 0) { mg.globalAlpha = mmPulse; dot([px, pz], 10 + (1 - mmPulse) * 34, null, '#fff'); mg.globalAlpha = 1; }
    mg.translate(c, c); mg.rotate(-player.heading + Math.PI);
    mg.fillStyle = '#fff'; mg.strokeStyle = '#0e4a84'; mg.lineWidth = 3;
    mg.beginPath(); mg.moveTo(0, -12); mg.lineTo(9, 9); mg.lineTo(0, 4); mg.lineTo(-9, 9); mg.closePath(); mg.fill(); mg.stroke();
    mg.restore();
    // 테두리와 북쪽 표시
    mg.strokeStyle = 'rgba(255,255,255,.85)'; mg.lineWidth = 4;
    mg.beginPath(); mg.arc(c, c, c - 2, 0, Math.PI * 2); mg.stroke();
    mg.fillStyle = '#fff'; mg.font = '700 20px system-ui, sans-serif'; mg.textAlign = 'center'; mg.textBaseline = 'top';
    mg.strokeStyle = 'rgba(0,0,0,.45)'; mg.lineWidth = 3; mg.strokeText('N', c, 8); mg.fillText('N', c, 8);
  };

  // 이름표·말풍선 거르기: 가까운 것만(거리) · 최대 개수 · 화면 겹침 (src/world/labelCull.ts).
  // CSS2DRenderer 가 매 프레임 style.display 를 덮어쓰므로 반드시 object.visible 로 숨긴다 (예전 display 방식은 R3F 이식 뒤 무효였음)
  const cullV = new THREE.Vector3();
  const cullLabels = (ppx, ppz) => {
    const W = domElement.clientWidth || innerWidth, H = domElement.clientHeight || innerHeight;
    const objs = [], cands = [];
    const add = (o, near, prio) => {
      const d = Math.hypot(o.position.x - ppx, o.position.z - ppz);
      let sx = null, sy = null;
      if (d <= near) {
        cullV.copy(o.position).project(camera);
        if (cullV.z >= -1 && cullV.z <= 1) { sx = (cullV.x + 1) / 2 * W; sy = (1 - cullV.y) / 2 * H; }
      }
      const el = o.element;
      if (el.offsetWidth) { o.userData.w = el.offsetWidth; o.userData.h = el.offsetHeight; } // 숨기면 0 이 되므로 보일 때 크기를 기억
      objs.push(o); cands.push({ d, near, sx, sy, w: o.userData.w || 90, h: o.userData.h || 28, prio });
    };
    for (const l of labels) add(l, LABEL_NEAR, 1);
    for (const l of bLabels) add(l, BLABEL_NEAR, -1); // 건물 이름표: 말풍선(0)·랜드마크(1)보다 뒤
    for (const [g, list] of markerGroups) for (const o of list) add(o, MARKER_NEAR, GROUP_PRIO[g] ?? 0);
    const show = pickLabels(cands, { w: W, h: H });
    for (let i = 0; i < objs.length; i++) if (objs[i].visible !== show[i]) objs[i].visible = show[i];
  };

  progress(1, 'labels+player');
  // 로딩 중 짙던 안개를 1초에 걸쳐 원래 농도로 걷는다 (먼 건물이 갑자기 튀어나오지 않게)
  let fogLift = 0;
  const liftFog = (dt) => {
    if (fogLift >= 1) return;
    fogLift = Math.min(1, fogLift + dt);
    const target = lightAt(lastT).fogDensity * fogScale, e = 1 - (1 - fogLift) ** 3;
    scene.fog.density = Math.max(target, LOAD_FOG + (target - LOAD_FOG) * e);
  };
  let mmTick = 0, lodTick = 1, cullTick = 1;
  const frame = (dt) => {
    liftFog(dt);
    player.update(dt);
    extras.frame(dt);
    stars.position.copy(camera.position);
    sun.position.copy(player.pos).addScaledVector(sunDir, 160);
    sun.target.position.copy(player.pos);
    const ppx = player.pos.x, ppz = player.pos.z;
    if ((cullTick += dt) > 0.1) { cullTick = 0; cullLabels(ppx, ppz); }
    if ((lodTick += dt) > 0.25) { lodTick = 0; trees.update(camera.position); }
    if (mmPulse > 0) mmPulse = Math.max(0, mmPulse - dt * 1.8);
    if ((mmTick += dt) > (mmPulse > 0 ? 0 : 0.1)) { mmTick = 0; drawMinimap(); }
  };
  console.log(`trees: ${trees.count}, buildings: ${buildings.children.length}`);
  /** 품질을 월드를 다시 만들지 않고 바꾼다 (그림자·하늘 환경광·지형 셰이더·시야 끝·안개). 가로등·캔버스 안티에일리어싱은 다음 접속부터 */
  const applyQuality = (q) => {
    curQ = q;
    sun.castShadow = q.shadows;
    if (sun.shadow.mapSize.x !== q.shadowMap) { sun.shadow.mapSize.set(q.shadowMap, q.shadowMap); sun.shadow.map?.dispose(); sun.shadow.map = null; }
    trees.setShadows(q.shadows && q.treeShadows);
    terrain.userData.setLite(q.terrainLite);
    camera.far = q.far; camera.updateProjectionMatrix();
    fogScale = q.fogScale;
    if (q.env) loadSky().then(() => { applySky(); setTimeOfDay(lastT); });
    applySky();
    setTimeOfDay(lastT);
  };
  applyQuality(Q);
  return {
    world, zones, player, trees, labels, sun, sunDir, frame, marks, heroShot, applyQuality,
    // React 메뉴 층이 쓰는 API (dispose 제외, 타입: src/main.d.ts)
    api: {
      landmarks: lite ? [{ key: 'hero', name: '집 앞' }] : [{ key: 'hero', name: '사자상 정면' }, ...order.map((key) => ({ key, name: lm[key].name }))],
      goToPlace,
      setMarkers,
      setBeacons,
      setRoute,
      bounds: { ...world.bounds },
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
