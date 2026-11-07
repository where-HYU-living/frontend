import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { CHAT_MS, emptyWorld, interpolate, worldReducer, type ServerMsg } from './worldReducer';
import { BACKOFF, connectWorld, type SocketLike } from './worldSocket';

const P = (id: string, x = 0) => ({ id, nickname: id, p: [x, 0, 0] as [number, number, number], r: 0, a: 'idle' });

test('welcome replaces players and excludes self', () => {
  let m = worldReducer(emptyWorld(), { t: 'welcome', selfId: 's', spawn: { p: [0, 0, 0], r: 0 }, players: [P('a'), P('b')] }, 0);
  m = worldReducer(m, { t: 'welcome', selfId: 's', spawn: { p: [0, 0, 0], r: 0 }, players: [P('c'), P('s')] }, 1);
  expect(Object.keys(m.players)).toEqual(['c']);
});

test('state appends samples capped at 10, leave removes', () => {
  let m = worldReducer(emptyWorld(), { t: 'welcome', selfId: 's', spawn: { p: [0, 0, 0], r: 0 }, players: [P('a')] }, 0);
  for (let i = 1; i <= 15; i++) m = worldReducer(m, { t: 'state', players: [P('a', i)] }, i);
  expect(m.players.a.samples).toHaveLength(10);
  m = worldReducer(m, { t: 'leave', id: 'a' }, 99);
  expect(m.players.a).toBeUndefined();
});

test('chat shows for 5s window', () => {
  let m = worldReducer(emptyWorld(), { t: 'welcome', selfId: 's', spawn: { p: [0, 0, 0], r: 0 }, players: [P('a')] }, 0);
  m = worldReducer(m, { t: 'chat', id: 'a', m: '안녕' }, 1000);
  expect(m.players.a.chat).toEqual({ m: '안녕', until: 1000 + CHAT_MS });
});

test('interpolates midpoint, single sample returns itself', () => {
  const s = [{ t: 0, p: [0, 0, 0] as [number, number, number], r: 0 }, { t: 100, p: [10, 0, 0] as [number, number, number], r: 0 }];
  expect(interpolate(s, 50).p[0]).toBeCloseTo(5);
  expect(interpolate([s[1]], 0).p[0]).toBe(10);
});

// ----- 소켓 -----
class Fake implements SocketLike {
  static all: Fake[] = [];
  sent: string[] = []; readyState = 0;
  onopen: (() => void) | null = null; onclose: (() => void) | null = null; onmessage: ((e: { data: string }) => void) | null = null;
  constructor() { Fake.all.push(this); }
  send(s: string) { this.sent.push(s); }
  close() { this.onclose?.(); }
  open() { this.readyState = 1; this.onopen?.(); }
}
beforeEach(() => { Fake.all = []; vi.useFakeTimers(); });
afterEach(() => vi.useRealTimers());

test('reconnect backoff 1,2,4,8,10,10', () => {
  connectWorld({ url: 'x', getPose: () => ({ p: [0, 0, 0], r: 0, a: 'idle' }), onMessage: () => {}, make: () => new Fake() });
  const gaps: number[] = [];
  for (let i = 0; i < 6; i++) {
    const n = Fake.all.length;
    Fake.all[n - 1].close();
    const want = BACKOFF[Math.min(i, BACKOFF.length - 1)];
    vi.advanceTimersByTime(want - 1);
    expect(Fake.all.length).toBe(n); // 아직 재접속 전
    vi.advanceTimersByTime(1);
    expect(Fake.all.length).toBe(n + 1);
    gaps.push(want);
  }
  expect(gaps).toEqual([1000, 2000, 4000, 8000, 10000, 10000]);
});

test('move is throttled to 10Hz and skipped when standing still', () => {
  let x = 0;
  connectWorld({ url: 'x', getPose: () => ({ p: [x, 0, 0], r: 0, a: 'idle' }), onMessage: () => {}, make: () => new Fake() });
  const s = Fake.all[0]; s.open();
  vi.advanceTimersByTime(1000); // 안 움직임: 첫 한 번만
  expect(s.sent.filter((m) => m.includes('"move"'))).toHaveLength(1);
  x = 1; vi.advanceTimersByTime(100); x = 2; vi.advanceTimersByTime(100);
  expect(s.sent.filter((m) => m.includes('"move"'))).toHaveLength(3);
});

test('WORLD_FULL stops reconnecting', () => {
  const status: string[] = [];
  connectWorld({ url: 'x', getPose: () => ({ p: [0, 0, 0], r: 0, a: 'idle' }), onMessage: () => {}, onStatus: (s) => status.push(s), make: () => new Fake() });
  const s = Fake.all[0]; s.open();
  s.onmessage?.({ data: JSON.stringify({ t: 'error', code: 'WORLD_FULL', message: 'x' } satisfies ServerMsg) });
  s.close(); vi.advanceTimersByTime(60000);
  expect(Fake.all).toHaveLength(1);
  expect(status).toContain('full');
});

import { lodFor, LOD } from './lod';
import { makeCrowd, peersFromSearch } from './simulate';

test('lod: 멀수록 그림자 → 이름표 → 몸 순서로 꺼진다', () => {
  expect(lodFor(10)).toEqual({ visible: true, label: true, shadow: true });
  expect(lodFor(LOD.shadowM + 1)).toEqual({ visible: true, label: true, shadow: false });
  expect(lodFor(LOD.labelM + 1)).toEqual({ visible: true, label: false, shadow: false });
  expect(lodFor(LOD.hideM + 1).visible).toBe(false);
});

test('crowd: welcome 에 n명, state 는 닉네임 없이 n명, 같은 틱 안에서 위치가 달라진다', () => {
  const c = makeCrowd(30);
  const w = c.welcome();
  expect(w.t === 'welcome' && w.players).toHaveLength(30);
  let m = worldReducer(emptyWorld(), w, 0);
  m = worldReducer(m, c.state(1), 100);
  expect(Object.keys(m.players)).toHaveLength(30);
  expect(m.players.bot0.nickname).toBe('봇1');
  expect(m.players.bot0.samples).toHaveLength(2);
});

test('peers 쿼리: 0~100 으로 제한', () => {
  expect(peersFromSearch('?peers=30')).toBe(30);
  expect(peersFromSearch('?peers=999')).toBe(100);
  expect(peersFromSearch('?peers=x')).toBe(0);
  expect(peersFromSearch('')).toBe(0);
});

test('look: welcome/join 의 look 을 저장하고, look 메시지로 바꾸며, 깨진 값은 기본으로', () => {
  let m = worldReducer(emptyWorld(), { t: 'welcome', selfId: 's', spawn: { p: [0, 0, 0], r: 0 }, players: [{ ...P('a'), look: { jacket: 'school2', hair: '#112233', skin: '#f2c9a5' } }] }, 0);
  expect(m.players.a.look?.jacket).toBe('school2');
  m = worldReducer(m, { t: 'state', players: [P('a', 3)] }, 10); // state 에는 look 이 없어도 유지
  expect(m.players.a.look?.jacket).toBe('school2');
  m = worldReducer(m, { t: 'look', id: 'a', look: { jacket: 'dept-is', hair: '#abcdef', skin: '#fbdcc2' } }, 20);
  expect(m.players.a.look?.jacket).toBe('dept-is');
  m = worldReducer(m, { t: 'look', id: 'a', look: { jacket: '<script>', hair: 'red', skin: 1 } }, 30);
  expect(m.players.a.look).toEqual({ jacket: 'school1', hair: '#2a1d16', skin: '#f2c9a5' });
});

test('socket: 접속하면 look 을 보내고 sendLook 도 보낸다', () => {
  const sent: string[] = [];
  const sock = { send: (s: string) => sent.push(s), close() {}, onopen: null, onclose: null, onmessage: null, readyState: 1 } as unknown as SocketLike & { onopen: () => void };
  const c = connectWorld({ url: 'x', getPose: () => ({ p: [0, 0, 0], r: 0, a: 'idle' }), getLook: () => ({ jacket: 'school3' }), onMessage() {}, make: () => sock });
  sock.onopen!();
  c.sendLook({ jacket: 'school2' });
  expect(sent.map((x) => JSON.parse(x)).filter((x) => x.t === 'look').map((x) => x.look.jacket)).toEqual(['school3', 'school2']);
  c.close();
});

test('내가 보낸 chat/emote 는 self 에 기록된다 (남의 목록에는 안 들어감)', () => {
  let m = worldReducer(emptyWorld(), { t: 'welcome', selfId: 's', spawn: { p: [0, 0, 0], r: 0 }, players: [P('a')] }, 0);
  m = worldReducer(m, { t: 'chat', id: 's', m: '안녕' }, 100);
  m = worldReducer(m, { t: 'emote', id: 's', e: 'wave' }, 100);
  expect(m.self?.chat).toEqual({ m: '안녕', until: 100 + CHAT_MS });
  expect(m.self?.emote?.e).toBe('wave');
  expect(Object.keys(m.players)).toEqual(['a']);
});

test('끊김(drop) 뒤 자동 재접속, close() 뒤에는 재접속하지 않음 (3-5)', () => {
  const status: string[] = [];
  const c = connectWorld({ url: 'x', getPose: () => ({ p: [0, 0, 0], r: 0, a: 'idle' }), onMessage: () => {}, onStatus: (s) => status.push(s), make: () => new Fake() });
  Fake.all[0].open();
  c.drop();
  vi.advanceTimersByTime(1000);
  expect(Fake.all).toHaveLength(2);
  Fake.all[1].open();
  expect(status.slice(-1)[0]).toBe('open');
  c.close();
  vi.advanceTimersByTime(20000);
  expect(Fake.all).toHaveLength(2);
});

test('월드 전환 중(getPose 가 같은 값)에는 move 를 보내지 않는다 (3-5)', () => {
  let x = 0;
  const s = new Fake();
  connectWorld({ url: 'x', getPose: () => ({ p: [x, 0, 0], r: 0, a: 'idle' }), onMessage: () => {}, make: () => s });
  s.open();
  vi.advanceTimersByTime(100); x = 400; // 동네로 넘어가 새 자리
  vi.advanceTimersByTime(500);          // 바꾸는 동안 같은 값
  const moves = s.sent.filter((m) => m.includes('"move"')).map((m) => JSON.parse(m).p[0]);
  expect(moves).toEqual([0, 400]);
});
