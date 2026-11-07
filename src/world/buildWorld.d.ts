import type * as THREE from 'three';
import type { WorldApi } from '../main';
import type { Quality } from '../quality';

export type BuiltWorld = {
  world: unknown;
  zones: unknown;
  player: { dispose(): void };
  trees: unknown;
  labels: THREE.Object3D[];
  sun: THREE.DirectionalLight;
  sunDir: THREE.Vector3;
  /** 매 프레임 호출: 플레이어·태양·LOD·미니맵 갱신 */
  frame(dt: number): void;
  marks: [string, number][];
  heroShot(): void;
  api: Omit<WorldApi, 'dispose'>;
};

export function buildWorld(opts: {
  Q: Quality;
  renderer: THREE.WebGLRenderer;
  domElement: HTMLElement;
  scene: THREE.Scene;
  camera: THREE.Camera;
  marks?: [string, number][];
  progress?: (p: number, tag?: string) => void;
  /** 월드 JSON 주소 (기본 '/world.json' = 캠퍼스, 동네는 '/neighborhoods/<id>.json') */
  worldUrl?: string;
}): Promise<BuiltWorld>;
