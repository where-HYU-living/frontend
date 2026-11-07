import { describe, expect, it } from 'vitest';
import { AVATAR_KEY, DEFAULT_APPEARANCE, JACKETS, isJacketId, jacketForDepartment, loadAppearance, sanitizeAppearance, saveAppearance } from './avatar';
import { hasStyle } from './jacketStyles.js';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

const mem = () => { const m = new Map<string, string>(); return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v) }; };

describe('avatar', () => {
  it('학과 이름 → 학과잠바, 없는 학과는 null', () => {
    expect(jacketForDepartment('정보시스템학과')).toBe('dept-is');
    expect(jacketForDepartment('기계공학과')).toBeNull();
    expect(jacketForDepartment(null)).toBeNull();
  });
  it('잠바 id 는 알려진 것만, 옛 저장값(#색)·이상한 값은 기본 잠바', () => {
    expect(isJacketId('school3')).toBe(true);
    expect(isJacketId('#141f3c')).toBe(false);
    expect(sanitizeAppearance({ jacket: '#141f3c', hair: '#ABCDEF', skin: 5 })).toEqual({ jacket: 'school1', hair: '#abcdef', skin: DEFAULT_APPEARANCE.skin });
    expect(sanitizeAppearance({ jacket: 'dept-is' }).jacket).toBe('dept-is');
    expect(sanitizeAppearance(null)).toEqual(DEFAULT_APPEARANCE);
  });
  it('저장 후 복원', () => {
    const s = mem();
    saveAppearance({ jacket: 'school3', hair: '#0f0f12', skin: '#e0a97f' }, s);
    expect(loadAppearance(s)).toEqual({ jacket: 'school3', hair: '#0f0f12', skin: '#e0a97f' });
  });
  it('모든 잠바는 3D 스타일 표와 썸네일 파일이 있다', () => {
    for (const j of JACKETS) {
      expect(hasStyle(j.id)).toBe(true);
      expect(existsSync(resolve(__dirname, '../../public', j.thumb))).toBe(true);
    }
  });
  it('깨진 JSON·예외는 기본값', () => {
    expect(loadAppearance({ getItem: () => '{oops' })).toEqual(DEFAULT_APPEARANCE);
    expect(loadAppearance({ getItem: () => { throw new Error('blocked'); } })).toEqual(DEFAULT_APPEARANCE);
    expect(() => saveAppearance(DEFAULT_APPEARANCE, { setItem: () => { throw new Error('full'); } })).not.toThrow();
    expect(AVATAR_KEY).toBeTruthy();
  });
});
