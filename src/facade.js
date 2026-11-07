import * as THREE from 'three';

// 외관 조사(appearance.json)의 색·재질·창문 패턴으로 벽면 텍스처를 그린다.
// 한 장 = 가로 한 칸(bay m) × 세로 한 층(floor m). uv 는 미터 단위(벽 길이, 지면 기준 높이)로 넣고 repeat 으로 나눈다.
// 약속: 타일 맨 아래 몇 % 줄은 항상 "창 없는 벽(또는 스팬드럴)" 이다 → buildings.js 가 파라펫·박공벽 uv 를 여기로 보낸다.

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

// 창 패턴 설명(한국어) → 창 종류 + 꾸밈.
// 실제 어휘: "격자 개별창(…)", "가로 띠창", "유리 커튼월", "수평 루버", "아치창", "세로 슬릿", "2~3연창", "실외기", "차양", "깊게 들어간", "X자 가새" …
// 설명이 여러 부위를 섞어 말하면(“기단부는 …, 상부는 커튼월”) 가장 먼저 나온 핵심어를 주 패턴으로 본다.
const TYPE_WORDS = [
  ['curtain', /커튼월|전면 유리|통유리|유리벽|유리 커튼/],
  ['ribbon', /띠창|가로 유리 띠|유리 띠/],
  ['louver', /루버/],
  ['arch', /아치/],
  ['vertical', /슬릿|세로창|세로로 긴|세로 띠/],
  ['punched', /개별창|사각창|연창|펀칭|구멍창|병실창|창이? 적고/],
];
export function parsePattern(pattern = '', mat = '') {
  let type = 'punched', at = Infinity;
  for (const [t, re] of TYPE_WORDS) { const m = re.exec(pattern); if (m && m.index < at) { at = m.index; type = t; } }
  if (/유리 커튼월/.test(mat)) type = 'curtain';
  const p = pattern;
  return {
    type,
    wide: /가로로 긴|가로 사각|가로로 늘어선|가로로 나뉜/.test(p), // 가로로 긴 창
    tall: /세로로 긴|좁고 긴|세로창/.test(p),
    square: /정사각/.test(p),
    small: /작은/.test(p) && !/작은 차양/.test(p),
    twin: /2연|2~3연|2~4연|이중 사각|2분할|1~2개/.test(p),
    deep: /깊게|깊은|상자형|들어간|입체 격자/.test(p),
    ac: /실외기/.test(p),
    hood: /차양|돌출 슬래브|처마/.test(p),
    band: /가로 띠|수평 띠|슬래브 띠|석재 띠|화강석 띠|가로줄|스팬드럴|패널 띠|창 아래 (?:패널|석재)/.test(p),
    hfin: /수평 루버|수평 차양|가로 멀리언|층마다 (?:돌출 )?수평|층마다 가는 띠/.test(p),
    diag: /X자|다이아몬드|가새/.test(p),
    pier: /기둥|핀|멀리언/.test(p),
  };
}

// 창 모양 (패턴 설명 → 창 비율). 예전 반환 형태(w,h,y,mull,curtain,arch)를 그대로 유지 + type 정보
export function windowFor(pattern = '', mat = '') {
  const s = parsePattern(pattern, mat);
  const base =
    s.type === 'curtain' ? { w: 0.94, h: 0.86, y: 0.07, mull: 3, curtain: true }
    : s.type === 'ribbon' ? { w: 1.0, h: 0.42, y: 0.3, mull: 3 }
    : s.type === 'arch' ? { w: 0.4, h: 0.66, y: 0.16, mull: 1, arch: true }
    : s.type === 'vertical' ? { w: 0.3, h: 0.64, y: 0.17, mull: 1 }
    : s.wide ? { w: 0.72, h: 0.4, y: 0.28, mull: 2 }
    : { w: 0.55, h: 0.5, y: 0.24, mull: 1 };
  return { ...base, ...s };
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

const hex = (c) => `#${c.getHexString()}`;
// 유리 그라데이션 (위 = 하늘 반사, 아래 = 어두움)
function glassFill(g, glass, y, h, sky = 0.55) {
  const gr = g.createLinearGradient(0, y, 0, y + h);
  const c = new THREE.Color(glass);
  gr.addColorStop(0, hex(c.clone().lerp(new THREE.Color('#b9cfdc'), sky)));
  gr.addColorStop(0.4, glass);
  gr.addColorStop(1, hex(c.clone().multiplyScalar(0.55)));
  return gr;
}

function paintWindow(g, x, y, w, h, { frame = '#3a3a3a', glass = '#33414f', mull = 1, arch = false, curtain = false, deep = false }) {
  const fw = Math.max(3, w * 0.05);
  g.fillStyle = frame;
  if (arch) { g.beginPath(); g.moveTo(x - fw, y + h + fw); g.lineTo(x - fw, y + w / 2); g.arc(x + w / 2, y + w / 2, w / 2 + fw, Math.PI, 0); g.lineTo(x + w + fw, y + h + fw); g.fill(); }
  else g.fillRect(x - fw, y - fw, w + fw * 2, h + fw * 2);
  g.fillStyle = glassFill(g, glass, y, h);
  if (arch) { g.beginPath(); g.moveTo(x, y + h); g.lineTo(x, y + w / 2); g.arc(x + w / 2, y + w / 2, w / 2, Math.PI, 0); g.lineTo(x + w, y + h); g.fill(); }
  else g.fillRect(x, y, w, h);
  if (deep) { // 깊은 창: 위·왼쪽 안쪽 그림자
    g.fillStyle = 'rgba(0,0,0,.38)';
    g.fillRect(x, y, w, h * 0.16); g.fillRect(x, y, w * 0.08, h);
  }
  g.fillStyle = frame;
  for (let k = 1; k <= mull; k++) g.fillRect(x + (w * k) / (mull + 1) - fw / 2, y, fw, h);
  if (curtain) g.fillRect(x, y + h * 0.5 - fw / 2, w, fw);
  if (arch) g.fillRect(x, y + w / 2, w, fw * 0.8); // 아치 머리 가로살
  g.fillStyle = 'rgba(0,0,0,.22)'; g.fillRect(x - fw, y + h + fw, w + fw * 2, Math.max(2, fw * 0.8));
}

// 실외기 (창 아래 오른쪽 작은 회색 상자)
function paintAC(g, x, y, W) {
  const w = W * 0.16, h = w * 0.62;
  g.fillStyle = 'rgba(0,0,0,.25)'; g.fillRect(x + 2, y + 3, w, h);
  g.fillStyle = '#d9dad6'; g.fillRect(x, y, w, h);
  g.fillStyle = '#8d908f';
  for (let k = 1; k < 5; k++) g.fillRect(x + w * 0.1, y + (h * k) / 5, w * 0.55, 1.5);
  g.beginPath(); g.arc(x + w * 0.8, y + h * 0.5, h * 0.3, 0, Math.PI * 2); g.fill();
}

// 패턴 종류별로 한 칸을 그린다 (W×H 캔버스, y 는 위에서 아래)
function paintPattern(g, W, H, s, { wallColor, frame, glass, mat }) {
  const darker = hex(new THREE.Color(wallColor).multiplyScalar(0.72));
  const metal = /금속/.test(mat);
  if (s.type === 'curtain') {
    // 전면 유리: 층 슬래브 높이에 불투명 스팬드럴, 세로 멀리언 2줄
    const sp = H * 0.16;
    g.fillStyle = glassFill(g, glass, 0, H - sp, 0.45); g.fillRect(0, 0, W, H - sp);
    // 반사 얼룩 (대각선 하이라이트)
    g.save(); g.globalAlpha = 0.12; g.fillStyle = '#ffffff';
    g.beginPath(); g.moveTo(W * 0.15, 0); g.lineTo(W * 0.45, 0); g.lineTo(W * 0.1, H - sp); g.lineTo(-W * 0.2, H - sp); g.fill(); g.restore();
    g.fillStyle = hex(new THREE.Color(glass).multiplyScalar(0.45)); g.fillRect(0, H - sp, W, sp);
    g.fillStyle = frame;
    const mw = 4;
    g.fillRect(0, 0, mw / 2, H); g.fillRect(W - mw / 2, 0, mw / 2, H); g.fillRect(W / 2 - mw / 2, 0, mw, H);
    g.fillRect(0, H - sp - mw / 2, W, mw);
    if (s.hfin) { g.fillStyle = frame; g.fillRect(0, H - sp - 9, W, 9); g.fillStyle = 'rgba(0,0,0,.3)'; g.fillRect(0, H - sp, W, 6); }
    else g.fillRect(0, (H - sp) * 0.5, W, 2);
    if (s.diag) { // X자 철골 격자
      g.strokeStyle = frame; g.lineWidth = 7;
      g.beginPath(); g.moveTo(0, 0); g.lineTo(W, H); g.moveTo(W, 0); g.lineTo(0, H); g.stroke();
    }
    return;
  }
  if (s.type === 'ribbon') {
    // 띠창: 칸 경계 없이 가로로 이어지는 유리 띠 + 아래 스팬드럴
    const y = H * (s.wide ? 0.26 : 0.3), h = H * 0.44;
    g.fillStyle = 'rgba(0,0,0,.28)'; g.fillRect(0, y - 6, W, 6); // 위 슬래브 그림자
    g.fillStyle = glassFill(g, glass, y, h); g.fillRect(0, y, W, h);
    g.fillStyle = frame;
    for (let k = 0; k < 3; k++) g.fillRect((W * k) / 3, y, 3, h);
    g.fillRect(0, y + h - 3, W, 3);
    if (s.band || s.pier) { g.fillStyle = darker; g.fillRect(0, y + h, W, H * 0.06); }
    if (s.hfin) { g.fillStyle = 'rgba(235,236,234,.9)'; g.fillRect(0, y + h * 0.33, W, 4); g.fillRect(0, y + h * 0.66, W, 4); }
    return;
  }
  if (s.type === 'arch') {
    const w = W * 0.4, h = H * 0.66, x = (W - w) / 2, y = H * 0.16;
    paintWindow(g, x, y, w, h, { frame, glass, mull: 1, arch: true, deep: s.deep });
    g.fillStyle = 'rgba(255,255,255,.25)'; g.fillRect(x - 6, y + h + 6, w + 12, 4); // 창대
    return;
  }
  if (s.type === 'vertical') {
    if (/슬릿/.test(s.raw || '') || s.small) {
      const w = W * 0.11, h = H * 0.7; paintWindow(g, (W - w) / 2, H * 0.14, w, h, { frame, glass, mull: 0 });
    } else {
      const w = W * 0.22, h = H * 0.64, gap = W * 0.1, y = H * 0.17;
      paintWindow(g, W / 2 - gap / 2 - w, y, w, h, { frame, glass, mull: 0, deep: s.deep });
      paintWindow(g, W / 2 + gap / 2, y, w, h, { frame, glass, mull: 0, deep: s.deep });
    }
    if (s.pier) { g.fillStyle = darker; g.fillRect(0, 0, W * 0.07, H * 0.96); }
    return;
  }
  if (s.type === 'louver') {
    const y = H * 0.24, h = H * 0.56;
    g.fillStyle = glassFill(g, glass, y, h); g.fillRect(W * 0.04, y, W * 0.92, h);
    if (s.hfin || /수평|가로/.test(s.raw || '')) {
      for (let k = 0; k < 5; k++) { const yy = y + (h * k) / 5; g.fillStyle = 'rgba(0,0,0,.3)'; g.fillRect(0, yy + 6, W, 5); g.fillStyle = 'rgba(232,233,230,.95)'; g.fillRect(0, yy, W, 6); }
    } else {
      for (let k = 0; k < 7; k++) { const xx = (W * k) / 7; g.fillStyle = 'rgba(0,0,0,.3)'; g.fillRect(xx + 9, y - 4, 5, h + 8); g.fillStyle = metal ? '#c9ccce' : 'rgba(232,233,230,.95)'; g.fillRect(xx, y - 6, 9, h + 12); }
    }
    return;
  }
  // punched (격자 개별창)
  let w = W * 0.55, h = H * 0.5, y = H * 0.24;
  if (s.wide) { w = W * 0.72; h = H * 0.38; y = H * 0.28; }
  if (s.tall) { w = W * 0.4; h = H * 0.6; y = H * 0.18; }
  if (s.square) { w = W * 0.42; h = w; y = H * 0.26; }
  if (s.small) { w *= 0.65; h *= 0.75; }
  if (s.band) { g.fillStyle = darker; g.fillRect(0, y + h + 4, W, H * 0.12); }
  if (s.twin) {
    const ww = w * 0.47;
    paintWindow(g, W / 2 - w / 2, y, ww, h, { frame, glass, mull: 0, deep: s.deep });
    paintWindow(g, W / 2 + w / 2 - ww, y, ww, h, { frame, glass, mull: 0, deep: s.deep });
  } else paintWindow(g, (W - w) / 2, y, w, h, { frame, glass, mull: s.wide ? 2 : 1, deep: s.deep });
  if (s.hood) { g.fillStyle = 'rgba(0,0,0,.3)'; g.fillRect((W - w) / 2 - 8, y - 6, w + 16, 9); g.fillStyle = '#d7d6d0'; g.fillRect((W - w) / 2 - 8, y - 12, w + 16, 6); }
  if (s.ac) paintAC(g, (W + w) / 2 - W * 0.16, y + h + 10, W);
  if (s.pier) { g.fillStyle = darker; g.globalAlpha = 0.5; g.fillRect(0, 0, W * 0.06, H); g.globalAlpha = 1; }
}

const texCache = new Map();
// look: { color, mat, pattern, frame, glass } → 반복 텍스처 (u: m/bay, v: m/floor)
// win 을 주면 예전처럼 창 비율을 직접 지정 (hero.js·zones 용), 없으면 pattern 설명으로 창 종류를 고른다.
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
    const wallColor = curtainWall ? '#6f7d86' : color;
    paintWall(g, img, wallColor, W, H, bay, floor);
    if (win) {
      const ww = W * win.w, wh = H * win.h;
      paintWindow(g, (W - ww) / 2, H * win.y, ww, wh, { frame: frame || (curtainWall ? '#8d979c' : '#4a4a48'), glass: glass || (curtainWall ? color : '#34424f'), mull: win.mull, arch: win.arch, curtain: win.curtain });
      if (/금속|루버/.test(mat)) { // 세로 루버 핀
        g.fillStyle = 'rgba(225,228,230,.85)';
        for (let k = 0; k < 6; k++) g.fillRect((k / 6) * W, 0, W * 0.035, H);
      }
    } else {
      const s = { ...parsePattern(pattern, mat), raw: pattern };
      if (/루버/.test(mat) && s.type !== 'curtain') s.type = 'louver';
      const gl = glass || (curtainWall ? color : '#34424f');
      paintPattern(g, W, H, s, { wallColor, frame: frame || (s.type === 'curtain' ? '#8d979c' : '#4a4a48'), glass: gl, mat });
      if (/금속 패널/.test(mat) && s.type !== 'curtain') { // 금속 패널 줄눈
        g.fillStyle = 'rgba(0,0,0,.12)';
        g.fillRect(0, Math.round(H * 0.06), W, 2); g.fillRect(Math.round(W * 0.5), 0, 2, Math.round(H * 0.2));
      }
      // 약속: 맨 아래 3% 는 창 없는 벽 (파라펫·박공벽이 이 줄을 쓴다)
      const strip = Math.max(2, Math.round(H * 0.03));
      g.save(); g.beginPath(); g.rect(0, H - strip, W, strip); g.clip();
      if (s.type === 'curtain') { g.fillStyle = hex(new THREE.Color(gl).multiplyScalar(0.45)); g.fillRect(0, H - strip, W, strip); }
      else paintWall(g, img, wallColor, W, H, bay, floor);
      g.restore();
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
