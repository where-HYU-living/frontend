/** 실내 장면과 DOM(조이스틱·미니맵)이 같이 읽고 쓰는 값. React 상태가 아니라서 프레임마다 써도 렌더가 일어나지 않는다 */
export type InteriorInput = {
  /** 가상 조이스틱: x = 오른쪽(+), y = 앞(+), 각각 -1~1 */
  joy: { x: number; y: number };
  /** 현재 위치(장면 x, z)와 시선 방향 */
  pose: { x: number; z: number; yaw: number };
};
export const makeInput = (): InteriorInput => ({ joy: { x: 0, y: 0 }, pose: { x: 0, z: 0, yaw: 0 } });
