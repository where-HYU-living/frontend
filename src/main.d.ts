// 3D 층이 메뉴에 주는 API 타입 (WorldCanvas 가 useWorld().api 에 채움). API를 바꾸면 여기도 같이 바꾼다.
export type Landmark = { key: string; name: string };

export type Marker = { id: string; x: number; z: number; text: string; color: string; label?: string; /** 말 앞에 붙일 아이콘(SVG 문자열) */ icon?: string; onClick?: () => void };

export type RemotePlayer = { id: string; nickname: string; x: number; z: number; r: number; chat?: string; /** 이모트 아이콘(SVG 문자열) */ emote?: string; /** 걷는 중이면 true */ walking?: boolean; /** 상대의 캐릭터 꾸미기 (없으면 기본 모양) */ look?: { jacket: string; hair: string; skin: string } };

export type WorldApi = {
  /** 메뉴에 띄울 랜드마크 (첫 항목 'hero' = 사자상 정면) */
  landmarks: Landmark[];
  /** 랜드마크 앞 빈자리로 이동. 못 찾으면 false */
  goToLandmark(key: string): boolean;
  /** 지점(3D 좌표 m)이 보이는 빈자리로 이동해 그쪽을 바라봄. 갈 곳이 없으면 false */
  goToPlace(x: number, z: number): boolean;
  /** 3D 좌표(m, 원점 사자상, x=동 z=남)로 이동. 건물 안이면 false */
  teleport(x: number, z: number, faceX?: number, faceZ?: number): boolean;
  /** 3D 위에 매물 말풍선을 그린다 (전체 교체). x,z = 3D 좌표(m) */
  setMarkers(items: Marker[], group?: string): void;
  /** 빛 기둥+깃발 (전체 교체). 모집 중인 청년안심주택 강조 */
  setBeacons(items: { x: number; z: number; color: string | number }[]): void;
  /** 시간대 조명: t = 0(낮) ~ 1(밤), 중간값은 부드럽게 섞인다 */
  setTimeOfDay(t: number): void;
  /** 다른 접속자 표시 (전체 교체, 목록에 없는 사람은 지움). r = y축 회전(라디안) */
  setRemotePlayers(list: RemotePlayer[]): void;
  /** 내 캐릭터 머리 위 말풍선·이모트 (둘 다 없으면 숨김) */
  setSelfBubble?(b: { chat?: string; emote?: string }): void;
  /** 내 캐릭터 외형(머티리얼 색만 바꿈). 색은 '#rrggbb' */
  setAppearance(look: { jacket?: string; hair?: string; skin?: string }): void;
  /** E1: 문 마커 (전체 교체). 가까이 가면 '들어가기' 안내가 뜨고 E 키/탭하면 onEnter. 빈 배열이면 안내도 사라진다 */
  setDoors?(items: { id: string; x: number; z: number; title: string; onEnter: () => void }[]): void;
  /** B5: 정문·후문 아치 (전체 교체). 길 방향에 맞춰 세운다 */
  setGates?(items: { id: string; name: string; x: number; z: number }[]): void;
  getPose(): { p: [number, number, number]; heading: number };
  /** 4단계 F6: 도보 경로를 바닥에 그린다(파란 띠+화살표). 구간마다 3D 좌표 목록. null·빈 배열이면 지운다 */
  setRoute?(segments: { x: number; z: number }[][] | null): { points: number; arrows: number };
  /** 이 월드의 범위 (m) — 경로를 월드 안 구간만 그리려고 */
  bounds?: { minX: number; maxX: number; minZ: number; maxZ: number };
  dispose(): void;
};
