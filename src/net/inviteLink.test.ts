import { expect, test } from 'vitest';
import { addRoomToInviteUrl, parseRoomInvite, stripRoomParams } from './inviteLink';

test('방 정보를 링크에 붙였다가 그대로 읽는다 (한글 이름·소수 둘째 자리·기존 invite 유지)', () => {
  const url = addRoomToInviteUrl('https://app.example/?invite=inv_x7k2', { floorplanId: 7, title: '제1학생생활관 2인실 & 욕실', x: 1.2345, z: -3.456, yaw: 0.5 });
  expect(url).toContain('invite=inv_x7k2');
  expect(new URL(url).searchParams.get('at')).toBe('1.23,-3.46,0.5');
  expect(parseRoomInvite(new URL(url).search)).toEqual({ floorplanId: 7, title: '제1학생생활관 2인실 & 욕실', x: 1.23, z: -3.46, yaw: 0.5 });
});

test('잘못된 링크는 무시한다 (방 정보가 없거나, 숫자가 아니거나, 범위를 벗어남)', () => {
  const bad = ['', '?invite=a', '?room=abc&at=1,2,3', '?room=0&at=1,2,3', '?room=-4&at=1,2,3', '?room=2.5&at=1,2,3', '?room=7', '?room=7&at=1,2', '?room=7&at=1,2,3,4', '?room=7&at=a,b,c', '?room=7&at=NaN,2,3', '?room=7&at=9999,2,3', '?room=7&at=1,-9999,3'];
  for (const s of bad) expect(parseRoomInvite(s), s).toBeNull();
});

test('이름이 없으면 기본 이름, 너무 길면 60자까지, 앞뒤 공백은 지운다', () => {
  expect(parseRoomInvite('?room=7&at=1,2,3')!.title).toBe('초대받은 방');
  expect(parseRoomInvite('?room=7&at=1,2,3&label=%20%20')!.title).toBe('초대받은 방');
  expect(parseRoomInvite(`?room=7&at=1,2,3&label=${'가'.repeat(100)}`)!.title).toHaveLength(60);
  expect(parseRoomInvite('?room=7&at=1,2,3&label=%20방%20')!.title).toBe('방');
});

test('주소창 정리는 방 정보만 지우고 나머지는 남긴다', () => {
  expect(stripRoomParams('?room=7&at=1,2,3&label=x&solo=1&q=low')).toBe('?solo=1&q=low');
  expect(stripRoomParams('?room=7&at=1,2,3&label=x')).toBe('');
  expect(stripRoomParams('')).toBe('');
});
