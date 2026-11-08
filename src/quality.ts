export type Level = 'high' | 'med' | 'low' | 'min';

export type Quality = {
  name: Level;
  /** 렌더 해상도 배율 범위: R3F dpr = [minPixelRatio, pixelRatio] (기기 devicePixelRatio 를 이 사이로 자름) */
  pixelRatio: number;
  minPixelRatio: number;
  /** 해 그림자 */
  shadows: boolean;
  shadowMap: number;
  treeShadows: boolean;
  ao: 'full' | 'half' | 'off';
  msaa: 0 | 4;
  /** M2 가로등 인스턴스 메시 (밤길 레이어) */
  streetlamps: boolean;
  /** 캔버스 기본 안티에일리어싱 — 캔버스를 만들 때만 정해진다 (바꾸면 다음 접속부터) */
  antialias: boolean;
  /** 하늘 HDR 환경광 (끄면 sky_1k.hdr 1MB 를 받지 않고 반구광으로 대신) */
  env: boolean;
  /** 카메라 시야 끝 (m). 줄이면 먼 건물·나무 칸을 통째로 건너뛴다 */
  far: number;
  /** 안개 짙기 배율 — 시야 끝이 짧을 때 잘린 경계가 안 보이게 */
  fogScale: number;
  /** 지형을 가벼운 셰이더·절반 격자로 (CPU 로 그리는 기기용) */
  terrainLite: boolean;
};

export const LEVELS: readonly Level[] = ['high', 'med', 'low', 'min'];
export const LEVEL_LABEL: Record<Level, string> = { high: '높음', med: '보통', low: '낮음', min: '최저' };

const base = { minPixelRatio: 1, shadows: true, antialias: true, env: true, far: 3000, fogScale: 1, terrainLite: false };
export const PRESETS: Record<Level, Quality> = {
  high: { ...base, name: 'high', pixelRatio: 1.5, shadowMap: 2048, treeShadows: true, ao: 'full', msaa: 4, streetlamps: true },
  med: { ...base, name: 'med', pixelRatio: 1.25, shadowMap: 1024, treeShadows: false, ao: 'half', msaa: 0, streetlamps: true },
  low: { ...base, name: 'low', pixelRatio: 1, shadowMap: 512, treeShadows: false, ao: 'off', msaa: 0, streetlamps: false },
  // 그래픽 가속이 꺼진(CPU 로 그리는) 기기용. 실측(SwiftShader): 안티에일리어싱·해상도·지형 셰이더가 가장 큰 비용
  min: { name: 'min', pixelRatio: 0.5, minPixelRatio: 0.5, shadows: false, shadowMap: 512, treeShadows: false, ao: 'off', msaa: 0, streetlamps: false, antialias: false, env: false, far: 350, fogScale: 2.2, terrainLite: true },
};

/** 브라우저가 알려 주는 그래픽 장치 정보 (gfx.ts 의 probeGpu) */
export type GpuInfo = {
  renderer: string;
  /** 그래픽 가속 없이 CPU 로 그림 (크롬 '그래픽 가속 사용' 꺼짐·드라이버 차단 등) */
  software: boolean;
  /** 노트북 내장 그래픽 (인텔·AMD APU·모바일 GPU). 애플 M 칩은 넣지 않는다 */
  integrated: boolean;
  /** navigator.deviceMemory (GB, 크롬만) */
  memoryGb?: number;
  /** 데이터 절약 모드 (크롬 Save-Data) */
  saveData?: boolean;
};

export const isSoftwareRenderer = (r: string) => /swiftshader|llvmpipe|softpipe|software|basic render/i.test(r);
export const isIntegratedRenderer = (r: string) => !/apple/i.test(r) && /intel|\buhd\b|iris|hd graphics|radeon\(tm\) graphics|radeon graphics|vega \d|mali|adreno|powervr/i.test(r);

export const isLevel = (v: unknown): v is Level => typeof v === 'string' && (LEVELS as readonly string[]).includes(v);
/** 둘 중 더 낮은(가벼운) 단계 */
export const lowerOf = (a: Level, b: Level): Level => (LEVELS.indexOf(a) >= LEVELS.indexOf(b) ? a : b);
export const stepDown = (l: Level): Level => LEVELS[Math.min(LEVELS.length - 1, LEVELS.indexOf(l) + 1)];

/** 기기만 보고 고른 시작 단계 (주소 ?q·사용자가 고른 값은 gfx.ts 가 먼저 본다) */
export function pickQuality(i: { search: string; dpr: number; cores: number; mobile: boolean; gpu?: GpuInfo }): Quality {
  const asked = new URLSearchParams(i.search).get('q');
  if (isLevel(asked)) return PRESETS[asked];
  const g = i.gpu;
  if (g?.software) return PRESETS.min;
  if (i.mobile || i.cores <= 4 || g?.integrated || (g?.memoryGb !== undefined && g.memoryGb <= 4) || g?.saveData) return PRESETS.low;
  if (i.dpr >= 2 || i.cores <= 8) return PRESETS.med;
  return PRESETS.high;
}

/**
 * 실행 중 FPS 를 보고 단계를 낮출지 (순수 함수). 창(window) 하나 = 몇 초 동안의 프레임 수·시간.
 * - 'down': 한 단계 낮춤 · 'slow': 이미 최저인데도 너무 느림 → 지도 보기 안내 · null: 그대로
 */
export const FPS_DOWN = 24, FPS_SLOW = 10;
export function judgeFps(level: Level, frames: number, seconds: number): 'down' | 'slow' | null {
  if (seconds < 3) return null; // 너무 짧은 창은 판단하지 않는다 (느린 기기는 3초에 1프레임일 수도 있음)
  const fps = frames / seconds;
  if (level !== 'min' && fps < FPS_DOWN) return 'down';
  if (level === 'min' && fps < FPS_SLOW) return 'slow';
  return null;
}
