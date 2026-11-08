import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { CSS2DRenderer } from 'three/examples/jsm/renderers/CSS2DRenderer.js';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { GTAOPass } from 'three/examples/jsm/postprocessing/GTAOPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { judgeFps, type Quality } from '../quality';
import { useGfx } from '../gfx';
import { useWorld } from '../app/state/world';
import { useUi } from '../app/state/ui';
import { buildWorld, type BuiltWorld } from './buildWorld.js';
import { useArea, siteOf } from '../app/state/area';
import { neighborhoodUrl } from './neighborhood';
import { disposeScene } from './disposeScene';
import { handleContextLost } from './contextLoss';
import './world3d.css';

type Built = BuiltWorld;

/** 장면 내용(건물·나무·플레이어)은 buildWorld 가 R3F 의 scene 안에 만든다. 매 프레임 갱신은 frame(dt). */
function World({ Q }: { Q: Quality }) {
  const { gl, scene, camera } = useThree();
  const site = useArea((s) => siteOf(s.area));
  const built = useRef<Built | null>(null);
  // 월드는 그때의 품질로 만들고, 이후 품질이 바뀌면 다시 만들지 않고 applyQuality 로 바꾼다
  const qRef = useRef(Q);
  qRef.current = Q;
  useEffect(() => { built.current?.applyQuality(Q); if (built.current) (window as unknown as { __proto?: { Q: Quality } }).__proto!.Q = Q; }, [Q]);

  useEffect(() => {
    const Q = qRef.current;
    let dead = false;
    const T0 = performance.now(), marks: [string, number][] = [];
    const progress = (p: number, tag?: string) => {
      useWorld.setState({ progress: p });
      if (tag) marks.push([tag, Math.round(performance.now() - T0)]);
    };
    useWorld.setState({ status: 'loading', progress: 0, api: null, areaId: null });
    buildWorld({ Q, renderer: gl, domElement: gl.domElement, scene, camera, marks, progress, worldUrl: site ? neighborhoodUrl(site) : '/world.json' })
      .then((W: Built) => {
        if (dead) { W.player.dispose(); return; }
        built.current = W;
        if (qRef.current !== Q) W.applyQuality(qRef.current); // 짓는 사이에 품질이 바뀌었으면
        const w = window as unknown as Record<string, unknown>;
        w.__proto = { Q: qRef.current, marks, zones: W.zones, world: W.world, player: W.player, trees: W.trees, renderer: gl, scene, camera, heroShot: W.heroShot };
        w.__ready = true; w.__area = site || 'campus';
        useWorld.setState({ status: 'ready', progress: 1, areaId: site || 'campus', api: { ...W.api, dispose: () => W.player.dispose() } });
      })
      .catch((e: unknown) => {
        console.error(e);
        useWorld.setState({ status: 'error', error: e instanceof Error ? e.message : String(e) });
      });
    return () => {
      dead = true;
      (window as unknown as Record<string, unknown>).__ready = false;
      // 플레이어가 자기 메쉬를 장면에서 빼 버리기 전에 먼저 훑어서 해제한다 (월드 교체·언마운트 공통)
      disposeScene(scene);
      built.current?.player.dispose(); built.current = null;
    };
  }, [gl, scene, camera, site]);

  useFrame((_, dt) => built.current?.frame(Math.min(0.05, dt)), 0);
  return null;
}

/** 후처리(GTAO) + 라벨(CSS2D). 우선순위 1 이상의 useFrame 이 있으면 R3F 는 기본 렌더를 하지 않는다. */
function Post({ Q }: { Q: Quality }) {
  const { gl, scene, camera, size } = useThree();
  const aoScale = Q.ao === 'half' ? 0.5 : 1;
  const useAO = Q.ao !== 'off' && !/noao/.test(location.search);

  const rig = useMemo(() => {
    const labels = new CSS2DRenderer();
    Object.assign(labels.domElement.style, { position: 'fixed', inset: '0', pointerEvents: 'none' });
    gl.domElement.parentElement?.appendChild(labels.domElement);
    // AO 를 끈 품질이면 후처리 렌더 타깃(전체 해상도 여러 장)을 아예 만들지 않는다
    if (!useAO) return { composer: null, ao: null, labels };
    const pr = gl.getPixelRatio();
    const composer = Q.msaa > 0
      ? new EffectComposer(gl, new THREE.WebGLRenderTarget(size.width * pr, size.height * pr, { samples: Q.msaa, type: THREE.HalfFloatType }))
      : new EffectComposer(gl);
    composer.addPass(new RenderPass(scene, camera));
    const ao = new GTAOPass(scene, camera, size.width * aoScale, size.height * aoScale);
    ao.updateGtaoMaterial({ radius: 1.2, distanceExponent: 1.5, thickness: 2, scale: 1.1 });
    ao.blendIntensity = 0.85;
    composer.addPass(ao);
    composer.addPass(new OutputPass());
    return { composer, ao, labels };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gl, scene, camera, Q]);

  useEffect(() => {
    if (rig.composer && rig.ao) {
      rig.composer.setSize(size.width, size.height);
      // addPass/setSize 가 전체 크기로 되돌리므로 AO 는 매번 다시 맞춤
      rig.ao.setSize(size.width * gl.getPixelRatio() * aoScale, size.height * gl.getPixelRatio() * aoScale);
    }
    rig.labels.setSize(size.width, size.height);
  }, [rig, size, gl, aoScale]);

  // 품질이 바뀌면(자동 낮추기·그래픽 메뉴) rig 를 새로 만든다 → 옛 rig 의 GPU 자원을 모두 푼다.
  // EffectComposer.dispose 는 자기 렌더 타깃만 풀고 붙인 패스(GTAO 의 법선·AO·디노이즈 타깃)는 안 풀어서 따로 푼다
  useEffect(() => () => {
    for (const p of rig.composer?.passes ?? []) p.dispose();
    rig.composer?.dispose();
    rig.labels.domElement.remove();
  }, [rig]);

  useFrame(() => {
    if (rig.composer) rig.composer.render(); else gl.render(scene, camera);
    rig.labels.render(scene, camera);
  }, 1);
  return null;
}

/**
 * 실행 중 FPS 를 보고 품질을 자동으로 한 단계씩 낮춘다 (품질이 '자동'일 때만, 주소 ?q= 나 직접 고른 값은 그대로).
 * 월드가 준비된 뒤 2초 기다렸다가(셰이더 준비) 4초 창으로 잰다. 탭이 가려졌거나 월드를 바꾸는 중이면 창을 버린다.
 */
function FpsGuard() {
  const w = useRef({ t: 0, frames: 0, warm: 2 });
  const reset = (warm = 2) => { w.current = { t: 0, frames: 0, warm }; };
  const status = useWorld((s) => s.status);
  const level = useGfx((s) => s.level);
  // 지도·실내를 보는 동안 3D 가 멈췄다가 돌아오면 첫 프레임 간격이 그 시간만큼 길다 → 그때마다 새로 잰다
  const mapMode = useUi((s) => s.mapMode);
  const indoor = useUi((s) => s.indoor);
  useEffect(() => { reset(); }, [status, level, mapMode, indoor]);
  useEffect(() => {
    const onVis = () => reset(1);
    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
  }, []);
  useFrame((_, dt) => {
    if (status !== 'ready' || document.hidden) return;
    const c = w.current;
    if (c.warm > 0) { c.warm -= dt; return; }
    c.t += dt; c.frames++;
    if (c.t < 4) return;
    const g = useGfx.getState();
    const verdict = judgeFps(g.level, c.frames, c.t);
    reset(verdict === 'down' ? 2 : 0);
    if (verdict === 'down' && g.autoStepDown()) console.info(`[gfx] FPS ${(c.frames / c.t).toFixed(1)} → 품질 한 단계 낮춤: ${useGfx.getState().level}`);
    if (verdict === 'slow' && !g.slow) g.markSlow();
  }, -1);
  return null;
}

/** 3D 층. 장면이 준비되면 WorldApi 를 useWorld 에 채운다. */
export function WorldCanvas() {
  const Q = useGfx((s) => s.Q);
  // 캔버스 안티에일리어싱은 만들 때만 정해진다 → 처음 품질로 고정 (바꾼 값은 다음 접속부터)
  const antialias = useMemo(() => useGfx.getState().Q.antialias, []);
  const mapMode = useUi((s) => s.mapMode); // 지도·실내를 보는 동안은 동네 3D 를 그리지 않는다 (GPU 절약)
  const indoor = useUi((s) => s.indoor);
  return (
    <Canvas
      gl={{ antialias, powerPreference: 'high-performance' }}
      dpr={[Q.minPixelRatio, Q.pixelRatio]}
      shadows={{ type: THREE.PCFSoftShadowMap }}
      camera={{ fov: 55, near: 0.3, far: 3000 }}
      frameloop={mapMode === '2d' || indoor ? 'never' : 'always'}
      onCreated={({ gl }) => {
        gl.outputColorSpace = THREE.SRGBColorSpace;
        gl.toneMapping = THREE.ACESFilmicToneMapping;
        gl.toneMappingExposure = 1.05;
        gl.domElement.addEventListener('webglcontextlost', handleContextLost);
      }}
    >
      <World Q={Q} />
      <Post Q={Q} />
      <FpsGuard />
    </Canvas>
  );
}
