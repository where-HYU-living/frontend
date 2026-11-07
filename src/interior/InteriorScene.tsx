import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type * as THREE from 'three';
import { Canvas } from '@react-three/fiber';
import { ApiError } from '../api/client';
import { useFloorPlan } from '../app/features/catalog';
import { useSession } from '../app/state/session';
import { useUi } from '../app/state/ui';
import { buildInterior } from './buildInterior';
import { furnishPlan } from './furnish';
import { makeInput } from './input';
import { Joystick } from './Joystick';
import { Minimap } from './Minimap';
import { pinnedReviews, type Pin } from './pins';
import { PinPanel } from './PinPanel';
import { Room3D } from './Room3D';
import { useIndoorReviews, useIndoorTarget } from './useIndoorReviews';
import { Walker } from './Walker';
import type { FloorPlan } from '../api/types';
import './interior.css';

function Loaded({ plan, title, floorplanId, onExit }: { plan: FloorPlan; title: string; floorplanId: number; onExit: () => void }) {
  const built = useMemo(() => buildInterior(plan), [plan]);
  const furniture = useMemo(() => furnishPlan(plan), [plan]);
  const input = useMemo(() => makeInput(), []);
  const pickRef = useRef<THREE.Group>(null), pinRef = useRef<THREE.Group>(null);
  const [showFurniture, setShowFurniture] = useState(true);
  const [draft, setDraft] = useState<Pin | null>(null);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const requireLogin = useSession((s) => s.requireLogin);

  const target = useIndoorTarget(floorplanId);
  const reviews = useIndoorReviews(target);
  const pins = useMemo(() => pinnedReviews(reviews.data?.items, plan), [reviews.data, plan]);
  const selected = pins.find((r) => r.id === selectedId) ?? null;

  const onLongPress = useCallback((pin: Pin) => {
    if (!requireLogin()) return; // 게스트면 로그인 창
    setSelectedId(null);
    setDraft(pin);
  }, [requireLogin]);
  const onPickPin = useCallback((id: number) => { setDraft(null); setSelectedId(id); }, []);

  return (
    <>
      <Canvas camera={{ fov: 70, near: 0.05, far: 60 }} dpr={[1, 1.5]}>
        <color attach="background" args={['#dfe6ee']} />
        <Suspense fallback={null}>
          <Room3D plan={plan} built={built} furniture={furniture} showFurniture={showFurniture} pins={pins} selectedPin={selectedId} draft={draft} pickRef={pickRef} pinRef={pinRef} />
        </Suspense>
        <Walker plan={plan} built={built} input={input} pickRef={pickRef} pinRef={pinRef} onLongPress={onLongPress} onPickPin={onPickPin} />
      </Canvas>
      <div className="ui-in-cross" aria-hidden="true" />
      <div className="ui-interior-bar ui-in-bar glass">
        <strong>{title}</strong>
        <Minimap plan={plan} input={input} pins={pins.map((p) => p.pin)} />
        <span className="ui-card-sub ui-in-help">WASD 이동 · 드래그로 둘러보기 · 벽·바닥을 길게 눌러 후기 핀 · Esc 나가기</span>
        {furniture.length > 0 && <button type="button" className="ui-in-toggle" aria-pressed={showFurniture} onClick={() => setShowFurniture((v) => !v)}>예시 가구 {showFurniture ? '끄기' : '켜기'}</button>}
        <button type="button" className="ui-mini" onClick={onExit}>나가기</button>
      </div>
      {showFurniture && furniture.length > 0 && !draft && !selected && <p className="ui-in-chip">예시 배치 · 실제 가구 위치와 크기가 아니에요</p>}
      <Joystick input={input} />
      <PinPanel target={target} draft={draft} selected={selected} onClearDraft={() => setDraft(null)} onClearSelected={() => setSelectedId(null)} />
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
  return (
    <div className="ui-interior" role="dialog" aria-label={`${indoor.title} 실내`}>
      {ready && <Loaded key={indoor.floorplanId} plan={q.data} title={indoor.title} floorplanId={indoor.floorplanId} onExit={exit} />}
      {!ready && (
        <div className="ui-interior-bar glass">
          <strong>{indoor.title}</strong>
          <button type="button" className="ui-mini" onClick={exit}>나가기</button>
        </div>
      )}
      {q.isLoading && <p className="ui-interior-note" role="status">실내를 불러오는 중…</p>}
      {q.isError && <p className="ui-interior-note" role="alert">{q.error instanceof ApiError && q.error.status === 404 ? '평면도가 아직 없어요.' : '실내를 불러오지 못했어요.'}</p>}
      {q.data?.glbUrl && <p className="ui-interior-note">3D 모델(GLB) 보기는 준비 중이에요.</p>}
    </div>
  );
}
