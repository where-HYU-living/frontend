export type TimeOfDay = 'day' | 'evening' | 'night';

/** 시간대별 빛. sunDir 은 해(달)가 있는 방향(정규화 전), 낮 값은 원래 월드 설정과 같다 */
export const LIGHT_PRESETS: Record<TimeOfDay, {
  sun: number; sunColor: number; sunDir: [number, number, number];
  hemi: number; env: number; bg: number; fog: number; fogDensity: number; exposure: number;
}> = {
  day: { sun: 3.0, sunColor: 0xfff1dc, sunDir: [-0.62, 0.66, 0.42], hemi: 0.6, env: 0.8, bg: 1, fog: 0xc9d7e4, fogDensity: 0.0026, exposure: 1.05 },
  evening: { sun: 1.8, sunColor: 0xffa860, sunDir: [-0.85, 0.22, 0.3], hemi: 0.4, env: 0.45, bg: 0.55, fog: 0xd9a98a, fogDensity: 0.003, exposure: 1.0 },
  night: { sun: 0.35, sunColor: 0x8fa8ff, sunDir: [0.4, 0.7, -0.5], hemi: 0.22, env: 0.12, bg: 0.12, fog: 0x1a2236, fogDensity: 0.0035, exposure: 0.9 },
};
