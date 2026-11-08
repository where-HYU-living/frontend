import { create } from 'zustand';
import { PRESETS, isIntegratedRenderer, isLevel, isSoftwareRenderer, lowerOf, pickQuality, stepDown, type GpuInfo, type Level, type Quality } from './quality';

/**
 * 그래픽 품질 상태 (3D 동네·실내가 같이 쓴다).
 * 정하는 순서: 주소 ?q= → 사용자가 고른 값(더 보기 > 그래픽) → 자동(기기·그래픽 장치) + 이 장치에서 전에 자동으로 낮췄던 단계.
 * 자동일 때만 실행 중 FPS 를 보고 한 단계씩 낮춘다(FpsGuard). 낮춘 단계는 같은 그래픽 장치면 다음 접속에도 쓴다.
 */
export type Choice = 'auto' | Level;
type Saved = { choice?: Choice; auto?: { renderer: string; level: Level } };
const KEY = 'chatatda.gfx';

const load = (): Saved => { try { return JSON.parse(localStorage.getItem(KEY) || '{}') as Saved; } catch { return {}; } };
const save = (s: Saved) => { try { localStorage.setItem(KEY, JSON.stringify(s)); } catch { /* 저장 못 해도 이번 접속은 그대로 */ } };

/** 브라우저가 알려 주는 그래픽 장치. 크롬 설정 화면(chrome://settings)은 웹페이지가 읽을 수 없으므로, WebGL 이 실제로 무엇으로 그리는지로 판단한다 */
export function probeGpu(): GpuInfo {
  const nav = navigator as Navigator & { deviceMemory?: number; connection?: { saveData?: boolean } };
  const info: GpuInfo = { renderer: '', software: false, integrated: false, memoryGb: nav.deviceMemory, saveData: nav.connection?.saveData };
  try {
    const c = document.createElement('canvas');
    // 하드웨어 가속이 꺼져 있으면 크롬은 이 옵션에서 컨텍스트를 주지 않는다 (= 성능이 크게 떨어지는 소프트웨어 렌더)
    const fast = c.getContext('webgl2', { failIfMajorPerformanceCaveat: true }) as WebGL2RenderingContext | null;
    const gl = fast ?? (document.createElement('canvas').getContext('webgl2') as WebGL2RenderingContext | null);
    if (gl) {
      const ext = gl.getExtension('WEBGL_debug_renderer_info');
      info.renderer = String(gl.getParameter(ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER) ?? '');
      gl.getExtension('WEBGL_lose_context')?.loseContext();
    }
    info.software = (!fast && !!gl) || isSoftwareRenderer(info.renderer);
    info.integrated = isIntegratedRenderer(info.renderer);
  } catch { /* WebGL 자체가 없으면 3D 가 어차피 안 뜬다 */ }
  return info;
}

/** 지금 단계 계산 (순수: 테스트용) */
export function resolveLevel(i: { search: string; saved: Saved; auto: Level; renderer: string }): { level: Level; choice: Choice; fromUrl: boolean } {
  const asked = new URLSearchParams(i.search).get('q');
  if (isLevel(asked)) return { level: asked, choice: asked, fromUrl: true };
  const choice = i.saved.choice && (i.saved.choice === 'auto' || isLevel(i.saved.choice)) ? i.saved.choice : 'auto';
  if (choice !== 'auto') return { level: choice, choice, fromUrl: false };
  const prev = i.saved.auto && i.saved.auto.renderer === i.renderer && isLevel(i.saved.auto.level) ? i.saved.auto.level : null;
  return { level: prev ? lowerOf(i.auto, prev) : i.auto, choice, fromUrl: false };
}

type GfxState = {
  gpu: GpuInfo;
  /** 기기만 보고 고른 단계 */
  autoLevel: Level;
  choice: Choice;
  fromUrl: boolean;
  level: Level;
  Q: Quality;
  /** 최저인데도 너무 느림 → 지도 보기 안내 */
  slow: boolean;
  /** 처음 캔버스를 만들 때의 안티에일리어싱 (실행 중엔 못 바꿈 → 다르면 '새로고침하면 적용' 안내) */
  bootAntialias: boolean;
  setChoice: (c: Choice) => void;
  /** 자동일 때 한 단계 낮춘다. 낮췄으면 true */
  autoStepDown: () => boolean;
  markSlow: () => void;
};

function init(): Omit<GfxState, 'setChoice' | 'autoStepDown' | 'markSlow'> {
  const gpu = typeof document === 'undefined' ? { renderer: '', software: false, integrated: false } : probeGpu();
  const autoLevel = pickQuality({ search: '', dpr: devicePixelRatio, cores: navigator.hardwareConcurrency || 4, mobile: /Mobi|Android|iPhone|iPad/i.test(navigator.userAgent), gpu }).name;
  const r = resolveLevel({ search: location.search, saved: load(), auto: autoLevel, renderer: gpu.renderer });
  return { gpu, autoLevel, choice: r.choice, fromUrl: r.fromUrl, level: r.level, Q: PRESETS[r.level], slow: false, bootAntialias: PRESETS[r.level].antialias };
}

export const useGfx = create<GfxState>((set, get) => ({
  ...init(),
  setChoice: (choice) => {
    const s = load();
    // 사용자가 직접 고르면 자동으로 낮춰 둔 기록은 지운다 (다시 자동으로 돌아가면 기기 기준부터)
    save({ choice, auto: choice === 'auto' ? undefined : s.auto });
    const level = choice === 'auto' ? get().autoLevel : choice;
    set({ choice, fromUrl: false, level, Q: PRESETS[level], slow: false });
  },
  autoStepDown: () => {
    const { choice, fromUrl, level, gpu } = get();
    if (choice !== 'auto' || fromUrl || level === 'min') return false;
    const next = stepDown(level);
    save({ ...load(), auto: { renderer: gpu.renderer, level: next } });
    set({ level: next, Q: PRESETS[next] });
    return true;
  },
  markSlow: () => set({ slow: true }),
}));

/** 그래픽 가속을 켜는 방법 (브라우저별). 웹페이지는 chrome:// 주소를 열 수 없어서 주소를 복사해 붙여 넣게 한다 */
export function accelHelp(ua = navigator.userAgent): { browser: string; url: string | null; steps: string } {
  if (/Edg\//.test(ua)) return { browser: '엣지', url: 'edge://settings/system', steps: "설정 → 시스템 및 성능 → '사용 가능한 경우 그래픽 가속 사용' 켜기 → 엣지 다시 시작" };
  if (/Whale\//.test(ua)) return { browser: '웨일', url: 'whale://settings/system', steps: "설정 → 시스템 → '가능한 경우 하드웨어 가속 사용' 켜기 → 웨일 다시 시작" };
  if (/Chrome\//.test(ua)) return { browser: '크롬', url: 'chrome://settings/system', steps: "설정 → 시스템 → '가능한 경우 그래픽 가속 사용' 켜기 → 크롬 다시 시작" };
  if (/Firefox\//.test(ua)) return { browser: '파이어폭스', url: 'about:preferences', steps: "설정 → 일반 → 성능 → '권장 성능 설정 사용' 끄고 '가능한 경우 하드웨어 가속 사용' 켜기 → 다시 시작" };
  return { browser: '브라우저', url: null, steps: '브라우저 설정에서 하드웨어(그래픽) 가속을 켜고 다시 시작' };
}

// 점검 스크립트(scripts/gfx-check.mjs)용 — dev 에서만
if (import.meta.env.DEV && typeof window !== 'undefined') (window as unknown as { __gfx: typeof useGfx }).__gfx = useGfx;
