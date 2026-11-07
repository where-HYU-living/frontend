import * as THREE from 'three';
import { loadImage, loadTex, hash, polyArea, PolyIndex } from './util.js';
import { facadeTexture as lookFacade } from './facade.js';

const FLOOR = 3.6, BAY = 3.2;

// 벽 재질 사진 위에 창문을 그려 "한 칸(3.2m × 3.6m)" 파사드 텍스처를 만든다
function facadeTexture(img, { glass = '#2b3a4a', frame = '#e9e2d4', winW = 0.56, winH = 0.5, tint = null } = {}) {
  const W = 512, H = Math.round((512 * FLOOR) / BAY);
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const g = c.getContext('2d');
  // 벽 (원본 텍스처 1장 ≈ 1.5m 로 보고 반복)
  const pat = g.createPattern(img, 'repeat');
  const s = W / (BAY / 1.5) / img.width;
  pat.setTransform(new DOMMatrix([s, 0, 0, s, 0, 0]));
  g.fillStyle = pat;
  g.fillRect(0, 0, W, H);
  if (tint) { g.fillStyle = tint; g.globalAlpha = 0.18; g.fillRect(0, 0, W, H); g.globalAlpha = 1; }
  const ww = W * winW, wh = H * winH, wx = (W - ww) / 2, wy = H * 0.24;
  // 창틀
  g.fillStyle = frame; g.fillRect(wx - 8, wy - 8, ww + 16, wh + 16);
  // 유리 (위쪽이 하늘을 비추는 그라데이션)
  const gr = g.createLinearGradient(0, wy, 0, wy + wh);
  gr.addColorStop(0, '#8fa6b6'); gr.addColorStop(0.35, glass); gr.addColorStop(1, '#1b232c');
  g.fillStyle = gr; g.fillRect(wx, wy, ww, wh);
  g.fillStyle = frame; g.fillRect(wx + ww / 2 - 3, wy, 6, wh);
  // 창턱 그림자
  g.fillStyle = 'rgba(0,0,0,.25)'; g.fillRect(wx - 8, wy + wh + 8, ww + 16, 6);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(1 / BAY, 1 / FLOOR);
  t.anisotropy = 8;
  return t;
}

export async function makeBuildings(world, heightAt, special = {}) {
  const [brick, conc, plaster, granite] = await Promise.all(['brickwall', 'concwall', 'plaster', 'granite'].map((n) => loadImage(`/tex/${n}_diff.jpg`)));
  const roofTex = await loadTex('/tex/roof_diff.jpg');
  roofTex.repeat.set(1 / 4, 1 / 4);

  const wall = (map, extra = {}) => new THREE.MeshStandardMaterial({ map, roughness: 0.88, metalness: 0, ...extra });
  const mats = {
    brick: wall(facadeTexture(brick)),
    brick2: wall(facadeTexture(brick, { winW: 0.4, winH: 0.55, tint: '#5a2a18' })),
    conc: wall(facadeTexture(conc, { frame: '#cfcac0', winW: 0.7 })),
    plaster: wall(facadeTexture(plaster, { frame: '#ffffff', winW: 0.5, tint: '#f2e6d0' })),
    granite: wall(facadeTexture(granite, { frame: '#ddd6c8', winW: 0.62, winH: 0.56 })),
    glass: wall(facadeTexture(conc, { winW: 0.9, winH: 0.8, frame: '#9aa3a8' }), { roughness: 0.4, metalness: 0.2 }),
  };
  const roof = new THREE.MeshStandardMaterial({ map: roofTex, color: 0xb9b2a6, roughness: 0.95 });
  const order = ['brick', 'brick', 'brick2', 'conc', 'plaster', 'glass'];
  // 외관 조사 결과가 있는 건물: 실제 색·재질·창 패턴으로 재질을 만든다 (같은 모양은 공유)
  const lookMats = new Map();
  const roofMats = new Map();
  async function lookMaterial(look) {
    const w = look.wall || {};
    const key = JSON.stringify([w.color, w.mat, look.window?.pattern, look.window?.frame, look.window?.glass, look.window?.floorH]);
    if (!lookMats.has(key)) {
      const floor = Math.min(4.5, Math.max(3.2, look.window?.floorH || FLOOR));
      const tex = await lookFacade({ color: w.color || '#cfc8bb', mat: w.mat || '', pattern: look.window?.pattern || '', frame: look.window?.frame, glass: look.window?.glass, floor });
      const glassy = /유리/.test(w.mat || '');
      lookMats.set(key, wall(tex, glassy ? { roughness: 0.35, metalness: 0.25 } : {}));
    }
    return lookMats.get(key);
  }
  function roofMaterial(look) {
    const c = look?.roofColor && look.roof !== 'flat' ? look.roofColor : null;
    if (!c) return roof;
    if (!roofMats.has(c)) roofMats.set(c, new THREE.MeshStandardMaterial({ map: roofTex, color: new THREE.Color(c), roughness: 0.8 }));
    return roofMats.get(c);
  }

  const group = new THREE.Group();
  group.name = 'buildings';
  const index = new PolyIndex(24);
  const info = new Map();

  for (const b of world.buildings) {
    if (special.skip && special.skip.has(b.id)) continue;
    const area = polyArea(b.pts);
    if (area < 12) continue;
    const r = hash(b.id % 100000);
    let h = b.h;
    if (!h) h = area < 120 ? 6.5 + r * 2 : area < 600 ? 10 + r * 7 : 15 + r * 12;
    h = Math.round(h / FLOOR) * FLOOR + 0.6;

    let hMin = Infinity, hMax = -Infinity;
    for (const [x, z] of b.pts) { const y = heightAt(x, z); hMin = Math.min(hMin, y); hMax = Math.max(hMax, y); }
    const baseY = hMin - 1.2;
    const depth = h + (hMax - hMin) + 1.2;

    const shape = new THREE.Shape(b.pts.map(([x, z]) => new THREE.Vector2(x, -z)));
    const geo = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: false });
    geo.rotateX(-Math.PI / 2);
    geo.translate(0, baseY, 0);
    // 벽 uv: 아래 기준을 실제 지면 높이에 맞춤 (층 줄이 땅에서 시작)
    const uv = geo.attributes.uv, pos = geo.attributes.position;
    const side = geo.groups[1];
    for (let k = side.start; k < side.start + side.count; k++) {
      // 옆면 v = 실제 지면 기준 높이(m)
      uv.setY(k, pos.getY(k) - hMin);
    }
    const key = special.mat?.[b.id] || order[Math.floor(r * order.length)];
    const sideMat = b.look?.wall ? await lookMaterial(b.look) : mats[key];
    const mesh = new THREE.Mesh(geo, [roofMaterial(b.look), sideMat]);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.userData = { id: b.id, name: b.name, no: b.no || null, look: b.look ? b.look.conf : null };
    group.add(mesh);
    index.add(b.pts, { id: b.id, name: b.name });
    info.set(b.id, { top: baseY + depth, pts: b.pts });
  }
  return { group, index, info };
}
