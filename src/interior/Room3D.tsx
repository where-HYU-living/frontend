import { useEffect, useMemo, type RefObject } from 'react';
import * as THREE from 'three';
import { useThree } from '@react-three/fiber';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import type { FloorPlan, Review } from '../api/types';
import type { Quality } from '../quality';
import { lightAt } from '../world/timeOfDay';
import type { MatKey } from './meshBuilder';
import type { Pin } from './pins';
import type { RoomScene } from './roomScene';
import { Sky } from './Sky';
import { makeMaterials } from './textures';

const ratingColor = (n: number) => (n >= 4 ? '#2fa968' : n === 3 ? '#e0a82e' : '#d9453b');

export const PIN_KEY = 'reviewId';

/** 길게 눌러 핀을 찍거나 레이로 맞출 수 있는 표면 (천장·유리·조명은 제외) */
const PICK = new Set<MatKey>(['paint', 'wallTile', 'concrete', 'wood', 'tile', 'vinyl', 'trim', 'matte', 'gloss', 'metal']);
/** 햇빛 그림자를 만드는 것 (바닥·천장·유리는 안 만든다) */
const CAST = new Set<MatKey>(['paint', 'wallTile', 'concrete', 'trim', 'matte', 'gloss', 'metal']);
/** 방 종류별 점광원 세기 */
const LAMP_POWER: Record<string, number> = { living: 6, bedroom: 6, kitchen: 4, hallway: 3, bathroom: 3, entrance: 2.6, utility: 1.4, balcony: 1.4 };

type Geos = Partial<Record<MatKey, THREE.BufferGeometry>>;
const entries = (g: Geos) => Object.entries(g) as [MatKey, THREE.BufferGeometry][];

/** 방 안 반사·간접광 느낌을 내는 환경맵 (한 번만 구워서 쓴다) */
function useEnvironment(intensity: number) {
  const { gl, scene } = useThree();
  useEffect(() => {
    const pmrem = new THREE.PMREMGenerator(gl);
    const room = new RoomEnvironment();
    const rt = pmrem.fromScene(room, 0.04);
    scene.environment = rt.texture;
    room.dispose();
    pmrem.dispose();
    return () => { scene.environment = null; rt.dispose(); };
  }, [gl, scene]);
  useEffect(() => { scene.environmentIntensity = intensity; }, [scene, intensity]);
}

/** 가장 큰 외벽 창으로 들어오는 햇빛. 낮에는 높고 저녁엔 낮게, 밤엔 달빛처럼 약하게 */
function Sun({ room, Q, time }: { room: RoomScene; Q: Quality; time: number }) {
  const L = useMemo(() => lightAt(time), [time]);
  const { bounds, sun } = room.info;
  const cx = (bounds.minX + bounds.maxX) / 2, cz = (bounds.minY + bounds.maxY) / 2;
  const half = Math.max(bounds.maxX - bounds.minX, bounds.maxY - bounds.minY) * 0.8 + 1.4;
  const light = useMemo(() => {
    const l = new THREE.DirectionalLight();
    l.castShadow = Q.name !== 'low';
    l.shadow.mapSize.set(Q.shadowMap, Q.shadowMap);
    Object.assign(l.shadow.camera, { left: -half, right: half, top: half, bottom: -half, near: 0.5, far: 90 });
    l.shadow.camera.updateProjectionMatrix();
    l.shadow.bias = -0.0004;
    l.shadow.normalBias = 0.03;
    l.shadow.radius = 3;
    return l;
  }, [Q, half]);
  useEffect(() => {
    const el = THREE.MathUtils.lerp(0.62, 0.2, Math.min(1, time / 0.6)); // 고도(라디안): 낮 36° → 저녁 12°
    const az = (0.5 - time) * 0.9, c = Math.cos(az), s = Math.sin(az);
    const ox = sun.outward[0] * c - sun.outward[1] * s, oz = sun.outward[0] * s + sun.outward[1] * c; // 바깥 방향을 살짝 돌린다
    light.target.position.set(cx, 0.8, cz);
    light.target.updateMatrixWorld();
    light.position.set(cx + ox * Math.cos(el) * 40, 0.8 + Math.sin(el) * 40, cz + oz * Math.cos(el) * 40);
    light.intensity = L.sun * 0.9;
    light.color.setHex(L.sunColor);
  }, [light, L, time, sun, cx, cz]);
  useEffect(() => () => light.dispose(), [light]);
  return (<><primitive object={light} /><primitive object={light.target} /></>);
}

type Props = {
  plan: FloorPlan;
  room: RoomScene;
  showFurniture: boolean;
  pins: (Review & { pin: Pin })[];
  selectedPin: number | null;
  draft: Pin | null;
  Q: Quality;
  /** 0 낮 ~ 1 밤 (동네 3D 와 같은 슬라이더) */
  time: number;
};

/** 평면도 JSON 으로 만든 방: 재질별로 합친 벽·바닥·천장·문·창 + 설비·가구 + 환경광·햇빛·조명·하늘. pickRef 안의 메쉬만 길게 누르기로 핀을 찍을 수 있고, pinRef 안은 눌러서 후기를 본다 */
export function Room3D({ plan, room, showFurniture, pins, selectedPin, draft, Q, time, pickRef, pinRef }: Props & { pickRef: RefObject<THREE.Group>; pinRef: RefObject<THREE.Group> }) {
  const { gl } = useThree();
  const H = plan.ceilingHeight;
  const L = useMemo(() => lightAt(time), [time]);

  const m = useMemo(() => makeMaterials(Math.min(8, gl.capabilities.getMaxAnisotropy())), [gl]);
  useEffect(() => () => m.dispose(), [m]);
  const structure = useMemo(() => room.structure.toGeometries(), [room]);
  const furniture = useMemo(() => room.furniture.toGeometries(), [room]);
  useEffect(() => () => { for (const g of [...Object.values(structure), ...Object.values(furniture)]) g?.dispose(); }, [structure, furniture]);

  useEnvironment(0.12 + 0.5 * L.bg);
  useEffect(() => { gl.toneMappingExposure = L.exposure; }, [gl, L.exposure]);

  const { bounds } = room.info;
  const center: [number, number] = [(bounds.minX + bounds.maxX) / 2, (bounds.minY + bounds.maxY) / 2];
  // 점광원은 4개까지: 방마다 첫 조명을 먼저, 그다음 큰 방의 추가 조명 순
  const lamps = useMemo(() => [...room.info.lamps].sort((a, b) => a.index - b.index || b.area - a.area).slice(0, 4), [room]);
  const lampBoost = 1 + (1 - L.bg) * 1.2; // 밤엔 실내 조명이 더 밝게

  const mesh = ([k, g]: [MatKey, THREE.BufferGeometry], tag: string) => (
    <mesh key={`${tag}${k}`} geometry={g} material={m.mats[k]} castShadow={CAST.has(k)} receiveShadow={k !== 'lamp' && k !== 'glass'} />
  );

  return (
    <>
      <ambientLight intensity={0.12} />
      <hemisphereLight color="#fff6ea" groundColor="#8d8576" intensity={0.18 + 0.3 * L.bg} />
      <Sun room={room} Q={Q} time={time} />
      <Sky center={center} t={time} />

      {lamps.map((l, i) => (
        <pointLight key={`lamp${i}`} position={[l.x, H - 0.4, l.z]} color="#ffe2b8" intensity={((LAMP_POWER[l.kind] ?? 2) * lampBoost) / (l.count > 1 ? 1.4 : 1)} distance={7} decay={2} />
      ))}

      <group ref={pickRef}>
        {entries(structure).filter(([k]) => PICK.has(k)).map((e) => mesh(e, 's'))}
        {showFurniture && entries(furniture).filter(([k]) => PICK.has(k)).map((e) => mesh(e, 'f'))}
      </group>
      {entries(structure).filter(([k]) => !PICK.has(k)).map((e) => mesh(e, 's'))}
      {showFurniture && entries(furniture).filter(([k]) => !PICK.has(k)).map((e) => mesh(e, 'f'))}

      <group ref={pinRef}>
        {pins.map((r) => (
          <group key={r.id} position={r.pin} userData={{ [PIN_KEY]: r.id }}>
            <mesh userData={{ [PIN_KEY]: r.id }}><sphereGeometry args={[selectedPin === r.id ? 0.13 : 0.09, 16, 12]} /><meshStandardMaterial color={ratingColor(r.rating)} emissive={ratingColor(r.rating)} emissiveIntensity={selectedPin === r.id ? 1.1 : 0.5} /></mesh>
            {/* 누르기 쉬운 투명한 큰 구. visible=false 라 그려지지 않지만(AO 패스에도 안 들어감) 레이는 맞는다 */}
            <mesh visible={false} userData={{ [PIN_KEY]: r.id }}><sphereGeometry args={[0.2, 8, 6]} /><meshBasicMaterial /></mesh>
          </group>
        ))}
        {draft && (
          <mesh position={draft}><sphereGeometry args={[0.11, 16, 12]} /><meshStandardMaterial color="#ff8a1f" emissive="#ff8a1f" emissiveIntensity={1} /></mesh>
        )}
      </group>
    </>
  );
}
