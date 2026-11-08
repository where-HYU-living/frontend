import { useEffect, useRef, useState } from 'react';
import { create } from 'zustand';
import { EMOTE_SVG } from '../app/icons';
import { useArea } from '../app/state/area';
import { serviceTargetFor } from '../world/serviceArea';
import { toLatLng } from '../app/map/geo';
import { useWorld } from '../app/state/world';
import { useSession } from '../app/state/session';
import { useUi } from '../app/state/ui';
import { useAvatarLook } from '../world/avatarStore';
import { makeCrowd, peersFromSearch } from './simulate';
import { connectWorld, type Pose, type WorldConnection } from './worldSocket';
import { headingOfYaw, indoorPresence, netModel, peersIn } from './presence';
import { CHAT_MS, emptyWorld, EMOTE_MS, interpolate, INTERP_DELAY, worldReducer, type ServerMsg } from './worldReducer';

export type NetStatus = 'connecting' | 'open' | 'closed' | 'full';
type NetUi = { status: NetStatus; selfId: string | null; count: number; /** 내가 실내에 있을 때 같은 방에 있는 다른 사람 수 */ roomCount: number; conn: WorldConnection | null; /** 초대 링크로 들어와 초대한 사람 옆으로 이동했을 때 true (잠깐 안내) */ invited: boolean };
export const useNet = create<NetUi>(() => ({ status: 'closed', selfId: null, count: 0, roomCount: 0, conn: null, invited: false }));

const wsBase = () => ((import.meta.env.VITE_API_BASE as string | undefined) ?? 'http://localhost:8080').replace(/^http/, 'ws').replace(/\/$/, '');
const guestName = () => { try { const k = 'chatatda.nick'; let n = sessionStorage.getItem(k); if (!n) { n = `손님${Math.floor(1000 + Math.random() * 9000)}`; sessionStorage.setItem(k, n); } return n; } catch { return '손님'; } };

/**
 * 월드가 처음 준비되면 공유 월드에 접속해 다른 사람을 3D 에 그린다. ?invite= 는 접속 뒤 주소에서 지운다.
 * 캠퍼스 ↔ 동네 월드를 바꿔도 연결은 그대로 유지한다(좌표계가 같다 — 사자상 원점). 바꾸는 동안(api 없음)은 위치를 보내지 않는다.
 * (예전엔 api 가 바뀔 때마다 끊고 다시 붙어서 상대에게 퇴장·입장으로 보였고, 동네에서는 아예 끊겼다)
 */
export function useMultiplayer() {
  const api = useWorld((s) => s.api);
  const apiRef = useRef(api);
  apiRef.current = api;
  const [ready, setReady] = useState(false);
  useEffect(() => { if (api) setReady(true); }, [api]);
  const nickname = useSession((s) => s.nickname);
  const model = netModel; // 실내 화면(IndoorPeers)도 같은 모델을 읽는다
  const [soloFlag] = useState(() => /[?&]solo\b/.test(location.search)); // ?solo 로 혼자 보기
  const enabled = !soloFlag;

  // 월드가 바뀌면 새 장면에 다른 사람을 다시 그린다 (아래 loop 가 매 프레임 넘기므로 따로 할 일 없음). 옛 장면 것은 장면과 함께 정리됨

  useEffect(() => {
    if (!ready || !enabled) return;
    const q = new URLSearchParams(location.search);
    const invite = q.get('invite');
    let prev: number[] | null = null, prevRoom: number | null = null, lastPose: Pose = { p: [0, 0, 0], r: 0, a: 'idle' };
    const walkOf = (p: number[], room: number | null): 'idle' | 'walk' => {
      if (room !== prevRoom) { prevRoom = room; prev = null; } // 방을 오가면 좌표계가 바뀐다 (순간이동을 걷기로 보지 않게)
      const d = prev ? Math.hypot(p[0] - prev[0], p[2] - prev[2]) : 0;
      prev = p;
      return d > 0.02 && d < 30 ? 'walk' : 'idle';
    };
    const getPose = (): Pose => {
      // 실내(방 투어) 중이면 그 방 좌표 + room 을 보낸다. 다른 사람 화면에서는 바깥에서 사라지고 같은 방 안에 나타난다
      const ind = indoorPresence.read?.();
      if (ind) {
        const p: [number, number, number] = [ind.x, ind.y, ind.z];
        lastPose = { p, r: headingOfYaw(ind.yaw), a: walkOf(p, ind.room), room: ind.room };
        return lastPose;
      }
      const w = apiRef.current;
      // 월드를 바꾸는 중(api 없음): 마지막 값 그대로(방 안이었으면 방 안 그대로) — 실내 좌표를 room 없이 보내면 바깥 사자상 근처에 나타난다
      if (!w) return lastPose;
      // 실내 도면을 불러오는 중이면 바깥에서 들어가기 직전 자리를 보낸다 (바깥 장면은 멈춰 있어 그대로다)
      const { p, heading } = w.getPose();
      lastPose = { p, r: heading, a: walkOf(p, null) };
      return lastPose;
    };
    let welcomed = false;
    model.current = emptyWorld();
    const handle = (m: ServerMsg) => {
      const before = Object.keys(model.current.players).length;
      model.current = worldReducer(model.current, m, performance.now());
      if (import.meta.env.DEV) (window as unknown as Record<string, unknown>).__mpModel = model.current;
      if (m.t === 'welcome') {
        useNet.setState({ selfId: m.selfId });
        // 초대 스폰은 처음 접속 때만 (재접속 때 다시 초대한 사람 옆으로 끌려가지 않게)
        if (!welcomed && m.invited && m.spawn?.room != null) {
          // 초대한 사람이 방 안에 있다 → 그 방으로 들어가 옆에 선다 (설 자리는 실내 화면이 벽·가구를 피해 고른다)
          const [x, , z] = m.spawn.p;
          useUi.getState().enterIndoor(m.spawn.room, '초대받은 방', { start: { x, z, yaw: m.spawn.r - Math.PI }, invited: true });
        } else if (!welcomed && m.invited && m.spawn && (m.spawn.p[0] !== 0 || m.spawn.p[2] !== 0)) placeAt(m.spawn.p[0], m.spawn.p[2]);
        if (!welcomed && m.invited) { useNet.setState({ invited: true }); setTimeout(() => useNet.setState({ invited: false }), 5000); }
        welcomed = true;
      }
      recount(m.t === 'welcome' || Object.keys(model.current.players).length !== before);
    };
    /** 접속 인원·같은 방 인원. 바뀌었을 때만 스토어를 건드린다 (10Hz state 마다 리렌더하지 않게) */
    const recount = (force = false) => {
      const count = Object.keys(model.current.players).length;
      const myRoom = indoorPresence.read?.().room ?? null;
      const roomCount = myRoom == null ? 0 : peersIn(model.current.players, myRoom).length;
      const st = useNet.getState();
      if (force || count !== st.count || roomCount !== st.roomCount) useNet.setState({ count, roomCount });
    };
    const recountTimer = setInterval(recount, 500); // 내가 방에 들어가고 나온 것은 메시지가 없어도 반영
    // 초대한 사람이 동네 월드에 있으면 그 동네로 월드를 바꿔서 옆에 선다 (캠퍼스 월드에서 그 좌표로 가면 월드 밖 들판)
    const placeAt = (x: number, z: number) => {
      const cur = useWorld.getState().areaId ?? 'campus';
      const [lat, lng] = toLatLng(x, z);
      const t = serviceTargetFor(lat, lng, cur as 'campus');
      if (t && t.area !== cur) useArea.getState().goTo(t.area, x, z, null, true);
      else apiRef.current?.teleport(x, z);
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
      // 실내(동네 장면이 멈춤)나 숨은 탭, 월드를 바꾸는 중에는 보간·갱신을 하지 않는다. 샘플은 계속 쌓이니 돌아오면 바로 따라잡는다
      const api = apiRef.current;
      if (!api || useUi.getState().indoor || document.hidden) return;
      const now = performance.now();
      const me = model.current.self;
      api.setSelfBubble?.({ chat: me?.chat && me.chat.until > now ? me.chat.m : undefined, emote: me?.emote && me.emote.until > now ? EMOTE_SVG[me.emote.e] : undefined });
      api.setRemotePlayers(peersIn(model.current.players, null).map(([id, pl]) => { // 방 안에 있는 사람은 바깥에 그리지 않는다
        const { p, r } = interpolate(pl.samples, now - INTERP_DELAY);
        return { id, nickname: pl.nickname, x: p[0], z: p[2], r, walking: pl.a !== 'idle', look: pl.look, chat: pl.chat && pl.chat.until > now ? pl.chat.m : undefined, emote: pl.emote && pl.emote.until > now ? EMOTE_SVG[pl.emote.e] : undefined };
      }));
    };
    raf = requestAnimationFrame(loop);
    return () => { unsubLook(); cancelAnimationFrame(raf); clearInterval(simTimer); clearInterval(recountTimer); conn?.close(); apiRef.current?.setRemotePlayers([]); useNet.setState({ conn: null, status: 'closed', count: 0, roomCount: 0, selfId: null }); };
  }, [ready, enabled, nickname]);
}

export { CHAT_MS, EMOTE_MS };

// 점검 스크립트용 (scripts/mp-check.mjs): 접속 상태·받은 상대 위치를 숫자로 읽는다
if (import.meta.env.DEV && typeof window !== 'undefined') (window as unknown as Record<string, unknown>).__net = useNet;
