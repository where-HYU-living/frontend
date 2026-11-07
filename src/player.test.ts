import { beforeAll, expect, test } from 'vitest';
import * as THREE from 'three';
// @ts-expect-error JS module
import { Player } from './player.js';

beforeAll(() => {
  // jsdom 은 canvas 2d 를 구현하지 않으므로 캐릭터 등판 글씨용 컨텍스트를 흉내 낸다
  HTMLCanvasElement.prototype.getContext = (() => new Proxy({}, { get: () => () => {}, set: () => true })) as never;
});

const makePlayer = () =>
  new Player({
    scene: new THREE.Scene(), camera: new THREE.PerspectiveCamera(), dom: document.createElement('canvas'),
    heightAt: () => 0, collide: () => null, bounds: { minX: -100, maxX: 100, minZ: -100, maxZ: 100 },
  });
const press = (code: string, target: EventTarget = window) => target.dispatchEvent(new KeyboardEvent('keydown', { code, bubbles: true }));

test('dispose removes keyboard listeners', () => {
  const p = makePlayer();
  p.dispose();
  press('KeyW');
  expect(p.keys.size).toBe(0);
});
test('keys typed into an INPUT do not move the player', () => {
  const p = makePlayer();
  const input = document.createElement('input');
  document.body.append(input);
  press('KeyW', input);
  expect(p.keys.size).toBe(0);
  p.dispose();
});
test('mounting twice then disposing the first leaves one live player', () => {
  const a = makePlayer(), b = makePlayer();
  a.dispose();
  press('KeyW');
  expect([a.keys.size, b.keys.size]).toEqual([0, 1]);
  b.dispose();
});
