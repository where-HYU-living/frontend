/** B5: 입구·내 과 건물 위치 정리 (순수 함수). 좌표는 3D 로컬(m) */
import type { CampusBuilding } from '../api/types';

export type Spot = { id: string; name: string; x: number; z: number };
type Place = { id: number; name: string; center: [number, number] | null };

/** 서버 /buildings 의 GATE. 서버가 없거나 비어 있으면 앱에 든 애지문(한양대역 2번 출구)을 정문으로 대신한다 */
export function resolveGates(buildings: readonly CampusBuilding[] | undefined, toLocal: (lat: number, lng: number) => [number, number], places: readonly Place[]): Spot[] {
  const gates = (buildings ?? []).filter((b) => b.type === 'GATE').map((b): Spot => { const [x, z] = toLocal(b.lat, b.lng); return { id: `g${b.id}`, name: b.name, x, z }; });
  if (gates.length) return gates;
  const aeji = places.find((p) => p.id === 104 && p.center);
  return aeji?.center ? [{ id: 'g104', name: '정문 · 애지문', x: aeji.center[0], z: aeji.center[1] }] : [];
}

/** 내 과 건물 id → 위치. 서버 /buildings 에 없으면 앱 내장 캠퍼스 목록(center)으로 */
export function resolveMyBuildings(ids: readonly number[] | undefined, buildings: readonly CampusBuilding[] | undefined, toLocal: (lat: number, lng: number) => [number, number], places: readonly Place[]): Spot[] {
  const out: Spot[] = [];
  for (const id of ids ?? []) {
    const b = buildings?.find((x) => x.id === id);
    if (b) { const [x, z] = toLocal(b.lat, b.lng); out.push({ id: `b${id}`, name: b.name, x, z }); continue; }
    const p = places.find((x) => x.id === id);
    if (p?.center) out.push({ id: `b${id}`, name: p.name, x: p.center[0], z: p.center[1] });
  }
  return out;
}
