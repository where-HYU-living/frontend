import { useEffect, useMemo, useRef, type RefObject } from 'react';
import * as THREE from 'three';
import { useFrame, useThree } from '@react-three/fiber';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { GTAOPass } from 'three/examples/jsm/postprocessing/GTAOPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import type { Quality } from '../quality';

/**
 * 실내 후처리: GTAO(모서리·가구 밑의 접촉 음영). 동네 3D 의 Post 와 같은 방식이고 품질 프리셋(`?q=`)을 따른다.
 * low 이거나 `?noao` 면 후처리 없이 바로 그린다. 우선순위 1 의 useFrame 이 있으면 R3F 기본 렌더는 꺼지므로 두 경우 모두 여기서 그린다.
 */
export function InteriorPost({ Q }: { Q: Quality }) {
  const { gl, scene, camera, size } = useThree();
  const aoScale = Q.ao === 'half' ? 0.5 : 1;
  const useAO = Q.ao !== 'off' && !/noao/.test(location.search);

  const rig = useMemo(() => {
    if (!useAO) return null;
    const pr = gl.getPixelRatio();
    const composer = Q.msaa > 0
      ? new EffectComposer(gl, new THREE.WebGLRenderTarget(size.width * pr, size.height * pr, { samples: Q.msaa, type: THREE.HalfFloatType }))
      : new EffectComposer(gl);
    composer.addPass(new RenderPass(scene, camera));
    const ao = new GTAOPass(scene, camera, size.width * aoScale, size.height * aoScale);
    ao.updateGtaoMaterial({ radius: 0.55, distanceExponent: 1.4, thickness: 1, scale: 1.2 });
    ao.blendIntensity = 0.8;
    composer.addPass(ao);
    composer.addPass(new OutputPass());
    return { composer, ao };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gl, scene, camera, Q, useAO]);

  useEffect(() => {
    if (!rig) return;
    rig.composer.setSize(size.width, size.height);
    rig.ao.setSize(size.width * gl.getPixelRatio() * aoScale, size.height * gl.getPixelRatio() * aoScale); // setSize 가 전체 크기로 되돌리므로 AO 는 매번 다시 맞춘다
  }, [rig, size, gl, aoScale]);
  useEffect(() => () => rig?.composer.dispose(), [rig]);

  useFrame(() => { if (rig) rig.composer.render(); else gl.render(scene, camera); }, 1);
  return null;
}

export type LabelAnchor = { x: number; y: number; z: number };

/**
 * 방 이름표. 3D 스프라이트 대신 HTML 로 띄운다(AO 패스가 스프라이트를 못 다룸).
 * containerRef 의 자식 i 번이 anchors[i] 의 이름표. 화면 밖·뒤쪽·너무 먼 것·벽에 가려진 것은 숨긴다.
 */
export function RoomLabels({ anchors, containerRef, occluders }: { anchors: LabelAnchor[]; containerRef: RefObject<HTMLDivElement>; occluders: RefObject<THREE.Group> }) {
  const { camera, size } = useThree();
  const tmp = useMemo(() => new THREE.Vector3(), []);
  const ray = useMemo(() => new THREE.Raycaster(), []);
  const frame = useRef(0);
  const hidden = useRef<boolean[]>([]);

  useFrame(() => {
    const box = containerRef.current;
    if (!box) return;
    frame.current++;
    anchors.forEach((a, i) => {
      const node = box.children[i] as HTMLElement | undefined;
      if (!node) return;
      tmp.set(a.x, a.y, a.z);
      const dist = tmp.distanceTo(camera.position);
      if ((frame.current + i * 3) % 8 === 0 && occluders.current) { // 가림 검사는 8프레임마다 (라벨마다 엇갈리게)
        const dir = tmp.clone().sub(camera.position).normalize();
        ray.set(camera.position, dir);
        ray.far = Math.max(0, dist - 0.15);
        hidden.current[i] = ray.intersectObjects(occluders.current.children, true).length > 0;
      }
      tmp.project(camera);
      const show = tmp.z < 1 && Math.abs(tmp.x) < 1.1 && Math.abs(tmp.y) < 1.1 && dist < 8 && !hidden.current[i];
      node.style.display = show ? 'block' : 'none';
      if (show) node.style.transform = `translate(${((tmp.x * 0.5 + 0.5) * size.width).toFixed(1)}px, ${((-tmp.y * 0.5 + 0.5) * size.height).toFixed(1)}px) translate(-50%, -50%)`;
    });
  });
  return null;
}
