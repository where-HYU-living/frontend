import { useEffect, useMemo, useRef, type RefObject } from 'react';
import * as THREE from 'three';
import { useFrame, useThree } from '@react-three/fiber';
import { makeCrowdStudent, lookKey } from '../world/crowdStudent.js';
import { EMOTE_SVG } from '../app/icons';
import { interpolate, INTERP_DELAY } from '../net/worldReducer';
import { netModel, peersIn } from '../net/presence';

/** 바깥 캐릭터는 약 2m(만화 비율). 천장 2.3~2.5m 실내에서는 줄여서 사람 키 정도로 */
export const INDOOR_SCALE = 0.82;
const TAG_Y = 2.3 * INDOOR_SCALE;
const TAG_NEAR = 12; // 이보다 멀면 이름표를 숨긴다 (실내는 작다)

type Peer = { g: THREE.Group; model: THREE.Group; key: string; amp: number; el: HTMLDivElement; sig: string; hidden: boolean };

/**
 * 같은 방(같은 도면 id)에 있는 다른 접속자를 그린다. 위치는 서버 상태를 바깥과 같은 방식(200ms 늦춰 보간)으로,
 * 이름표·말풍선·이모트는 DOM(labels) 에 올린다. 벽 뒤에 있는 사람의 이름표는 숨긴다(8프레임마다 가림 검사).
 */
export function IndoorPeers({ room, labelsRef, occluders }: { room: number; labelsRef: RefObject<HTMLDivElement>; occluders: RefObject<THREE.Group> }) {
  const { scene, camera, size } = useThree();
  const peers = useRef(new Map<string, Peer>());
  const root = useMemo(() => new THREE.Group(), []);
  const tmp = useMemo(() => new THREE.Vector3(), []);
  const ray = useMemo(() => new THREE.Raycaster(), []);
  const frame = useRef(0);

  useEffect(() => {
    scene.add(root);
    const map = peers.current;
    return () => { scene.remove(root); for (const p of map.values()) p.el.remove(); map.clear(); };
  }, [scene, root]);

  useFrame(() => {
    const now = performance.now();
    const box = labelsRef.current;
    const seen = new Set<string>();
    frame.current++;
    let i = 0;
    for (const [id, pl] of peersIn(netModel.current.players, room)) {
      if (!pl.samples.length) continue;
      seen.add(id);
      let m = peers.current.get(id);
      if (!m) {
        const g = new THREE.Group(); g.scale.setScalar(INDOOR_SCALE); root.add(g);
        const el = document.createElement('div'); el.className = 'w3d-nick ui-in-peer'; box?.appendChild(el);
        m = { g, model: new THREE.Group(), key: '', amp: 0, el, sig: '', hidden: false };
        peers.current.set(id, m);
      }
      const want = lookKey(pl.look).key;
      if (m.key !== want) { m.g.remove(m.model); m.model = makeCrowdStudent(pl.look); m.key = want; m.g.add(m.model); }
      const { p, r } = interpolate(pl.samples, now - INTERP_DELAY);
      // 걷기: 팔다리 흔들기 + 살짝 통통 (바깥과 같은 방식)
      m.amp += ((pl.a !== 'idle' ? 0.7 : 0) - m.amp) * 0.2;
      const ph = now * 0.0096 + m.g.id, sw = Math.sin(ph) * m.amp, u = m.model.userData;
      u.armL.rotation.x = sw; u.armR.rotation.x = -sw; u.legL.rotation.x = -sw; u.legR.rotation.x = sw;
      m.g.position.set(p[0], p[1] + Math.abs(Math.sin(ph)) * 0.03 * m.amp, p[2]);
      m.g.rotation.y = r;

      // 이름표: 이름 · 말 · 이모트
      const chat = pl.chat && pl.chat.until > now ? pl.chat.m : '';
      const emote = pl.emote && pl.emote.until > now ? EMOTE_SVG[pl.emote.e] ?? '' : '';
      const sig = `${pl.nickname}|${chat}|${emote}`;
      if (m.sig !== sig) {
        m.sig = sig; m.el.textContent = chat ? `${pl.nickname}: ${chat}` : pl.nickname;
        if (emote) { const ic = document.createElement('span'); ic.className = 'w3d-ico'; ic.innerHTML = emote; m.el.appendChild(ic); }
      }
      tmp.set(p[0], p[1] + TAG_Y, p[2]);
      const dist = tmp.distanceTo(camera.position);
      if ((frame.current + i * 3) % 8 === 0 && occluders.current) {
        ray.set(camera.position, tmp.clone().sub(camera.position).normalize());
        ray.far = Math.max(0, dist - 0.2);
        m.hidden = ray.intersectObjects(occluders.current.children, true).length > 0;
      }
      tmp.project(camera);
      const show = tmp.z < 1 && Math.abs(tmp.x) < 1.1 && Math.abs(tmp.y) < 1.1 && dist < TAG_NEAR && !m.hidden;
      m.el.style.display = show ? 'block' : 'none';
      if (show) m.el.style.transform = `translate(${((tmp.x * 0.5 + 0.5) * size.width).toFixed(1)}px, ${((-tmp.y * 0.5 + 0.5) * size.height).toFixed(1)}px) translate(-50%, -100%)`;
      i++;
    }
    for (const [id, m] of peers.current) if (!seen.has(id)) { root.remove(m.g); m.el.remove(); peers.current.delete(id); }
  });
  return null;
}
