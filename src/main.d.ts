// 3D 층이 메뉴에 주는 API 타입 (WorldCanvas 가 useWorld().api 에 채움). API를 바꾸면 여기도 같이 바꾼다.
export type Landmark = { key: string; name: string };

export type WorldApi = {
  /** 메뉴에 띄울 랜드마크 (첫 항목 'hero' = 사자상 정면) */
  landmarks: Landmark[];
  /** 랜드마크 앞 빈자리로 이동. 못 찾으면 false */
  goToLandmark(key: string): boolean;
  /** 지점(3D 좌표 m)이 보이는 빈자리로 이동해 그쪽을 바라봄. 갈 곳이 없으면 false */
  goToPlace(x: number, z: number): boolean;
  /** 3D 좌표(m, 원점 사자상, x=동 z=남)로 이동. 건물 안이면 false */
  teleport(x: number, z: number, faceX?: number, faceZ?: number): boolean;
  getPose(): { p: [number, number, number]; heading: number };
  dispose(): void;
};
