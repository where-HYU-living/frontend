/** 슬라이더 위치 t: 0 = 낮(왼쪽 끝, 오후 12시) → 0.5 = 저녁(오후 6시 30분) → 1 = 밤(오른쪽 끝, 밤 12시) */
export type Light = {
  sun: number; sunColor: number; sunDir: [number, number, number];
  hemi: number; env: number; bg: number; fog: number; fogDensity: number; exposure: number;
};

export const LIGHT_PRESETS: { day: Light; evening: Light; night: Light } = {
  day: { sun: 3.0, sunColor: 0xfff1dc, sunDir: [-0.62, 0.66, 0.42], hemi: 0.6, env: 0.8, bg: 1, fog: 0xc9d7e4, fogDensity: 0.0026, exposure: 1.05 },
  evening: { sun: 1.8, sunColor: 0xffa860, sunDir: [-0.85, 0.22, 0.3], hemi: 0.4, env: 0.45, bg: 0.55, fog: 0xd9a98a, fogDensity: 0.003, exposure: 1.0 },
  night: { sun: 0.35, sunColor: 0x8fa8ff, sunDir: [0.4, 0.7, -0.5], hemi: 0.22, env: 0.12, bg: 0.12, fog: 0x1a2236, fogDensity: 0.0035, exposure: 0.9 },
};

const lerp = (a: number, b: number, k: number) => a + (b - a) * k;
const lerpHex = (a: number, b: number, k: number) => {
  const c = (h: number, s: number) => (h >> s) & 255;
  return (Math.round(lerp(c(a, 16), c(b, 16), k)) << 16) | (Math.round(lerp(c(a, 8), c(b, 8), k)) << 8) | Math.round(lerp(c(a, 0), c(b, 0), k));
};
const mix = (a: Light, b: Light, k: number): Light => ({
  sun: lerp(a.sun, b.sun, k), sunColor: lerpHex(a.sunColor, b.sunColor, k),
  sunDir: [lerp(a.sunDir[0], b.sunDir[0], k), lerp(a.sunDir[1], b.sunDir[1], k), lerp(a.sunDir[2], b.sunDir[2], k)],
  hemi: lerp(a.hemi, b.hemi, k), env: lerp(a.env, b.env, k), bg: lerp(a.bg, b.bg, k),
  fog: lerpHex(a.fog, b.fog, k), fogDensity: lerp(a.fogDensity, b.fogDensity, k), exposure: lerp(a.exposure, b.exposure, k),
});

/** 슬라이더 위치(0~1)에 맞는 빛. 낮→저녁→밤을 이어 붙여 부드럽게 보간 */
export function lightAt(t: number): Light {
  const x = Math.min(1, Math.max(0, t));
  return x < 0.5 ? mix(LIGHT_PRESETS.day, LIGHT_PRESETS.evening, x / 0.5) : mix(LIGHT_PRESETS.evening, LIGHT_PRESETS.night, (x - 0.5) / 0.5);
}

/** 별이 보이는 정도 (0~1): 저녁 끝(0.6)부터 서서히 나타나 밤(1)에 가장 밝다 */
export function starsAt(t: number): number {
  const k = Math.min(1, Math.max(0, (t - 0.6) / 0.35));
  return k * k * (3 - 2 * k);
}

/** 화면에 보일 시각. 0 → 오후 12:00, 0.5 → 오후 6:00, 1 → 오전 12:00 (낮 12시에서 한밤 12시까지 12시간) */
export function clockLabel(t: number): string {
  const x = Math.min(1, Math.max(0, t));
  const total = Math.round(12 * 60 + x * 12 * 60); // 분
  const h24 = Math.floor(total / 60) % 24, m = total % 60;
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  return `${h24 >= 12 ? '오후' : '오전'} ${h12}:${String(m).padStart(2, '0')}`;
}
