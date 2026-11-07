export type Quality = {
  name: 'high' | 'med' | 'low';
  pixelRatio: number; // renderer.setPixelRatio(Math.min(devicePixelRatio, pixelRatio))
  shadowMap: number;
  treeShadows: boolean;
  ao: 'full' | 'half' | 'off';
  msaa: 0 | 4;
};

const PRESETS: Record<Quality['name'], Quality> = {
  high: { name: 'high', pixelRatio: 1.5, shadowMap: 2048, treeShadows: true, ao: 'full', msaa: 4 },
  med: { name: 'med', pixelRatio: 1.25, shadowMap: 1024, treeShadows: false, ao: 'half', msaa: 0 },
  low: { name: 'low', pixelRatio: 1, shadowMap: 512, treeShadows: false, ao: 'off', msaa: 0 },
};

export function pickQuality(i: { search: string; dpr: number; cores: number; mobile: boolean }): Quality {
  const asked = new URLSearchParams(i.search).get('q');
  if (asked === 'high' || asked === 'med' || asked === 'low') return PRESETS[asked];
  if (i.mobile || i.cores <= 4) return PRESETS.low;
  if (i.dpr >= 2 || i.cores <= 8) return PRESETS.med;
  return PRESETS.high;
}

export const detectQuality = (): Quality =>
  pickQuality({ search: location.search, dpr: devicePixelRatio, cores: navigator.hardwareConcurrency || 4, mobile: /Mobi|Android|iPhone|iPad/i.test(navigator.userAgent) });
