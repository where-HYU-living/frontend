import { useEffect, useRef, useState } from 'react';
import { create } from 'zustand';
import { EMOTE_SVG } from '../app/icons';
import { useWorld } from '../app/state/world';
import { useSession } from '../app/state/session';
import { useUi } from '../app/state/ui';
import { useAvatarLook } from '../world/avatarStore';
import { makeCrowd, peersFromSearch } from './simulate';
import { connectWorld, type WorldConnection } from './worldSocket';
import { CHAT_MS, emptyWorld, EMOTE_MS, interpolate, INTERP_DELAY, worldReducer, type ServerMsg, type WorldModel } from './worldReducer';

export type NetStatus = 'connecting' | 'open' | 'closed' | 'full';
type NetUi = { status: NetStatus; selfId: string | null; count: number; conn: WorldConnection | null; /** 초대 링크로 들어와 초대한 사람 옆으로 이동했을 때 true (잠깐 안내) */ invited: boolean };
export const useNet = create<NetUi>(() => ({ status: 'closed', selfId: null, count: 0, conn: null, invited: false }));

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
    const handle = (m: ServerMsg) => {
      const before = Object.keys(model.current.players).length;
      model.current = worldReducer(model.current, m, performance.now());
      if (m.t === 'welcome') {
        useNet.setState({ selfId: m.selfId });
        if (m.spawn && (m.spawn.p[0] !== 0 || m.spawn.p[2] !== 0)) api.teleport(m.spawn.p[0], m.spawn.p[2]);
        if (m.invited) { useNet.setState({ invited: true }); setTimeout(() => useNet.setState({ invited: false }), 5000); }
      }
      const count = Object.keys(model.current.players).length;
      if (count !== before || m.t === 'welcome') useNet.setState({ count }); // 10Hz state 마다 스토어를 건드리지 않는다
    };
    // ?peers=N : 소켓 없이 가짜 접속자 N명 (부하 측정용)
    const peers = peersFromSearch(location.search);
    let simTimer: ReturnType<typeof setInterval> | undefined;
    if (peers) {
      const crowd = makeCrowd(peers);
      handle(crowd.welcome());
      const t0 = performance.now();
      simTimer = setInterval(() => handle(crowd.state((performance.now() - t0) / 1000)), 100);
      useNet.setState({ status: 'open' });
    }
    const url = `${wsBase()}/ws/world?nickname=${encodeURIComponent(nickname ?? guestName())}${invite ? `&invite=${encodeURIComponent(invite)}` : ''}`;
    const conn = peers ? null : connectWorld({
      url, getPose, getLook: () => useAvatarLook.getState().look,
      onStatus: (status) => {
        useNet.setState({ status });
        if (status === 'open' && invite) { q.delete('invite'); history.replaceState(null, '', `${location.pathname}${q.toString() ? `?${q}` : ''}${location.hash}`); }
      },
      onMessage: handle,
    });
    useNet.setState({ conn });
    const unsubLook = useAvatarLook.subscribe((st, prevSt) => { if (st.look !== prevSt.look) conn?.sendLook(st.look); });
    let raf = 0;
    const loop = () => {
      raf = requestAnimationFrame(loop);
      // 실내(동네 장면이 멈춤)나 숨은 탭에서는 보간·갱신을 하지 않는다. 샘플은 계속 쌓이니 돌아오면 바로 따라잡는다
      if (useUi.getState().indoor || document.hidden) return;
      const now = performance.now();
      const me = model.current.self;
      api.setSelfBubble?.({ chat: me?.chat && me.chat.until > now ? me.chat.m : undefined, emote: me?.emote && me.emote.until > now ? EMOTE_SVG[me.emote.e] : undefined });
      api.setRemotePlayers(Object.entries(model.current.players).map(([id, pl]) => {
        const { p, r } = interpolate(pl.samples, now - INTERP_DELAY);
        return { id, nickname: pl.nickname, x: p[0], z: p[2], r, walking: pl.a !== 'idle', look: pl.look, chat: pl.chat && pl.chat.until > now ? pl.chat.m : undefined, emote: pl.emote && pl.emote.until > now ? EMOTE_SVG[pl.emote.e] : undefined };
      }));
    };
    raf = requestAnimationFrame(loop);
    return () => { unsubLook(); cancelAnimationFrame(raf); clearInterval(simTimer); conn?.close(); api.setRemotePlayers([]); useNet.setState({ conn: null, status: 'closed', count: 0, selfId: null }); };
  }, [api, enabled, nickname]);
}

export { CHAT_MS, EMOTE_MS };
