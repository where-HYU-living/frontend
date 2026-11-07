export const LOD_NEAR = 140; // m: 이 안은 원본 나무
export const LOD_FAR = 420; // m: 이 밖은 안개에 묻혀 숨김
export type TreeLod = 0 | 1 | 2;
const MARGIN = 12; // 경계에서 깜빡이지 않게 이전 단계를 이만큼 더 붙든다

export function lodFor(dist: number, prev?: TreeLod): TreeLod {
  const near = prev === 0 ? LOD_NEAR + MARGIN : prev === 1 ? LOD_NEAR - MARGIN : LOD_NEAR;
  const far = prev === 2 ? LOD_FAR - MARGIN : prev === 1 ? LOD_FAR + MARGIN : LOD_FAR;
  return dist < near ? 0 : dist < far ? 1 : 2;
}
