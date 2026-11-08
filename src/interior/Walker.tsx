import { useEffect, useRef, type RefObject } from 'react';
import * as THREE from 'three';
import { useFrame, useThree } from '@react-three/fiber';
import type { FloorPlan } from '../api/types';
import type { Box, buildInterior } from './buildInterior';
import { slideMove } from './collision';
import type { InteriorInput } from './input';
import { classifyPress, LONG_PRESS_MS, MOVE_SLOP_PX, pinFromPoint, type Pin } from './pins';
import { PIN_KEY } from './Room3D';
import { roomAt } from './structure';
import { yawToward } from './tourNav';
import { isTypingTarget } from '../lib/keys';

const EYE = 1.55;
const RADIUS = 0.22; // 몸 반경. 욕실처럼 좁은 곳도 지나갈 수 있게 조금 작게
const keys = new Set<string>();

type Built = ReturnType<typeof buildInterior>;
type Props = {
  plan: FloorPlan; built: Built; input: InteriorInput;
  /** 막는 상자: 벽 조각 + (켜져 있으면) 가구 */
  colliders: Box[];
  /** 서 있는 자리의 바닥 높이(m). 욕실·현관 단차를 오르내린다 */
  floorAt: (x: number, z: number) => number;
  pickRef: RefObject<THREE.Group>; pinRef: RefObject<THREE.Group>;
  /** 길게 누른 바닥·벽 위치 */
  onLongPress: (pin: Pin) => void;
  /** 짧게 누른 핀 */
  onPickPin: (reviewId: number) => void;
};

/**
 * 1인칭 이동. 키보드(WASD/방향키) + 가상 조이스틱, 시선은 마우스·터치 한 손가락 드래그.
 * 길게 누르면(움직임 없이) 그 자리의 바닥/벽에 핀을 찍고, 짧게 눌러 핀을 고르면 후기를 본다.
 */
export function Walker({ plan, built, input, colliders, floorAt, pickRef, pinRef, onLongPress, onPickPin }: Props) {
  const { camera, gl } = useThree();
  const yaw = useRef(0), pitch = useRef(0);
  const pos = useRef(new THREE.Vector3(...built.spawn));
  const eyeY = useRef(EYE);
  const glide = useRef<{ t: number; from: { x: number; z: number; yaw: number; pitch: number }; to: { x: number; z: number; yaw: number } } | null>(null);
  const live = useRef({ colliders, floorAt });
  live.current = { colliders, floorAt };
  const cb = useRef({ onLongPress, onPickPin });
  cb.current = { onLongPress, onPickPin };

  useEffect(() => {
    pos.current.set(...built.spawn);
    eyeY.current = EYE + live.current.floorAt(built.spawn[0], built.spawn[2]);
    const [ex, ey] = plan.entrance;
    yaw.current = yawToward([ex, ey], [built.spawn[0], built.spawn[2]]); // 입구를 등지고 방 안쪽을 본다
    pitch.current = 0;

    const el = gl.domElement;
    const ray = new THREE.Raycaster();
    const castAt = (clientX: number, clientY: number, root: THREE.Object3D | null) => {
      if (!root) return [];
      const r = el.getBoundingClientRect();
      ray.setFromCamera(new THREE.Vector2(((clientX - r.left) / r.width) * 2 - 1, -((clientY - r.top) / r.height) * 2 + 1), camera);
      return ray.intersectObjects(root.children, true);
    };
    const reviewIdOf = (o: THREE.Object3D | null): number | null => {
      for (let n: THREE.Object3D | null = o; n; n = n.parent) if (typeof n.userData?.[PIN_KEY] === 'number') return n.userData[PIN_KEY] as number;
      return null;
    };

    let look: { id: number; lx: number; ly: number; sx: number; sy: number; t0: number; timer: number; consumed: boolean } | null = null;
    const kd = (e: KeyboardEvent) => { if (!isTypingTarget(e.target)) keys.add(e.code); }, ku = (e: KeyboardEvent) => keys.delete(e.code);
    const down = (e: PointerEvent) => {
      if (look || (e.pointerType === 'mouse' && e.button !== 0)) return;
      try { el.setPointerCapture(e.pointerId); } catch { /* 일부 환경 */ }
      const s = { id: e.pointerId, lx: e.clientX, ly: e.clientY, sx: e.clientX, sy: e.clientY, t0: performance.now(), timer: 0, consumed: false };
      s.timer = window.setTimeout(() => {
        if (look !== s || s.consumed) return;
        const hit = castAt(s.sx, s.sy, pickRef.current).find((h) => h.face);
        if (!hit || !hit.face) return;
        s.consumed = true;
        const n = hit.face.normal.clone().transformDirection(hit.object.matrixWorld); // 표면에서 살짝 띄워 파묻히지 않게
        cb.current.onLongPress(pinFromPoint({ x: hit.point.x + n.x * 0.04, y: hit.point.y + n.y * 0.04, z: hit.point.z + n.z * 0.04 }));
      }, LONG_PRESS_MS);
      look = s;
    };
    const move = (e: PointerEvent) => {
      if (!look || e.pointerId !== look.id) return;
      const dx = e.clientX - look.lx, dy = e.clientY - look.ly;
      look.lx = e.clientX; look.ly = e.clientY;
      if (Math.hypot(e.clientX - look.sx, e.clientY - look.sy) > MOVE_SLOP_PX) window.clearTimeout(look.timer);
      const k = e.pointerType === 'touch' ? 0.006 : 0.005;
      yaw.current -= dx * k;
      pitch.current = Math.max(-1.2, Math.min(1.2, pitch.current - dy * k));
    };
    const up = (e: PointerEvent) => {
      if (!look || e.pointerId !== look.id) return;
      const s = look; look = null;
      window.clearTimeout(s.timer);
      if (s.consumed) return;
      if (classifyPress(performance.now() - s.t0, Math.hypot(e.clientX - s.sx, e.clientY - s.sy)) === 'tap') {
        for (const h of castAt(e.clientX, e.clientY, pinRef.current)) { const id = reviewIdOf(h.object); if (id != null) { cb.current.onPickPin(id); break; } }
      }
    };
    const cancel = () => { if (look) window.clearTimeout(look.timer); look = null; };
    window.addEventListener('keydown', kd); window.addEventListener('keyup', ku);
    el.addEventListener('pointerdown', down); el.addEventListener('pointermove', move); el.addEventListener('pointerup', up); el.addEventListener('pointercancel', cancel);
    return () => {
      keys.clear(); cancel();
      window.removeEventListener('keydown', kd); window.removeEventListener('keyup', ku);
      el.removeEventListener('pointerdown', down); el.removeEventListener('pointermove', move); el.removeEventListener('pointerup', up); el.removeEventListener('pointercancel', cancel);
    };
  }, [built, plan, gl, camera, pickRef, pinRef]);

  useFrame((_, dt) => {
    const live_ = live.current;
    if (input.goto?.snap) { // 처음 입장: 걷는 움직임 없이 바로 서서 그쪽을 본다
      const s = input.goto; input.goto = null;
      pos.current.set(s.x, 0, s.z); yaw.current = s.yaw; pitch.current = 0; glide.current = null;
      eyeY.current = EYE + live_.floorAt(s.x, s.z);
    }
    if (input.goto) { // 방 바로가기: 지금 자리에서 목적지까지 0.55초 동안 부드럽게 (움직임 줄이기 설정이면 바로)
      const reduce = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
      glide.current = { t: reduce ? 1 : 0, from: { x: pos.current.x, z: pos.current.z, yaw: yaw.current, pitch: pitch.current }, to: input.goto };
      input.goto = null;
    }
    let x: number, z: number;
    const g = glide.current;
    if (g) {
      g.t = Math.min(1, g.t + dt / 0.55);
      const k = 1 - Math.pow(1 - g.t, 3); // 도착할 때 천천히
      const dyaw = ((((g.to.yaw - g.from.yaw + Math.PI) % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI)) - Math.PI; // 가까운 쪽으로 돈다
      x = g.from.x + (g.to.x - g.from.x) * k; z = g.from.z + (g.to.z - g.from.z) * k;
      yaw.current = g.from.yaw + dyaw * k; pitch.current = g.from.pitch * (1 - k);
      if (g.t >= 1) glide.current = null;
    } else {
      const f = Math.max(-1, Math.min(1, (keys.has('KeyW') || keys.has('ArrowUp') ? 1 : 0) - (keys.has('KeyS') || keys.has('ArrowDown') ? 1 : 0) + input.joy.y));
      const r = Math.max(-1, Math.min(1, (keys.has('KeyD') || keys.has('ArrowRight') ? 1 : 0) - (keys.has('KeyA') || keys.has('ArrowLeft') ? 1 : 0) + input.joy.x));
      const sp = (keys.has('ShiftLeft') ? 3.2 : 1.8) * Math.min(dt, 0.05);
      const fx = -Math.sin(yaw.current), fz = -Math.cos(yaw.current);
      [x, z] = slideMove(live_.colliders, [pos.current.x, pos.current.z], [pos.current.x + (fx * f - fz * r) * sp, pos.current.z + (fz * f + fx * r) * sp], RADIUS);
    }
    pos.current.x = x; pos.current.z = z;
    eyeY.current += (EYE + live_.floorAt(x, z) - eyeY.current) * Math.min(1, dt * 12); // 단차를 부드럽게
    camera.position.set(x, eyeY.current, z);
    camera.rotation.set(pitch.current, yaw.current, 0, 'YXZ');
    input.pose.x = x; input.pose.z = z; input.pose.yaw = yaw.current; input.pose.room = roomAt(plan, x, z);
  });
  return null;
}
