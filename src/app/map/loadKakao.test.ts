import { expect, test } from 'vitest';
import { KAKAO_ERRORS, loadKakao } from './loadKakao';

test('no key rejects with NO_KEY and does not add a script', async () => {
  const before = document.scripts.length;
  await expect(loadKakao(undefined)).rejects.toThrow('NO_KEY');
  expect(document.scripts.length).toBe(before);
});
test('every error code has a Korean message', () => {
  for (const code of ['NO_KEY', 'SCRIPT', 'TIMEOUT']) expect(KAKAO_ERRORS[code]).toBeTruthy();
});
test('a script that never answers times out and can be retried', async () => {
  await expect(loadKakao('k', 20)).rejects.toThrow('TIMEOUT');
  await expect(loadKakao('k', 20)).rejects.toThrow('TIMEOUT'); // 실패하면 캐시하지 않는다
});
