import * as THREE from 'three';
import { CSS2DRenderer } from 'three/examples/jsm/renderers/CSS2DRenderer.js';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { GTAOPass } from 'three/examples/jsm/postprocessing/GTAOPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { detectQuality } from './quality.ts';
import { buildWorld } from './world/buildWorld.js';

// 3D 장면 진입점 (기존 순수 three.js 경로). React 메뉴 층(src/app)이 initWorld(container)로 불러 쓴다.
// 장면 내용은 world/buildWorld.js 가 만들고, 여기서는 렌더러·후처리·루프만 맡는다. (?r3f=1 이면 R3F 경로: world/WorldCanvas.tsx)
// 화면 요소 중 3D가 직접 쓰는 것: #minimap(canvas), #joystick, #attrib (React가 깔아 둠, 없으면 건너뜀)
// 타입 선언: src/main.d.ts
export async function initWorld(app, { onProgress = () => {} } = {}) {
  const Q = detectQuality();
  const T0 = performance.now(), marks = [];
  const progress = (p, tag) => { onProgress(p); if (tag) marks.push([tag, Math.round(performance.now() - T0)]); };

  // ---- 렌더러
  const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(devicePixelRatio, Q.pixelRatio)); // 성능: 품질 프리셋(src/quality.ts)
  renderer.setSize(innerWidth, innerHeight);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  app.appendChild(renderer.domElement);
  const labelRenderer = new CSS2DRenderer();
  labelRenderer.setSize(innerWidth, innerHeight);
  Object.assign(labelRenderer.domElement.style, { position: 'fixed', inset: '0', pointerEvents: 'none' });
  app.appendChild(labelRenderer.domElement);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(55, innerWidth / innerHeight, 0.3, 3000);
  const onResize = () => {
    camera.aspect = innerWidth / innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(innerWidth, innerHeight);
    labelRenderer.setSize(innerWidth, innerHeight);
  };
  addEventListener('resize', onResize);

  const W = await buildWorld({ Q, renderer, domElement: renderer.domElement, scene, camera, marks, progress });

  // ---- 후처리: 주변광 차폐(GTAO) — 건물 모서리·처마·계단 틈에 자연스러운 그늘
  // 멀티샘플 렌더 타깃: 잎 카드(alphaTest) 가장자리 반짝임 완화 (high 만)
  const pr = renderer.getPixelRatio();
  const composer = Q.msaa > 0
    ? new EffectComposer(renderer, new THREE.WebGLRenderTarget(innerWidth * pr, innerHeight * pr, { samples: Q.msaa, type: THREE.HalfFloatType }))
    : new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  const aoScale = Q.ao === 'half' ? 0.5 : 1;
  const ao = new GTAOPass(scene, camera, innerWidth * aoScale, innerHeight * aoScale);
  ao.updateGtaoMaterial({ radius: 1.2, distanceExponent: 1.5, thickness: 2, scale: 1.1 });
  ao.blendIntensity = 0.85;
  composer.addPass(ao);
  const fitAO = () => ao.setSize(innerWidth * renderer.getPixelRatio() * aoScale, innerHeight * renderer.getPixelRatio() * aoScale); // addPass/setSize 가 전체 크기로 되돌리므로 매번 다시 맞춤
  fitAO();
  composer.addPass(new OutputPass());
  const onComposerResize = () => { composer.setSize(innerWidth, innerHeight); fitAO(); };
  addEventListener('resize', onComposerResize);
  const useAO = Q.ao !== 'off' && !/noao/.test(location.search);

  // ---- 루프
  const clock = new THREE.Clock();
  renderer.setAnimationLoop(() => {
    W.frame(Math.min(0.05, clock.getDelta()));
    if (useAO) composer.render(); else renderer.render(scene, camera);
    labelRenderer.render(scene, camera);
  });
  console.table(marks);
  window.__ready = true;
  window.__proto = { Q, marks, zones: W.zones, world: W.world, player: W.player, trees: W.trees, renderer, scene, camera, heroShot: W.heroShot };

  return {
    ...W.api,
    dispose: () => {
      renderer.setAnimationLoop(null);
      removeEventListener('resize', onResize);
      removeEventListener('resize', onComposerResize);
      composer.dispose();
      renderer.dispose();
      renderer.domElement.remove();
      labelRenderer.domElement.remove();
    },
  };
}
