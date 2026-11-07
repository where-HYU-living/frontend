import * as THREE from 'three';

// 외관 조사(appearance.json)의 색·재질·창문 패턴으로 벽면 텍스처를 그린다.
// 한 장 = 가로 한 칸(bay m) × 세로 한 층(floor m). uv 는 미터 단위(벽 길이, 지면 기준 높이)로 넣고 repeat 으로 나눈다.

const imgCache = new Map();
export function loadImg(url) {
  if (!imgCache.has(url)) imgCache.set(url, new Promise((res, rej) => { const im = new Image(); im.onload = () => res(im); im.onerror = rej; im.src = url; }));
  return imgCache.get(url);
}

// 재질 이름 → 바탕 사진
export function baseFor(mat = '') {
  if (/벽돌/.test(mat)) return 'brickwall';
  if (/화강석|석재|돌/.test(mat)) return 'granite';
  if (/콘크리트/.test(mat)) return 'concwall';
  if (/금속|루버/.test(mat)) return 'concwall';
  if (/타일/.test(mat)) return 'granite';
  return 'plaster';
}

// 창 모양 (패턴 설명 → 창 비율)
export function windowFor(pattern = '', mat = '') {
  if (/커튼월|전면 유리/.test(pattern) || /유리 커튼월/.test(mat)) return { w: 0.94, h: 0.86, y: 0.07, mull: 3, curtain: true };
  if (/띠창|가로로 긴|수평/.test(pattern)) return { w: 1.0, h: 0.42, y: 0.3, mull: 3 };
  if (/세로로 긴|세로|아치/.test(pattern)) return { w: 0.36, h: 0.62, y: 0.18, mull: 1 };
  return { w: 0.55, h: 0.5, y: 0.24, mull: 1 };
}

function paintWall(g, img, color, W, H, bay, floor, scaleM = 1.6) {
  g.fillStyle = color; g.fillRect(0, 0, W, H);
  if (!img) return;
  const pat = g.createPattern(img, 'repeat');
  const s = (W / bay) * scaleM / img.width; // 사진 1장 ≈ scaleM 미터
  pat.setTransform(new DOMMatrix([s, 0, 0, s, 0, 0]));
  g.save(); g.globalCompositeOperation = 'overlay'; g.globalAlpha = 0.85; g.fillStyle = pat; g.fillRect(0, 0, W, H); g.restore();
  g.save(); g.globalCompositeOperation = 'multiply'; g.globalAlpha = 0.22; g.fillStyle = pat; g.fillRect(0, 0, W, H); g.restore();
}

function paintWindow(g, x, y, w, h, { frame = '#3a3a3a', glass = '#33414f', mull = 1, arch = false, curtain = false }) {
  const fw = Math.max(3, w * 0.05);
  g.fillStyle = frame;
  if (arch) { g.beginPath(); g.moveTo(x - fw, y + h + fw); g.lineTo(x - fw, y + w / 2); g.arc(x + w / 2, y + w / 2, w / 2 + fw, Math.PI, 0); g.lineTo(x + w + fw, y + h + fw); g.fill(); }
  else g.fillRect(x - fw, y - fw, w + fw * 2, h + fw * 2);
  const gr = g.createLinearGradient(0, y, 0, y + h);
  const c = new THREE.Color(glass);
  const sky = c.clone().lerp(new THREE.Color('#b9cfdc'), 0.55), dark = c.clone().multiplyScalar(0.55);
  gr.addColorStop(0, `#${sky.getHexString()}`); gr.addColorStop(0.4, glass); gr.addColorStop(1, `#${dark.getHexString()}`);
  g.fillStyle = gr;
  if (arch) { g.beginPath(); g.moveTo(x, y + h); g.lineTo(x, y + w / 2); g.arc(x + w / 2, y + w / 2, w / 2, Math.PI, 0); g.lineTo(x + w, y + h); g.fill(); }
  else g.fillRect(x, y, w, h);
  g.fillStyle = frame;
  for (let k = 1; k <= mull; k++) g.fillRect(x + (w * k) / (mull + 1) - fw / 2, y, fw, h);
  if (curtain) g.fillRect(x, y + h * 0.5 - fw / 2, w, fw);
  g.fillStyle = 'rgba(0,0,0,.22)'; g.fillRect(x - fw, y + h + fw, w + fw * 2, Math.max(2, fw * 0.8));
}

const texCache = new Map();
// look: { color, mat, pattern, frame, glass } → 반복 텍스처 (u: m/bay, v: m/floor)
export async function facadeTexture({ color = '#cfc8bb', mat = '', pattern = '', frame = null, glass = null, bay = 3.2, floor = 3.6, img: imgName = null, win = null } = {}) {
  const key = JSON.stringify([color, mat, pattern, frame, glass, bay, floor, imgName, win]);
  if (texCache.has(key)) return texCache.get(key);
  const p = (async () => {
    const base = imgName || baseFor(mat);
    const img = await loadImg(`/tex/${base}_diff.jpg`).catch(() => null);
    const W = 256, H = Math.round((W * floor) / bay);
    const c = document.createElement('canvas'); c.width = W; c.height = H;
    const g = c.getContext('2d');
    const curtainWall = /유리 커튼월/.test(mat);
    paintWall(g, img, curtainWall ? '#6f7d86' : color, W, H, bay, floor);
    const wd = win || windowFor(pattern, mat);
    const ww = W * wd.w, wh = H * wd.h;
    paintWindow(g, (W - ww) / 2, H * wd.y, ww, wh, { frame: frame || (curtainWall ? '#8d979c' : '#4a4a48'), glass: glass || (curtainWall ? color : '#34424f'), mull: wd.mull, arch: wd.arch, curtain: wd.curtain });
    if (/금속|루버/.test(mat)) { // 세로 루버 핀
      g.fillStyle = 'rgba(225,228,230,.85)';
      for (let k = 0; k < 6; k++) g.fillRect((k / 6) * W, 0, W * 0.035, H);
    }
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(1 / bay, 1 / floor);
    t.anisotropy = 8;
    return t;
  })();
  texCache.set(key, p);
  return p;
}

// 층마다 다른 재질(기단·몸체·최상층)을 세로로 쌓은 텍스처. tiers: [{floors, color, mat, pattern, glass, frame, img, win}]
// u: m/bay 반복, v: 0~1 = 지면~꼭대기 (반복 안 함)
export async function tieredTexture(tiers, { bay = 3.2, floor = 3.6 } = {}) {
  const total = tiers.reduce((a, t) => a + t.floors, 0);
  const W = 256, FH = Math.round((W * floor) / bay), H = FH * total;
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  const g = c.getContext('2d');
  let row = 0;
  for (const t of [...tiers].reverse()) { // 캔버스 위쪽 = 꼭대기
    const tex = await facadeTexture({ ...t, bay, floor: t.floorH || floor });
    for (let k = 0; k < t.floors; k++) g.drawImage(tex.image, 0, (row + k) * FH, W, FH);
    row += t.floors;
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping; tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.repeat.set(1 / bay, 1);
  tex.anisotropy = 8;
  return { tex, height: total * floor };
}

// 단색+사진 질감 텍스처 (기둥·박공·돌 등)
export async function plainTexture(color, imgName = 'plaster', sizeM = 2) {
  const key = 'plain' + color + imgName + sizeM;
  if (texCache.has(key)) return texCache.get(key);
  const p = (async () => {
    const img = await loadImg(`/tex/${imgName}_diff.jpg`).catch(() => null);
    const c = document.createElement('canvas'); c.width = c.height = 256;
    paintWall(c.getContext('2d'), img, color, 256, 256, sizeM, sizeM, sizeM);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(1 / sizeM, 1 / sizeM);
    return t;
  })();
  texCache.set(key, p);
  return p;
}
