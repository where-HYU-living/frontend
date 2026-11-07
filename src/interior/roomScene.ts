import type { FloorPlan } from '../api/types';
import type { Box } from './buildInterior';
import { buildFurniture, fixtureSolids, fixturesFromFurniture, placeFixtures, type PlacedFixture } from './fixtures';
import { furnishPlan } from './furnish';
import { MeshBuilder } from './meshBuilder';
import { buildStructure, floorHeightAt, type StructureInfo } from './structure';

export type RoomScene = {
  /** 벽·바닥·천장·문·창·조명 */
  structure: MeshBuilder;
  /** 설비·가구 (끄고 켤 수 있다) */
  furniture: MeshBuilder;
  placed: PlacedFixture[];
  /** 가구 충돌 상자 */
  solids: Box[];
  info: StructureInfo;
  /** true 면 평면도에 설비 정보가 없어서 방 이름·면적으로 추정한 '예시 배치' */
  example: boolean;
  /** 평면 좌표(장면 x, z) 의 바닥 높이 */
  floorAt: (x: number, z: number) => number;
};

/** 평면도(JSON) → 그릴 조각들. 순수 함수라 장면 없이 테스트할 수 있다 */
export function buildRoomScene(plan: FloorPlan): RoomScene {
  const structure = new MeshBuilder();
  const info = buildStructure(plan, structure);
  const example = !plan.fixtures?.length;
  const placed = placeFixtures(plan, example ? fixturesFromFurniture(furnishPlan(plan)) : plan.fixtures);
  const furniture = new MeshBuilder();
  buildFurniture(furniture, placed);
  return { structure, furniture, placed, solids: fixtureSolids(placed), info, example, floorAt: (x, z) => floorHeightAt(plan, x, z) };
}
