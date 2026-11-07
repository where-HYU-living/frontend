import * as THREE from 'three';
import type { MatKey } from './meshBuilder';

/** 작은 결정적 난수 (같은 평면도는 늘 같은 무늬) */
function rng(seed: number) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const gray = (l: number, a = 1) => `rgba(${Math.round(l * 255)},${Math.round(l * 255)},${Math.round(l * 255)},${a})`;

/**
 * 캔버스로 그린 타일형 텍스처. 중립 회색 위주로 그리고 색은 정점 색(방마다 다름)이 곱해진다.
 * meters = 캔버스 한 장이 실제로 덮는 길이(m). UV 가 미터 단위라서 repeat = 1/meters.
 */
function canvasTexture(size: number, meters: number, draw: (g: CanvasRenderingContext2D, s: number) => void, aniso: number): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d');
  if (g) draw(g, size);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(1 / meters, 1 / meters);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = aniso;
  return t;
}

/** 마루: 폭 15cm 판이 가로로, 한 줄에 판 두 장(이음매 하나) */
function wood(aniso: number) {
  return canvasTexture(512, 1.2, (g, s) => {
    const r = rng(11), rows = 8, h = s / rows;
    for (let i = 0; i < rows; i++) {
      const xj = s * (0.25 + r() * 0.5), y = i * h;
      for (const [x0, x1] of [[0, xj], [xj, s]] as const) {
        g.fillStyle = gray(0.84 + r() * 0.14); g.fillRect(x0, y, x1 - x0, h);
        g.lineWidth = 1;
        for (let k = 0; k < 9; k++) { // 나뭇결
          g.strokeStyle = `rgba(95,62,30,${0.05 + r() * 0.06})`;
          const yy = y + 4 + r() * (h - 8), amp = 1 + r() * 2;
          g.beginPath(); g.moveTo(x0, yy);
          for (let sx = x0; sx <= x1; sx += 40) g.lineTo(sx, yy + Math.sin(sx * 0.05 + k) * amp);
          g.stroke();
        }
        g.fillStyle = 'rgba(40,25,10,0.32)'; g.fillRect(x0, y, 2, h); // 판 끝 이음매
      }
      g.fillStyle = 'rgba(40,25,10,0.3)'; g.fillRect(0, y, s, 2); // 판 사이 틈
      g.fillStyle = 'rgba(255,255,255,0.1)'; g.fillRect(0, y + 2, s, 1);
    }
  }, aniso);
}

/** 장판(기숙사 바닥): 마루무늬 인쇄지. 마루보다 대비가 훨씬 약하고 틈이 거의 안 보인다 */
function vinyl(aniso: number) {
  return canvasTexture(512, 1.2, (g, s) => {
    const r = rng(67), rows = 6, h = s / rows;
    for (let i = 0; i < rows; i++) {
      const xj = s * (0.2 + r() * 0.6), y = i * h;
      for (const [x0, x1] of [[0, xj], [xj, s]] as const) {
        g.fillStyle = gray(0.9 + r() * 0.08); g.fillRect(x0, y, x1 - x0, h);
        for (let k = 0; k < 7; k++) {
          g.strokeStyle = `rgba(110,90,60,${0.03 + r() * 0.04})`;
          const yy = y + 6 + r() * (h - 12);
          g.beginPath(); g.moveTo(x0, yy);
          for (let sx = x0; sx <= x1; sx += 50) g.lineTo(sx, yy + Math.sin(sx * 0.04 + k) * 1.5);
          g.stroke();
        }
        g.fillStyle = 'rgba(60,45,25,0.14)'; g.fillRect(x0, y, 1, h);
      }
      g.fillStyle = 'rgba(60,45,25,0.14)'; g.fillRect(0, y, s, 1);
    }
  }, aniso);
}

/** 바닥 타일: 30cm 정사각, 줄눈 */
function tileFloor(aniso: number) {
  return canvasTexture(256, 0.6, (g, s) => {
    const r = rng(23), n = 2, h = s / n;
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
      g.fillStyle = gray(0.93 + r() * 0.06); g.fillRect(j * h, i * h, h, h);
      const grd = g.createLinearGradient(j * h, i * h, (j + 1) * h, (i + 1) * h);
      grd.addColorStop(0, 'rgba(255,255,255,0.10)'); grd.addColorStop(1, 'rgba(0,0,0,0.05)');
      g.fillStyle = grd; g.fillRect(j * h, i * h, h, h);
    }
    g.fillStyle = gray(0.62); // 줄눈
    for (let k = 0; k < n; k++) { g.fillRect(0, k * h - 2, s, 4); g.fillRect(k * h - 2, 0, 4, s); }
    g.fillRect(0, s - 2, s, 2); g.fillRect(s - 2, 0, 2, s);
    for (let k = 0; k < 220; k++) { g.fillStyle = gray(r() > 0.5 ? 1 : 0.5, 0.04); g.fillRect(r() * s, r() * s, 2, 2); }
  }, aniso);
}

/** 욕실 벽 타일: 30×15cm 서브웨이, 반장씩 엇갈려 쌓음 */
function tileWall(aniso: number) {
  return canvasTexture(256, 0.6, (g, s) => {
    const r = rng(37), rows = 4, h = s / rows, w = s / 2;
    for (let i = 0; i < rows; i++) {
      const off = i % 2 ? w / 2 : 0;
      for (let j = -1; j <= 2; j++) {
        g.fillStyle = gray(0.95 + r() * 0.045); g.fillRect(off + j * w, i * h, w, h);
        const grd = g.createLinearGradient(0, i * h, 0, (i + 1) * h);
        grd.addColorStop(0, 'rgba(255,255,255,0.18)'); grd.addColorStop(1, 'rgba(0,0,0,0.04)');
        g.fillStyle = grd; g.fillRect(off + j * w, i * h, w, h);
        g.fillStyle = gray(0.7); g.fillRect(off + j * w - 1, i * h, 2, h);
      }
      g.fillStyle = gray(0.7); g.fillRect(0, i * h - 1, s, 2);
    }
  }, aniso);
}

function concrete(aniso: number) {
  return canvasTexture(256, 1, (g, s) => {
    const r = rng(41);
    g.fillStyle = gray(0.86); g.fillRect(0, 0, s, s);
    for (let k = 0; k < 14; k++) { // 큰 얼룩
      const x = r() * s, y = r() * s, rad = 30 + r() * 60, grd = g.createRadialGradient(x, y, 0, x, y, rad);
      grd.addColorStop(0, gray(r() > 0.5 ? 1 : 0.55, 0.07)); grd.addColorStop(1, gray(0.8, 0));
      g.fillStyle = grd; g.fillRect(x - rad, y - rad, rad * 2, rad * 2);
    }
    for (let k = 0; k < 3500; k++) { g.fillStyle = gray(r() > 0.5 ? 1 : 0.4, 0.05 + r() * 0.06); g.fillRect(r() * s, r() * s, 1 + r() * 1.5, 1 + r() * 1.5); }
  }, aniso);
}

/** 도장 벽: 거의 평평하고 아주 약한 결 */
function paint(aniso: number) {
  return canvasTexture(128, 0.5, (g, s) => {
    const r = rng(53);
    g.fillStyle = gray(0.975); g.fillRect(0, 0, s, s);
    for (let k = 0; k < 900; k++) { g.fillStyle = gray(r() > 0.5 ? 1 : 0.6, 0.025); g.fillRect(r() * s, r() * s, 2, 2); }
  }, aniso);
}

export type InteriorMaterials = { mats: Record<MatKey, THREE.Material>; dispose: () => void };

export function makeMaterials(aniso = 8): InteriorMaterials {
  const t = { wood: wood(aniso), vinyl: vinyl(aniso), tile: tileFloor(aniso), wallTile: tileWall(aniso), conc: concrete(aniso), paint: paint(aniso) };
  const std = (p: THREE.MeshStandardMaterialParameters) => new THREE.MeshStandardMaterial({ vertexColors: true, ...p });
  const mats: Record<MatKey, THREE.Material> = {
    paint: std({ map: t.paint, roughness: 0.93 }),
    wallTile: std({ map: t.wallTile, roughness: 0.22 }),
    concrete: std({ map: t.conc, roughness: 0.92 }),
    wood: std({ map: t.wood, roughness: 0.46 }),
    tile: std({ map: t.tile, roughness: 0.2 }),
    vinyl: std({ map: t.vinyl, roughness: 0.6 }),
    ceiling: std({ map: t.paint, roughness: 1 }),
    trim: std({ roughness: 0.55 }),
    matte: std({ roughness: 0.78 }),
    gloss: std({ roughness: 0.16 }),
    metal: std({ roughness: 0.28, metalness: 0.9 }),
    glass: std({ transparent: true, opacity: 0.2, roughness: 0.04, depthWrite: false }),
    lamp: new THREE.MeshBasicMaterial({ vertexColors: true }),
  };
  return {
    mats,
    dispose: () => { Object.values(t).forEach((x) => x.dispose()); Object.values(mats).forEach((m) => m.dispose()); },
  };
}
