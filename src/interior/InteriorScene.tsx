import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { Canvas } from '@react-three/fiber';
import { ApiError } from '../api/client';
import { useFloorPlan } from '../app/features/catalog';
import { useSession } from '../app/state/session';
import { useUi } from '../app/state/ui';
import { ArrowLeft } from 'lucide-react';
import { useGfx } from '../gfx';
import { buildInterior } from './buildInterior';
import { makeInput } from './input';
import { InteriorPost, RoomLabels } from './InteriorPost';
import { Joystick } from './Joystick';
import { TourHud } from './TourHud';
import { jumpTargets, landingSpot, nearestFree } from './tourNav';
import { pinnedReviews, type Pin } from './pins';
import { PinPanel } from './PinPanel';
import { Room3D } from './Room3D';
import { buildRoomScene } from './roomScene';
import { useIndoorReviews, useIndoorTarget } from './useIndoorReviews';
import { Walker } from './Walker';
import { IndoorPeers } from './IndoorPeers';
import { indoorPresence } from '../net/presence';
import type { FloorPlan } from '../api/types';
import './interior.css';

function Loaded({ plan, title, floorplanId, start, invited, onExit }: { plan: FloorPlan; title: string; floorplanId: number; start?: { x: number; z: number; yaw: number }; invited?: boolean; onExit: () => void }) {
  const Q = useGfx((s) => s.Q);
  const time = useUi((s) => s.timeOfDay);
  const setTime = useUi((s) => s.setTimeOfDay);
  const built = useMemo(() => buildInterior(plan), [plan]);
  const room = useMemo(() => buildRoomScene(plan), [plan]);
  const input = useMemo(() => makeInput(), []);
  const pickRef = useRef<THREE.Group>(null), pinRef = useRef<THREE.Group>(null), labelsRef = useRef<HTMLDivElement>(null), peerLabelsRef = useRef<HTMLDivElement>(null);
  const [showFurniture, setShowFurniture] = useState(true);
  const [draft, setDraft] = useState<Pin | null>(null);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const requireLogin = useSession((s) => s.requireLogin);
  const colliders = useMemo(() => (showFurniture ? [...built.wallPieces, ...room.solids] : built.wallPieces), [built, room, showFurniture]);
  // 방 바로가기: 가구가 있어도 안전한 자리(항상 가구 충돌 포함)로
  const allSolid = useMemo(() => [...built.wallPieces, ...room.solids], [built, room]);
  const jumps = useMemo(() => jumpTargets(plan, room.info.lamps, built.spawn, allSolid), [plan, room, built, allSolid]);
  // 초대 링크로 들어왔으면 초대한 사람이 있던 방·자리 옆에 바로 선다 (서 있을 곳이 없으면 입구에서 시작)
  useEffect(() => {
    if (!start) return;
    const spot = landingSpot(plan, allSolid, start);
    if (spot) input.goto = { ...spot, snap: true };
  }, [start, plan, allSolid, input]);
  // 멀티플레이: 실내에 있는 동안 내 위치(이 도면 좌표 + 방 id)를 보낸다. 나가면(언마운트) 바깥 위치로 돌아간다
  useEffect(() => {
    indoorPresence.read = () => ({ room: floorplanId, x: input.pose.x, z: input.pose.z, y: room.floorAt(input.pose.x, input.pose.z), yaw: input.pose.yaw });
    return () => { indoorPresence.read = null; };
  }, [floorplanId, input, room]);
  const goTo = useCallback((to: { x: number; z: number; yaw: number }) => { input.goto = to; }, [input]);
  const pickPoint = useCallback((x: number, z: number) => { const spot = nearestFree(plan, allSolid, x, z); if (spot) input.goto = { x: spot[0], z: spot[1], yaw: input.pose.yaw }; }, [plan, allSolid, input]);
  const anchors = useMemo(() => room.info.lamps.map((l) => ({ x: l.x, y: plan.ceilingHeight - 0.35, z: l.z })), [room, plan]);

  const target = useIndoorTarget(floorplanId);
  const reviews = useIndoorReviews(target);
  const pins = useMemo(() => pinnedReviews(reviews.data?.items, plan, floorplanId), [reviews.data, plan, floorplanId]);
  const selected = pins.find((r) => r.id === selectedId) ?? null;

  const onLongPress = useCallback((pin: Pin) => {
    if (!requireLogin()) return; // 게스트면 로그인 창
    setSelectedId(null);
    setDraft(pin);
  }, [requireLogin]);
  const onPickPin = useCallback((id: number) => { setDraft(null); setSelectedId(id); }, []);
  const hasFurniture = room.placed.length > 0;

  return (
    <>
      <Canvas
        camera={{ fov: 70, near: 0.05, far: 120 }}
        dpr={[Q.minPixelRatio, Q.pixelRatio]}
        shadows={Q.name === 'low' || !Q.shadows ? false : { type: THREE.PCFSoftShadowMap }}
        gl={{ antialias: Q.antialias, powerPreference: 'high-performance' }}
        onCreated={({ gl }) => { gl.outputColorSpace = THREE.SRGBColorSpace; gl.toneMapping = THREE.ACESFilmicToneMapping; gl.toneMappingExposure = 1; }}
      >
        <color attach="background" args={['#cfd8e3']} />
        <Room3D plan={plan} room={room} showFurniture={showFurniture} pins={pins} selectedPin={selectedId} draft={draft} Q={Q} time={time} pickRef={pickRef} pinRef={pinRef} />
        <Walker plan={plan} built={built} input={input} colliders={colliders} floorAt={room.floorAt} pickRef={pickRef} pinRef={pinRef} onLongPress={onLongPress} onPickPin={onPickPin} />
        <RoomLabels anchors={anchors} containerRef={labelsRef} occluders={pickRef} />
        <IndoorPeers room={floorplanId} labelsRef={peerLabelsRef} occluders={pickRef} />
        <InteriorPost Q={Q} />
      </Canvas>
      <div ref={labelsRef} className="ui-in-labels" aria-hidden="true">
        {room.info.lamps.map((l, i) => (<span key={i} className="ui-in-label">{l.name} · {l.area.toFixed(1)}㎡</span>))}
      </div>
      <div ref={peerLabelsRef} className="ui-in-labels" aria-hidden="true" />
      <div className="ui-in-cross" aria-hidden="true" />
      <TourHud
        title={title} floorplanId={floorplanId} invited={invited} plan={plan} input={input} pins={pins.map((p) => p.pin)} jumps={jumps}
        hasFurniture={hasFurniture} showFurniture={showFurniture} onFurniture={() => setShowFurniture((v) => !v)}
        time={time} onTime={setTime}
        onExit={onExit} onJump={goTo} onPickPoint={pickPoint} quiet={!!draft || !!selected}
      />
      <Joystick input={input} />
      <PinPanel target={target} floorplanId={floorplanId} draft={draft} selected={selected} onClearDraft={() => setDraft(null)} onClearSelected={() => setSelectedId(null)} />
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
  const ready = q.data && !q.data.glbUrl;
  const notFound = q.isError && q.error instanceof ApiError && q.error.status === 404;
  return (
    <div className="ui-interior" role="dialog" aria-label={`${indoor.title} 실내`}>
      {ready && <Loaded key={indoor.floorplanId} plan={q.data} title={indoor.title} floorplanId={indoor.floorplanId} start={indoor.start} invited={indoor.invited} onExit={exit} />}
      {!ready && (
        <>
          <button type="button" className="ui-tour-back glass ui-tour-back--solo" onClick={exit} aria-label="동네로 돌아가기"><ArrowLeft size={18} aria-hidden="true" /><span>나가기</span></button>
          <section className="ui-tour-state glass" role={q.isError || q.data?.glbUrl ? 'alert' : 'status'}>
            <h1>{indoor.title}</h1>
            {q.isLoading && <p>실내를 불러오고 있어요</p>}
            {notFound && <p>이 집은 아직 실내 도면이 없어요. 다른 주택형을 골라 보세요.</p>}
            {q.isError && !notFound && <p>실내를 불러오지 못했어요. 잠시 뒤에 다시 들어와 주세요.</p>}
            {q.data?.glbUrl && <p>3D 모델 보기는 준비 중이에요.</p>}
            {!q.isLoading && <button type="button" className="ui-tour-state-btn" onClick={exit}>목록으로 돌아가기</button>}
          </section>
        </>
      )}
    </div>
  );
}
