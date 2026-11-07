/** 실내 장면과 DOM(조이스틱·미니맵·방 바로가기)이 같이 읽고 쓰는 값. React 상태가 아니라서 프레임마다 써도 렌더가 일어나지 않는다 */
export type InteriorInput = {
  /** 가상 조이스틱: x = 오른쪽(+), y = 앞(+), 각각 -1~1 */
  joy: { x: number; y: number };
  /** 현재 위치(장면 x, z)·시선 방향·서 있는 방(rooms 인덱스, 방 밖이면 -1) */
  pose: { x: number; z: number; yaw: number; room: number };
  /** 방 바로가기 요청. DOM 이 넣으면 Walker 가 한 프레임에 가져가서 부드럽게 이동한다 */
  goto: { x: number; z: number; yaw: number; /** true 면 걸어가는 움직임 없이 바로 그 자리에 선다 (처음 입장할 때) */ snap?: boolean } | null;
};
export const makeInput = (): InteriorInput => ({ joy: { x: 0, y: 0 }, pose: { x: 0, z: 0, yaw: 0, room: -1 }, goto: null });
