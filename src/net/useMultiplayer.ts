import { useEffect, useRef, useState } from 'react';
import { create } from 'zustand';
import { useWorld } from '../app/state/world';
import { useSession } from '../app/state/session';
import { connectWorld, type WorldConnection } from './worldSocket';
import { CHAT_MS, emptyWorld, EMOTE_MS, interpolate, INTERP_DELAY, worldReducer, type ServerMsg, type WorldModel } from './worldReducer';

export type NetStatus = 'connecting' | 'open' | 'closed' | 'full';
type NetUi = { status: NetStatus; selfId: string | null; count: number; conn: WorldConnection | null };
export const useNet = create<NetUi>(() => ({ status: 'closed', selfId: null, count: 0, conn: null }));

const wsBase = () => ((import.meta.env.VITE_API_BASE as string | undefined) ?? 'http://localhost:8080').replace(/^http/, 'ws').replace(/\/$/, '');
const guestName = () => { try { const k = 'chatatda.nick'; let n = sessionStorage.getItem(k); if (!n) { n = `손님${Math.floor(1000 + Math.random() * 9000)}`; sessionStorage.setItem(k, n); } return n; } catch { return '손님'; } };

/** 월드가 준비되면 공유 월드에 접속해 다른 사람을 3D 에 그린다. ?invite= 는 접속 뒤 주소에서 지운다 */
export function useMultiplayer() {
  const api = useWorld((s) => s.api);
  const nickname = useSession((s) => s.nickname);
  const model = useRef<WorldModel>(emptyWorld());
  const [enabled] = useState(() => !/[?&]solo\b/.test(location.search)); // ?solo 로 혼자 보기

  useEffect(() => {
    if (!api || !enabled) return;
    const q = new URLSearchParams(location.search);
    const invite = q.get('invite');
    let prev = api.getPose().p, a: 'idle' | 'walk' = 'idle';
    const getPose = () => {
      const { p, heading } = api.getPose();
      a = Math.hypot(p[0] - prev[0], p[2] - prev[2]) > 0.02 ? 'walk' : 'idle';
      prev = p;
      return { p, r: heading, a };
    };
    model.current = emptyWorld();
    const url = `${wsBase()}/ws/world?nickname=${encodeURIComponent(nickname ?? guestName())}${invite ? `&invite=${encodeURIComponent(invite)}` : ''}`;
    const conn = connectWorld({
      url, getPose,
      onStatus: (status) => {
        useNet.setState({ status });
        if (status === 'open' && invite) { q.delete('invite'); history.replaceState(null, '', `${location.pathname}${q.toString() ? `?${q}` : ''}${location.hash}`); }
      },
      onMessage: (m: ServerMsg) => {
        model.current = worldReducer(model.current, m, performance.now());
        if (m.t === 'welcome') {
          useNet.setState({ selfId: m.selfId });
          if (m.spawn && (m.spawn.p[0] !== 0 || m.spawn.p[2] !== 0)) api.teleport(m.spawn.p[0], m.spawn.p[2]);
        }
        useNet.setState({ count: Object.keys(model.current.players).length });
      },
    });
    useNet.setState({ conn });
    let raf = 0;
    const loop = () => {
      const now = performance.now();
      api.setRemotePlayers(Object.entries(model.current.players).map(([id, pl]) => {
        const { p, r } = interpolate(pl.samples, now - INTERP_DELAY);
        return { id, nickname: pl.nickname, x: p[0], z: p[2], r, chat: pl.chat && pl.chat.until > now ? pl.chat.m : undefined, emote: pl.emote && pl.emote.until > now ? EMOTE_TEXT[pl.emote.e] : undefined };
      }));
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => { cancelAnimationFrame(raf); conn.close(); api.setRemotePlayers([]); useNet.setState({ conn: null, status: 'closed', count: 0, selfId: null }); };
  }, [api, enabled, nickname]);
}

const EMOTE_TEXT: Record<string, string> = { wave: '👋', heart: '❤️', clap: '👏' };
export { CHAT_MS, EMOTE_MS };
