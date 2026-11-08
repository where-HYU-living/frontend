import { expect, test } from 'vitest';
import { isIntegratedRenderer, isSoftwareRenderer, judgeFps, lowerOf, pickQuality, PRESETS, stepDown } from './quality';
import { accelHelp, resolveLevel } from './gfx';
import { shortRenderer } from './app/GfxSettings';

const base = { search: '', dpr: 1, cores: 16, mobile: false };
const gpu = (renderer: string, extra = {}) => ({ renderer, software: isSoftwareRenderer(renderer), integrated: isIntegratedRenderer(renderer), ...extra });

test('explicit ?q wins', () => expect(pickQuality({ ...base, search: '?q=low' }).name).toBe('low'));
test('?q=min is the lowest preset', () => expect(pickQuality({ ...base, search: '?q=min' }).name).toBe('min'));
test('mobile defaults to low', () => expect(pickQuality({ ...base, dpr: 3, cores: 8, mobile: true }).name).toBe('low'));
test('retina laptop defaults to med', () => expect(pickQuality({ ...base, dpr: 2, cores: 10 }).name).toBe('med'));
test('big desktop defaults to high', () => expect(pickQuality(base).name).toBe('high'));
test('med has no tree shadows and 1024 shadow map', () => {
  const q = pickQuality({ ...base, search: '?q=med' });
  expect([q.treeShadows, q.shadowMap]).toEqual([false, 1024]);
});
test('unknown q falls back to auto', () => expect(pickQuality({ ...base, search: '?q=ultra' }).name).toBe('high'));

// 그래픽 장치로 고르기
test('software rendering (graphics acceleration off) → min', () => {
  const g = gpu('ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (LLVM 10.0.0) (0x0000C0DE)), SwiftShader driver)');
  expect(g.software).toBe(true);
  expect(pickQuality({ ...base, gpu: g }).name).toBe('min');
});
test('Intel integrated GPU with many cores → low (not high)', () => {
  const g = gpu('ANGLE (Intel, Intel(R) UHD Graphics 620 (0x00003EA0) Direct3D11 vs_5_0 ps_5_0, D3D11)');
  expect(g.integrated).toBe(true);
  expect(pickQuality({ ...base, cores: 12, gpu: g }).name).toBe('low');
});
test('Apple M chip is not "integrated" → normal rule', () => {
  const g = gpu('ANGLE (Apple, ANGLE Metal Renderer: Apple M3 Pro, Unspecified Version)');
  expect([g.integrated, g.software]).toEqual([false, false]);
  expect(pickQuality({ ...base, dpr: 2, cores: 11, gpu: g }).name).toBe('med');
});
test('NVIDIA desktop stays high', () => expect(pickQuality({ ...base, gpu: gpu('ANGLE (NVIDIA, NVIDIA GeForce RTX 3060 Direct3D11 vs_5_0 ps_5_0, D3D11)') }).name).toBe('high'));
test('4GB memory or data saver → low', () => {
  expect(pickQuality({ ...base, gpu: gpu('NVIDIA GeForce', { memoryGb: 4 }) }).name).toBe('low');
  expect(pickQuality({ ...base, gpu: gpu('NVIDIA GeForce', { saveData: true }) }).name).toBe('low');
});

test('min preset turns off the expensive parts measured on software rendering', () => {
  const m = PRESETS.min;
  expect([m.antialias, m.shadows, m.env, m.terrainLite, m.ao, m.msaa]).toEqual([false, false, false, true, 'off', 0]);
  expect(m.pixelRatio).toBeLessThan(1);
  expect(m.far).toBeLessThan(PRESETS.low.far);
});
test('stepDown / lowerOf', () => {
  expect([stepDown('high'), stepDown('med'), stepDown('low'), stepDown('min')]).toEqual(['med', 'low', 'min', 'min']);
  expect(lowerOf('high', 'low')).toBe('low');
  expect(lowerOf('min', 'med')).toBe('min');
});

// 실행 중 FPS 판단
test('judgeFps: under 24fps steps down, under 10fps at min is "slow"', () => {
  expect(judgeFps('high', 80, 4)).toBe('down'); // 20fps
  expect(judgeFps('high', 200, 4)).toBe(null); // 50fps
  expect(judgeFps('min', 80, 4)).toBe(null); // 최저는 더 못 낮춤
  expect(judgeFps('min', 20, 4)).toBe('slow'); // 5fps
  expect(judgeFps('low', 1, 4)).toBe('down'); // 4초에 1프레임 (CPU 렌더)
  expect(judgeFps('high', 10, 1)).toBe(null); // 창이 너무 짧으면 판단 보류
});

// 단계 결정 순서: 주소 → 직접 고른 값 → 자동(+ 같은 장치에서 전에 낮춘 단계)
test('resolveLevel order', () => {
  const r = 'GPU-A';
  expect(resolveLevel({ search: '?q=high', saved: { choice: 'min' }, auto: 'med', renderer: r })).toEqual({ level: 'high', choice: 'high', fromUrl: true });
  expect(resolveLevel({ search: '', saved: { choice: 'low' }, auto: 'high', renderer: r }).level).toBe('low');
  expect(resolveLevel({ search: '', saved: {}, auto: 'high', renderer: r }).level).toBe('high');
  expect(resolveLevel({ search: '', saved: { choice: 'auto', auto: { renderer: r, level: 'low' } }, auto: 'high', renderer: r }).level).toBe('low');
  // 다른 그래픽 장치에서 낮춘 기록은 쓰지 않는다
  expect(resolveLevel({ search: '', saved: { auto: { renderer: 'GPU-B', level: 'min' } }, auto: 'high', renderer: r }).level).toBe('high');
  // 깨진 저장값은 자동으로
  expect(resolveLevel({ search: '', saved: { choice: 'ultra' as never }, auto: 'med', renderer: r }).level).toBe('med');
});

test('accelHelp gives a settings address per browser', () => {
  expect(accelHelp('Mozilla/5.0 (Windows NT 10.0) AppleWebKit/537.36 Chrome/131.0 Safari/537.36').url).toBe('chrome://settings/system');
  expect(accelHelp('Mozilla/5.0 Chrome/131.0 Safari/537.36 Edg/131.0').url).toBe('edge://settings/system');
  expect(accelHelp('Mozilla/5.0 Chrome/131.0 Whale/4.0 Safari/537.36').url).toBe('whale://settings/system');
});
test('shortRenderer', () => {
  expect(shortRenderer('ANGLE (Apple, ANGLE Metal Renderer: Apple M3 Pro, Unspecified Version)')).toBe('Apple M3 Pro');
  expect(shortRenderer('ANGLE (Intel, Intel(R) UHD Graphics 620 (0x00003EA0) Direct3D11 vs_5_0 ps_5_0, D3D11)')).toBe('Intel(R) UHD Graphics 620');
});
