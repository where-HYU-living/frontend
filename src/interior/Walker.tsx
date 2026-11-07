import { useEffect, useRef, type RefObject } from 'react';
import * as THREE from 'three';
import { useFrame, useThree } from '@react-three/fiber';
import type { FloorPlan } from '../api/types';
import type { buildInterior } from './buildInterior';
import { slideMove } from './collision';
import type { InteriorInput } from './input';
import { classifyPress, LONG_PRESS_MS, MOVE_SLOP_PX, pinFromPoint, type Pin } from './pins';
import { PIN_KEY } from './Room3D';

const EYE = 1.55;
const keys = new Set<string>();

type Built = ReturnType<typeof buildInterior>;
type Props = {
  plan: FloorPlan; built: Built; input: InteriorInput;
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
export function Walker({ plan, built, input, pickRef, pinRef, onLongPress, onPickPin }: Props) {
  const { camera, gl } = useThree();
  const yaw = useRef(0), pitch = useRef(0);
  const pos = useRef(new THREE.Vector3(...built.spawn));
  const cb = useRef({ onLongPress, onPickPin });
  cb.current = { onLongPress, onPickPin };

  useEffect(() => {
    pos.current.set(...built.spawn);
    const [ex, ey] = plan.entrance;
    yaw.current = Math.atan2(-(built.spawn[0] - ex), -(built.spawn[2] - ey)); // 입구를 등지고 방 안쪽을 본다
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
    const kd = (e: KeyboardEvent) => keys.add(e.code), ku = (e: KeyboardEvent) => keys.delete(e.code);
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
    const f = Math.max(-1, Math.min(1, (keys.has('KeyW') || keys.has('ArrowUp') ? 1 : 0) - (keys.has('KeyS') || keys.has('ArrowDown') ? 1 : 0) + input.joy.y));
    const r = Math.max(-1, Math.min(1, (keys.has('KeyD') || keys.has('ArrowRight') ? 1 : 0) - (keys.has('KeyA') || keys.has('ArrowLeft') ? 1 : 0) + input.joy.x));
    const sp = (keys.has('ShiftLeft') ? 3.2 : 1.8) * Math.min(dt, 0.05);
    const fx = -Math.sin(yaw.current), fz = -Math.cos(yaw.current);
    const [x, z] = slideMove(built.wallPieces, [pos.current.x, pos.current.z], [pos.current.x + (fx * f - fz * r) * sp, pos.current.z + (fz * f + fx * r) * sp]);
    pos.current.x = x; pos.current.z = z;
    camera.position.set(x, EYE, z);
    camera.rotation.set(pitch.current, yaw.current, 0, 'YXZ');
    input.pose.x = x; input.pose.z = z; input.pose.yaw = yaw.current;
  });
  return null;
}
