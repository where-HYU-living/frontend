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
