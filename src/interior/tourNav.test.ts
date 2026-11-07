import { describe, expect, test } from 'vitest';
import { FLOORPLAN_1 } from '../mock/fixtures/floorplan1';
import { buildInterior } from './buildInterior';
import { isBlocked } from './collision';
import { buildRoomScene } from './roomScene';
import { BODY_RADIUS, entryPose, jumpTargets, landingSpot, nearestFree, yawToward } from './tourNav';
import { roomAt } from './structure';

const plan = FLOORPLAN_1;
const built = buildInterior(plan), scene = buildRoomScene(plan);
const colliders = [...built.wallPieces, ...scene.solids];

describe('방 바로가기', () => {
  const jumps = jumpTargets(plan, scene.info.lamps, built.spawn, colliders);

  test('입구가 맨 앞, 그다음 사람이 들어갈 방들', () => {
    expect(jumps.map((j) => j.label)).toEqual(['입구', '현관', '욕실', '거실', '실외기실']);
    expect(jumps[0].area).toBeUndefined();
    expect(jumps.slice(1).every((j) => typeof j.area === 'number' && j.area > 0.8)).toBe(true);
  });

  test('도착 지점은 모두 자기 방 안이고 가구·벽에 막히지 않는다', () => {
    for (const j of jumps) {
      expect(roomAt(plan, j.x, j.z), j.label).toBe(j.room);
      expect(isBlocked(colliders, j.x, j.z, BODY_RADIUS), j.label).toBe(false);
    }
  });

  test('방 이름과 가리키는 방이 맞다', () => {
    const byLabel = Object.fromEntries(jumps.map((j) => [j.label, plan.rooms[j.room].name]));
    expect(byLabel['욕실']).toBe('욕실');
    expect(byLabel['거실']).toBe('거실');
  });

  test('입구는 Walker 의 처음 자세와 같다', () => {
    const e = entryPose(plan, built.spawn);
    expect(jumps[0]).toMatchObject({ x: e.x, z: e.z, yaw: e.yaw });
    // 입구(위쪽 벽)에서 안쪽(+z)을 본다: 걷는 방향 (-sin, -cos) 의 z 가 +
    expect(-Math.cos(e.yaw)).toBeGreaterThan(0.9);
  });
});

describe('nearestFree / yawToward', () => {
  test('가구 위의 점은 같은 방의 가까운 빈 자리로 옮긴다', () => {
    const bed: [number, number] = [0.56, 4.43]; // 침대 한가운데
    expect(isBlocked(colliders, bed[0], bed[1], BODY_RADIUS)).toBe(true);
    const p = nearestFree(plan, colliders, bed[0], bed[1])!;
    expect(p).not.toBeNull();
    expect(isBlocked(colliders, p[0], p[1], BODY_RADIUS)).toBe(false);
    expect(roomAt(plan, p[0], p[1])).toBe(roomAt(plan, bed[0], bed[1]));
    expect(Math.hypot(p[0] - bed[0], p[1] - bed[1])).toBeLessThan(1.2);
  });
  test('방 밖이면 null', () => expect(nearestFree(plan, colliders, 20, 20)).toBeNull());
  test('yawToward: 북(-z)을 보면 yaw 0, 동(+x)을 보면 -π/2', () => {
    expect(yawToward([0, 0], [0, -1])).toBeCloseTo(0);
    expect(yawToward([0, 0], [1, 0])).toBeCloseTo(-Math.PI / 2);
    const south = yawToward([0, 0], [0, 1]);
    expect(Math.abs(Math.abs(south) - Math.PI)).toBeLessThan(1e-9); // 남쪽은 π 또는 -π (같은 방향)
  });
});

describe('초대받은 사람이 서는 자리', () => {
  const dist = (a: { x: number; z: number }, b: { x: number; z: number }) => Math.hypot(a.x - b.x, a.z - b.z);

  test('초대한 사람 옆 0.4~1.3m, 같은 방 안, 가구·벽에 안 막히고, 초대한 사람을 바라본다', () => {
    const inviter = { x: 1.9, z: 3.0, yaw: 0.4 }; // 거실 통로
    const spot = landingSpot(plan, colliders, inviter)!;
    expect(spot).not.toBeNull();
    expect(roomAt(plan, spot.x, spot.z)).toBe(roomAt(plan, inviter.x, inviter.z));
    expect(isBlocked(colliders, spot.x, spot.z, BODY_RADIUS)).toBe(false);
    expect(dist(spot, inviter)).toBeGreaterThan(0.4);
    expect(dist(spot, inviter)).toBeLessThan(1.3);
    // 시선이 초대한 사람 쪽: 걷는 방향 (-sin yaw, -cos yaw) 이 spot → inviter 와 같다
    const dx = inviter.x - spot.x, dz = inviter.z - spot.z, d = Math.hypot(dx, dz);
    expect(-Math.sin(spot.yaw)).toBeCloseTo(dx / d, 2);
    expect(-Math.cos(spot.yaw)).toBeCloseTo(dz / d, 2);
  });

  test('초대한 사람이 침대 위처럼 가구 속에 있어도(좌표가 그렇게 와도) 같은 방의 빈자리에 선다', () => {
    const spot = landingSpot(plan, colliders, { x: 0.56, z: 4.43, yaw: 0 })!;
    expect(spot).not.toBeNull();
    expect(isBlocked(colliders, spot.x, spot.z, BODY_RADIUS)).toBe(false);
    expect(roomAt(plan, spot.x, spot.z)).toBe(roomAt(plan, 0.56, 4.43));
  });

  test('욕실처럼 좁은 방에서도 그 방 안에 선다', () => {
    const spot = landingSpot(plan, colliders, { x: 1.1, z: 1.9, yaw: 1 });
    if (spot) expect(roomAt(plan, spot.x, spot.z)).toBe(roomAt(plan, 1.1, 1.9));
  });

  test('집 밖 좌표(잘못된 링크)면 null — 호출한 쪽이 입구에서 시작한다', () => {
    expect(landingSpot(plan, colliders, { x: 30, z: 30, yaw: 0 })).toBeNull();
  });
});
