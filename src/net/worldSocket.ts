import type { ServerMsg, Vec3 } from './worldReducer';

export type Pose = { p: Vec3; r: number; a: 'idle' | 'walk' | 'run' };
export type SocketLike = { send(s: string): void; close(): void; onopen: (() => void) | null; onclose: (() => void) | null; onmessage: ((e: { data: string }) => void) | null; readyState: number };

export const BACKOFF = [1000, 2000, 4000, 8000, 10000];
export const MOVE_MS = 100; // 최대 10Hz
export const PING_MS = 15000;

export type WorldConnection = {
  sendEmote(e: 'wave' | 'heart' | 'clap'): void;
  sendChat(m: string): void;
  /** 내 캐릭터 꾸미기를 알린다 (접속 직후에도 자동으로 한 번 보낸다) */
  sendLook(look: unknown): void;
  close(): void;
};

type Opts = {
  url: string;
  getPose: () => Pose;
  getLook?: () => unknown;
  onMessage: (m: ServerMsg) => void;
  onStatus?: (s: 'connecting' | 'open' | 'closed' | 'full') => void;
  /** 테스트에서 가짜 소켓 주입 */
  make?: (url: string) => SocketLike;
};

/** 자동 재접속(1→2→4→8→10s), move 10Hz·변화 없으면 미전송, ping 15초 */
export function connectWorld(o: Opts): WorldConnection {
  const make = o.make ?? ((u: string) => new WebSocket(u) as unknown as SocketLike);
  let sock: SocketLike | null = null, attempt = 0, closed = false, full = false;
  let moveTimer: ReturnType<typeof setInterval> | undefined, pingTimer: ReturnType<typeof setInterval> | undefined, retry: ReturnType<typeof setTimeout> | undefined;
  let last = '';

  const send = (obj: unknown) => { if (sock && sock.readyState === 1) sock.send(JSON.stringify(obj)); };
  const stop = () => { clearInterval(moveTimer); clearInterval(pingTimer); };

  const open = () => {
    o.onStatus?.('connecting');
    const s = make(o.url);
    sock = s;
    s.onopen = () => {
      attempt = 0; last = ''; o.onStatus?.('open');
      if (o.getLook) send({ t: 'look', look: o.getLook() });
      moveTimer = setInterval(() => {
        const p = o.getPose();
        const key = `${p.p.map((v) => v.toFixed(2))}|${p.r.toFixed(2)}|${p.a}`;
        if (key === last) return;
        last = key;
        send({ t: 'move', p: p.p, r: p.r, a: p.a });
      }, MOVE_MS);
      pingTimer = setInterval(() => send({ t: 'ping' }), PING_MS);
    };
    s.onmessage = (e) => {
      let m: ServerMsg;
      try { m = JSON.parse(e.data); } catch { return; }
      if (m.t === 'error' && m.code === 'WORLD_FULL') { full = true; o.onStatus?.('full'); }
      o.onMessage(m);
    };
    s.onclose = () => {
      stop();
      if (closed || full) { if (!full) o.onStatus?.('closed'); return; }
      o.onStatus?.('closed');
      retry = setTimeout(open, BACKOFF[Math.min(attempt++, BACKOFF.length - 1)]);
    };
  };
  open();

  return {
    sendEmote: (e) => send({ t: 'emote', e }),
    sendLook: (look) => send({ t: 'look', look }),
    sendChat: (m) => send({ t: 'chat', m: m.slice(0, 40) }),
    close: () => { closed = true; stop(); clearTimeout(retry); sock?.close(); },
  };
}
