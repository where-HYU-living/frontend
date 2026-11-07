import type { FloorPlan } from '../api/types';
import type { Box } from './buildInterior';
import { isBlocked } from './collision';
import { polygonArea } from './geom';
import { roomAt, type Lamp } from './structure';

/** 걷는 방향 (-sin yaw, -cos yaw) 이 from → to 를 향하게 하는 yaw. 입력은 장면 좌표 (x, z) */
export const yawToward = (from: [number, number], to: [number, number]) => Math.atan2(-(to[0] - from[0]), -(to[1] - from[1]));

/** 몸 반경: Walker 와 같게 */
export const BODY_RADIUS = 0.22;

export type Jump = { key: string; label: string; /** 방 면적(㎡). 입구는 없음 */ area?: number; x: number; z: number; yaw: number; room: number };

/**
 * (x, z) 가 막혀 있으면 같은 방 안에서 가장 가까운 빈 자리를 찾는다 (10cm 격자, 최대 2m).
 * 못 찾으면 null — 가구로 꽉 찬 방에는 서 있을 자리가 없다.
 */
export function nearestFree(plan: FloorPlan, colliders: Box[], x: number, z: number, room = roomAt(plan, x, z)): [number, number] | null {
  const ok = (px: number, pz: number) => roomAt(plan, px, pz) === room && !isBlocked(colliders, px, pz, BODY_RADIUS);
  if (room < 0) return null;
  if (ok(x, z)) return [x, z];
  let best: [number, number] | null = null, bd = Infinity;
  for (let dx = -2; dx <= 2; dx += 0.1) for (let dz = -2; dz <= 2; dz += 0.1) {
    const d = Math.hypot(dx, dz);
    if (d >= bd || !ok(x + dx, z + dz)) continue;
    bd = d; best = [x + dx, z + dz];
  }
  return best;
}

/** 방 안에서 가장 먼 꼭짓점 쪽 (방을 가로질러 보이도록) */
function farthestCorner(plan: FloorPlan, room: number, from: [number, number]): [number, number] {
  let best = from, bd = -1;
  for (const [px, pz] of plan.rooms[room].polygon) { const d = Math.hypot(px - from[0], pz - from[1]); if (d > bd) { bd = d; best = [px, pz]; } }
  return best;
}

/** 입구 안쪽에서 시작할 때의 자세 (Walker 의 처음 시선과 같다: 입구를 등지고 방 안쪽) */
export function entryPose(plan: FloorPlan, spawn: [number, number, number]) {
  return { x: spawn[0], z: spawn[2], yaw: yawToward(plan.entrance, [spawn[0], spawn[2]]) };
}

/**
 * 방 바로가기 목록: 처음은 '입구', 그다음 사람이 들어갈 만한 방(조명이 달린 방)마다 하나.
 * 도착 지점은 방 가운데이되 가구 위면 가장 가까운 빈 자리로 옮긴다. 서 있을 자리가 없는 방은 뺀다.
 */
export function jumpTargets(plan: FloorPlan, lamps: Lamp[], spawn: [number, number, number], colliders: Box[]): Jump[] {
  const e = entryPose(plan, spawn);
  const out: Jump[] = [{ key: 'entrance', label: '입구', x: e.x, z: e.z, yaw: e.yaw, room: roomAt(plan, e.x, e.z) }];
  for (const l of lamps) {
    if (l.index !== 0) continue; // 큰 방은 조명이 여러 개 — 대표 하나만
    const room = roomAt(plan, l.x, l.z);
    if (room < 0) continue;
    const spot = nearestFree(plan, colliders, l.x, l.z, room);
    if (!spot) continue;
    out.push({ key: `room${room}`, label: l.name, area: polygonArea(plan.rooms[room].polygon), x: spot[0], z: spot[1], yaw: yawToward(spot, farthestCorner(plan, room, spot)), room });
  }
  return out;
}

/**
 * 초대받은 사람이 설 자리: 초대한 사람이 서 있던 방 안에서, 옆(오른쪽 → 왼쪽 → 뒤 → 앞) 0.8m 의 빈자리.
 * 방 밖(벽 속)이거나 가구 위면 같은 방의 가장 가까운 빈자리로 옮기고, 서서 초대한 사람 쪽을 본다.
 * 그 방에 설 자리가 없으면 null (호출한 쪽이 입구에서 시작한다).
 */
export function landingSpot(plan: FloorPlan, colliders: Box[], from: { x: number; z: number; yaw: number }): { x: number; z: number; yaw: number } | null {
  const room = roomAt(plan, from.x, from.z);
  if (room < 0) return null;
  const fx = -Math.sin(from.yaw), fz = -Math.cos(from.yaw), rx = -fz, rz = fx; // 앞, 오른쪽
  for (const [dx, dz] of [[rx, rz], [-rx, -rz], [-fx, -fz], [fx, fz]]) {
    const p = nearestFree(plan, colliders, from.x + dx * 0.8, from.z + dz * 0.8, room);
    if (p && Math.hypot(p[0] - from.x, p[1] - from.z) > 0.4) return { x: p[0], z: p[1], yaw: yawToward(p, [from.x, from.z]) };
  }
  const p = nearestFree(plan, colliders, from.x, from.z, room); // 비좁은 방: 그 자리 근처라도
  return p ? { x: p[0], z: p[1], yaw: from.yaw } : null;
}
