import { expect, test, vi } from 'vitest';
import * as THREE from 'three';
import { disposeScene } from './disposeScene';

test('월드 교체 때 조명(그림자 맵)·PMREM 렌더 타깃까지 해제한다 (3-4 누수)', () => {
  const scene = new THREE.Scene();
  const sun = new THREE.DirectionalLight(); sun.castShadow = true;
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshStandardMaterial({ map: new THREE.Texture() }));
  scene.add(sun, mesh);
  const rt = new THREE.WebGLRenderTarget(4, 4);
  scene.userData.envRT = rt; scene.environment = rt.texture;
  const lightDispose = vi.spyOn(sun, 'dispose'), rtDispose = vi.spyOn(rt, 'dispose'), geoDispose = vi.spyOn(mesh.geometry, 'dispose');
  const r = disposeScene(scene);
  expect(lightDispose).toHaveBeenCalled();
  expect(rtDispose).toHaveBeenCalled();
  expect(geoDispose).toHaveBeenCalled();
  expect(r).toMatchObject({ geometries: 1, materials: 1, textures: 1 });
  expect(scene.children).toHaveLength(0);
  expect(scene.userData.envRT).toBeUndefined();
});
