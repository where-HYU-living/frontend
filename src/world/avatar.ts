// 캐릭터 외형 (순수 모델). 잠바는 종류 id, 머리·피부는 '#rrggbb'. 서버 계약에는 아직 없다 → 내 화면의 내 캐릭터에만 적용.
export type JacketId = 'school1' | 'school2' | 'school3' | 'dept-is';

export type JacketInfo = {
  id: JacketId;
  kind: 'school' | 'dept';
  label: string;
  desc: string;
  /** 학과잠바가 맞는 학과 이름 (학과 데이터의 name 과 같음) */
  deptName?: string;
  /** 선택 카드 썸네일 (public/avatar/, 등판 사진을 작게 자른 것) */
  thumb: string;
};

export const JACKETS: JacketInfo[] = [
  { id: 'school1', kind: 'school', label: '학교잠바 1', desc: '남색 · HANYANG UNIV.', thumb: 'avatar/jacket-school1.jpg' },
  { id: 'school2', kind: 'school', label: '학교잠바 2', desc: '검정 · 사자 · 漢陽大學校', thumb: 'avatar/jacket-school2.jpg' },
  { id: 'school3', kind: 'school', label: '학교잠바 3', desc: '검정 가죽 · 금색 자수', thumb: 'avatar/jacket-school3.jpg' },
  { id: 'dept-is', kind: 'dept', label: '정보시스템학과', desc: '남색 · HANYANG TECH', deptName: '정보시스템학과', thumb: 'avatar/jacket-dept-is.jpg' },
];
export const SCHOOL_JACKETS = JACKETS.filter((j) => j.kind === 'school');
export const DEPT_JACKETS = JACKETS.filter((j) => j.kind === 'dept');

const JACKET_IDS = new Set<string>(JACKETS.map((j) => j.id));
export const isJacketId = (v: unknown): v is JacketId => typeof v === 'string' && JACKET_IDS.has(v);

export type Appearance = { jacket: JacketId; hair: string; skin: string };

export const DEFAULT_APPEARANCE: Appearance = { jacket: 'school1', hair: '#2a1d16', skin: '#f2c9a5' };

/** 학과 이름 → 그 학과 잠바 id. 아직 없는 학과는 null (준비 중) */
export function jacketForDepartment(deptName: string | null | undefined): JacketId | null {
  if (!deptName) return null;
  return DEPT_JACKETS.find((j) => j.deptName === deptName)?.id ?? null;
}

export const HAIR_SWATCHES = ['#2a1d16', '#0f0f12', '#5a3a22', '#8a5a2b', '#c9a45c', '#8c8c92', '#b3262d', '#3d5a9e'];
export const SKIN_SWATCHES = ['#fbdcc2', '#f2c9a5', '#e0a97f', '#c58c63', '#9a6a46', '#6f4a32'];

const HEX = /^#[0-9a-f]{6}$/i;
const pick = (v: unknown, fallback: string) => (typeof v === 'string' && HEX.test(v) ? v.toLowerCase() : fallback);

/** 알 수 없는 값/깨진 JSON 은 기본값으로 */
export function sanitizeAppearance(raw: unknown): Appearance {
  const o = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  return { jacket: isJacketId(o.jacket) ? o.jacket : DEFAULT_APPEARANCE.jacket, hair: pick(o.hair, DEFAULT_APPEARANCE.hair), skin: pick(o.skin, DEFAULT_APPEARANCE.skin) };
}

export const AVATAR_KEY = 'chatatda.avatar';

export function saveAppearance(a: Appearance, store: Pick<Storage, 'setItem'> | undefined = safeStorage()): void {
  try { store?.setItem(AVATAR_KEY, JSON.stringify(sanitizeAppearance(a))); } catch { /* 저장 불가 환경은 무시 */ }
}

export function loadAppearance(store: Pick<Storage, 'getItem'> | undefined = safeStorage()): Appearance {
  try {
    const s = store?.getItem(AVATAR_KEY);
    return s ? sanitizeAppearance(JSON.parse(s)) : { ...DEFAULT_APPEARANCE };
  } catch { return { ...DEFAULT_APPEARANCE }; }
}

function safeStorage(): Storage | undefined {
  try { return typeof localStorage === 'undefined' ? undefined : localStorage; } catch { return undefined; }
}
