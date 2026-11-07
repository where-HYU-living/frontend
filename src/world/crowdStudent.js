import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { STYLES, hasStyle, paintBack, paintPatch } from './jacketStyles.js';

// 다른 접속자용 캐릭터. 내 캐릭터(player.js makeStudent)와 같은 모양을 정점 색으로 구워서 합친다.
//   몸통(목깃·밑단·단추·머리·머리카락·눈) 1 + 팔 2 + 다리 2 + 등판 글자 1 + 가슴 패치 1 = 접속자당 draw call 7
// 같은 외형(잠바·머리·피부)은 지오메트리를 공유하고, 머티리얼은 전원이 하나를 공유한다. 등판/패치 텍스처는 잠바 종류마다 하나.
const PLAIN = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.8 });
const BASE = { pants: 0x3b64a0, shoe: 0xf5f5f0, sole: 0xd8d6cf, eye: 0x1b1410 };

/** geo 에 변환을 굽고 색을 정점 속성으로 넣는다 */
function bake(geo, color, { pos = [0, 0, 0], scale = [1, 1, 1], rotX = 0, rotY = 0 } = {}) {
  const m = new THREE.Matrix4().compose(new THREE.Vector3(...pos), new THREE.Quaternion().setFromEuler(new THREE.Euler(rotX, rotY, 0)), new THREE.Vector3(...scale));
  const g = geo.index ? geo.toNonIndexed() : geo.clone();
  g.applyMatrix4(m);
  const c = new THREE.Color(color), n = g.attributes.position.count, arr = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { arr[i * 3] = c.r; arr[i * 3 + 1] = c.g; arr[i * 3 + 2] = c.b; }
  g.setAttribute('color', new THREE.BufferAttribute(arr, 3));
  for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'color'].includes(k)) g.deleteAttribute(k);
  return g;
}
const merge = (parts) => { const g = mergeGeometries(parts); parts.forEach((p) => p.dispose()); return g; };

const kits = new Map();
function kitFor(styleId, hairHex, skinHex) {
  const key = `${styleId}|${hairHex}|${skinHex}`;
  let k = kits.get(key);
  if (k) return k;
  const st = STYLES[styleId];
  const rib = (r, y) => [
    bake(new THREE.TorusGeometry(r, 0.03, 8, 24), st.trim, { pos: [0, y, 0], rotX: Math.PI / 2 }),
    bake(new THREE.TorusGeometry(r, 0.012, 6, 24), st.stripe, { pos: [0, y, 0], rotX: Math.PI / 2, scale: [1.02, 1.02, 1] }),
  ];
  const body = merge([
    bake(new THREE.CapsuleGeometry(0.27, 0.32, 6, 14), st.body, { pos: [0, 0.92, 0], scale: [1.12, 1, 1] }),
    ...[1.14, 1.0, 0.86, 0.72].map((y) => bake(new THREE.SphereGeometry(0.022, 8, 6), st.button, { pos: [0, y, 0.276] })),
    ...rib(0.21, 1.3), ...rib(0.235, 0.66),
    bake(new THREE.SphereGeometry(0.34, 24, 18), skinHex, { pos: [0, 1.55, 0] }),
    bake(new THREE.SphereGeometry(0.36, 24, 18, 0, Math.PI * 2, 0, Math.PI * 0.55), hairHex, { pos: [0, 1.58, 0], rotX: -0.25 }),
    ...[-1, 1].map((s) => bake(new THREE.SphereGeometry(0.035, 8, 6), BASE.eye, { pos: [0.11 * s, 1.55, 0.31] })),
  ]);
  const arm = merge([
    bake(new THREE.CapsuleGeometry(0.105, 0.36, 4, 10), st.sleeve, { pos: [0, -0.36 / 2 - 0.105 * 0.5, 0] }),
    bake(new THREE.CylinderGeometry(0.11, 0.11, 0.07, 12), st.trim, { pos: [0, -0.4, 0] }),
  ]);
  const leg = merge([
    bake(new THREE.CapsuleGeometry(0.1, 0.38, 4, 10), BASE.pants, { pos: [0, -0.38 / 2 - 0.1 * 0.5, 0] }),
    bake(new THREE.SphereGeometry(1, 14, 10), BASE.shoe, { pos: [0, -0.545, 0.06], scale: [0.115, 0.075, 0.18] }),
    bake(new THREE.BoxGeometry(0.2, 0.03, 0.34), BASE.sole, { pos: [0, -0.605, 0.06] }),
  ]);
  k = { body, arm, leg };
  kits.set(key, k);
  return k;
}

// 잠바 종류별 등판/패치 (캔버스 텍스처 + 머티리얼). 사자 이미지는 한 번만 불러와 다 다시 칠한다
const decals = new Map();
let lionImg = null;
function ensureLion() {
  if (lionImg) return;
  lionImg = new Image();
  lionImg.onload = () => { for (const d of decals.values()) { paintBack(d.cg, STYLES[d.id], lionImg); d.tex.needsUpdate = true; } };
  lionImg.src = `${import.meta.env.BASE_URL}tex/lion-patch.png`;
}
const arcBack = 0.56 / 0.272, arcPatch = 0.13 / 0.272;
const backGeo = new THREE.CylinderGeometry(0.273, 0.273, 0.54, 24, 1, true, Math.PI - arcBack / 2, arcBack);
backGeo.applyMatrix4(new THREE.Matrix4().compose(new THREE.Vector3(0, 0.95, 0), new THREE.Quaternion(), new THREE.Vector3(1.12, 1, 1)));
const patchGeo = new THREE.CylinderGeometry(0.274, 0.274, 0.13, 12, 1, true, -arcPatch / 2, arcPatch);
patchGeo.applyMatrix4(new THREE.Matrix4().compose(new THREE.Vector3(0, 1.08, 0), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0.5, 0)), new THREE.Vector3(1.12, 1, 1)));
function decalFor(id) {
  let d = decals.get(id);
  if (d) return d;
  ensureLion();
  const st = STYLES[id];
  const c = document.createElement('canvas'); c.width = 512; c.height = 512;
  const cg = c.getContext('2d'); paintBack(cg, st, lionImg);
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 2;
  const hc = document.createElement('canvas'); hc.width = 128; hc.height = 128;
  paintPatch(hc.getContext('2d'), st);
  const htex = new THREE.CanvasTexture(hc); htex.colorSpace = THREE.SRGBColorSpace;
  d = { id, cg, tex, back: new THREE.MeshStandardMaterial({ map: tex, transparent: true, roughness: 0.85 }), patch: new THREE.MeshStandardMaterial({ map: htex, transparent: true, roughness: 0.85 }), hasPatch: st.patch !== 'none' };
  decals.set(id, d);
  return d;
}

const HEX = /^#[0-9a-f]{6}$/i;
/** look = { jacket, hair:'#rrggbb', skin:'#rrggbb' }. 알 수 없는 값은 기본으로 */
export function lookKey(look) {
  const jacket = look && hasStyle(look.jacket) ? look.jacket : 'school1';
  const hair = look && HEX.test(look.hair) ? look.hair.toLowerCase() : '#2a1d16';
  const skin = look && HEX.test(look.skin) ? look.skin.toLowerCase() : '#f2c9a5';
  return { jacket, hair, skin, key: `${jacket}|${hair}|${skin}` };
}

/** 접속자 1명분 캐릭터 그룹. userData 에 팔다리 피벗(걷기 흔들기용)이 있다 */
export function makeCrowdStudent(look) {
  const { jacket, hair, skin } = lookKey(look);
  const kit = kitFor(jacket, hair, skin), d = decalFor(jacket);
  const g = new THREE.Group();
  const body = new THREE.Mesh(kit.body, PLAIN);
  const back = new THREE.Mesh(backGeo, d.back);
  const parts = [body, back];
  if (d.hasPatch) parts.push(new THREE.Mesh(patchGeo, d.patch));
  const pivot = (geo, x, y) => { const p = new THREE.Group(); p.position.set(x, y, 0); const m = new THREE.Mesh(geo, PLAIN); p.add(m); parts.push(m); return p; };
  const armL = pivot(kit.arm, -0.36, 1.18), armR = pivot(kit.arm, 0.36, 1.18), legL = pivot(kit.leg, -0.13, 0.62), legR = pivot(kit.leg, 0.13, 0.62);
  g.add(body, back, ...parts.slice(2).filter((m) => m.parent == null), armL, armR, legL, legR);
  for (const m of parts) m.castShadow = true;
  g.userData = { armL, armR, legL, legR, key: lookKey(look).key };
  return g;
}
