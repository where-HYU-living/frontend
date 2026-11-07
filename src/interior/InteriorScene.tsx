import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { ApiError } from '../api/client';
import { useFloorPlan } from '../app/features/catalog';
import { useUi } from '../app/state/ui';
import { buildInterior } from './buildInterior';
import type { FloorPlan } from '../api/types';

const EYE = 1.55;
const keys = new Set<string>();

/** 1인칭: WASD/방향키 이동, 마우스 드래그로 시선. 벽(조각 박스)은 원 반경 0.25m 로 막는다 */
function Walker({ plan }: { plan: FloorPlan }) {
  const built = useMemo(() => buildInterior(plan), [plan]);
  const { camera, gl } = useThree();
  const yaw = useRef(0), pitch = useRef(0);
  const pos = useRef(new THREE.Vector3(...built.spawn));

  useEffect(() => {
    pos.current.set(...built.spawn);
    // 입구 쪽을 등지고 방 안쪽을 보게
    const [ex, , ey] = [plan.entrance[0], 0, plan.entrance[1]];
    yaw.current = Math.atan2(-(built.spawn[0] - ex), -(built.spawn[2] - ey));
    const kd = (e: KeyboardEvent) => keys.add(e.code), ku = (e: KeyboardEvent) => keys.delete(e.code);
    let drag = false;
    const md = () => { drag = true; }, mu = () => { drag = false; };
    const mm = (e: MouseEvent) => { if (!drag) return; yaw.current -= e.movementX * 0.005; pitch.current = Math.max(-1.2, Math.min(1.2, pitch.current - e.movementY * 0.005)); };
    window.addEventListener('keydown', kd); window.addEventListener('keyup', ku);
    gl.domElement.addEventListener('mousedown', md); window.addEventListener('mouseup', mu); window.addEventListener('mousemove', mm);
    return () => {
      keys.clear();
      window.removeEventListener('keydown', kd); window.removeEventListener('keyup', ku);
      gl.domElement.removeEventListener('mousedown', md); window.removeEventListener('mouseup', mu); window.removeEventListener('mousemove', mm);
    };
  }, [built, plan, gl]);

  const blocked = (x: number, z: number) => built.wallPieces.some((b) => {
    if (b.size[1] < 0.5 || b.center[1] - b.size[1] / 2 > 0.9) return false; // 낮은 조각(창 아래 벽은 막고, 인방·창 위는 안 막음)
    const c = Math.cos(b.rotationY), s = Math.sin(b.rotationY);
    const dx = x - b.center[0], dz = z - b.center[2];
    const lx = dx * c - dz * s, lz = dx * s + dz * c; // 박스 로컬 (Y회전 역변환)
    return Math.abs(lx) < b.size[0] / 2 + 0.25 && Math.abs(lz) < b.size[2] / 2 + 0.25;
  });

  useFrame((_, dt) => {
    const f = (keys.has('KeyW') || keys.has('ArrowUp') ? 1 : 0) - (keys.has('KeyS') || keys.has('ArrowDown') ? 1 : 0);
    const r = (keys.has('KeyD') || keys.has('ArrowRight') ? 1 : 0) - (keys.has('KeyA') || keys.has('ArrowLeft') ? 1 : 0);
    const sp = (keys.has('ShiftLeft') ? 3.2 : 1.8) * Math.min(dt, 0.05);
    const fx = -Math.sin(yaw.current), fz = -Math.cos(yaw.current);
    const nx = pos.current.x + (fx * f + -fz * r) * sp, nz = pos.current.z + (fz * f + fx * r) * sp;
    if (!blocked(nx, pos.current.z)) pos.current.x = nx;
    if (!blocked(pos.current.x, nz)) pos.current.z = nz;
    camera.position.set(pos.current.x, EYE, pos.current.z);
    camera.rotation.set(pitch.current, yaw.current, 0, 'YXZ');
  });

  const floorGeos = useMemo(() => built.floor.map((poly) => {
    const g = new THREE.ShapeGeometry(new THREE.Shape(poly.map(([x, y]) => new THREE.Vector2(x, y))));
    g.rotateX(Math.PI / 2); // 평면 (x,y) → (x,0,y)
    return g;
  }), [built]);

  return (
    <>
      <ambientLight intensity={0.9} />
      <directionalLight position={[3, 6, 2]} intensity={1.1} />
      {built.wallPieces.map((b, i) => (
        <mesh key={i} position={b.center} rotation={[0, b.rotationY, 0]}>
          <boxGeometry args={b.size} />
          <meshStandardMaterial color="#efe9df" roughness={0.9} />
        </mesh>
      ))}
      {floorGeos.map((g, i) => (<mesh key={i} geometry={g}><meshStandardMaterial color="#c9b79c" roughness={0.8} side={THREE.DoubleSide} /></mesh>))}
      {built.floor.map((poly, i) => {
        const [cx, cy] = poly.reduce(([a, b], [x, y]) => [a + x / poly.length, b + y / poly.length], [0, 0]);
        return (<mesh key={`c${i}`} position={[cx, plan.ceilingHeight, cy]} rotation={[Math.PI / 2, 0, 0]}><planeGeometry args={[40, 40]} /><meshStandardMaterial color="#f7f4ee" side={THREE.DoubleSide} /></mesh>);
      })}
    </>
  );
}

/** 동네 3D 를 멈추고(frameloop never) 그 위에 실내를 띄운다. 나가면 동네는 들어갈 때 서 있던 자리 그대로. */
export function InteriorScene() {
  const indoor = useUi((s) => s.indoor);
  const exit = useUi((s) => s.exitIndoor);
  const q = useFloorPlan(indoor?.floorplanId ?? null);
  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.code === 'Escape') exit(); };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [exit]);
  if (!indoor) return null;
  return (
    <div className="ui-interior" role="dialog" aria-label={`${indoor.title} 실내`}>
      {q.data && !q.data.glbUrl && (
        <Canvas camera={{ fov: 70, near: 0.05, far: 60 }} dpr={[1, 1.5]}>
          <color attach="background" args={['#dfe6ee']} />
          <Walker plan={q.data} />
        </Canvas>
      )}
      <div className="ui-interior-bar glass">
        <strong>{indoor.title}</strong>
        <span className="ui-card-sub">WASD 이동 · 드래그로 둘러보기 · Shift 빠르게 · Esc 나가기</span>
        <button type="button" className="ui-mini" onClick={exit}>나가기</button>
      </div>
      {q.isLoading && <p className="ui-interior-note" role="status">실내를 불러오는 중…</p>}
      {q.isError && <p className="ui-interior-note" role="alert">{q.error instanceof ApiError && q.error.status === 404 ? '평면도가 아직 없어요.' : '실내를 불러오지 못했어요.'}</p>}
      {q.data?.glbUrl && <p className="ui-interior-note">3D 모델(GLB) 보기는 준비 중이에요.</p>}
    </div>
  );
}
