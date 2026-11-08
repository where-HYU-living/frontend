// 계약 문서(docs/api-contract.md) 타입. 필드명·enum 값은 계약 그대로. 계약이 바뀌면 이 파일만 고친다.
export type Grade = 'FAIR' | 'SLIGHTLY_HIGH' | 'HIGH' | 'CULPRIT' | 'PENDING';
export type RoomType = 'OPEN' | 'SEPARATED' | 'ONE_HALF' | 'TWO_ROOM' | 'DUPLEX';
export type FavoriteType = 'LISTING' | 'HOUSING' | 'DORM' | 'TRANSFER';
export type SearchType = FavoriteType | 'BUILDING' | 'ADDRESS';
export type BuildingType = 'CAMPUS' | 'GATE' | 'DORM';

export type Page<T> = { items: T[]; page: number; size: number; total: number };

export type ListingSummary = {
  id: number;
  title: string;
  address: string;
  dong: string;
  lat: number;
  lng: number;
  deposit: number;
  rent: number;
  mgmtFee: number | null;
  areaM2: number;
  floor: number | null;
  roomType: RoomType;
  convertedRent: number;
  grade: Grade;
  walkMin: number | null;
  thumbnailUrl: string | null;
  favorited: boolean;
};

export type ListingDetail = ListingSummary & {
  options: string[];
  photos: string[];
  floorplanId: number | null;
  builtYear: number | null;
  description: string | null;
};

export type PriceCheck = {
  convertedRent: number;
  fairRent: number | null;
  monthlyExcess: number | null;
  contractMonths: number;
  totalExcess: number | null;
  excessRate: number | null;
  grade: Grade;
  conversionRate: number;
  sample: { count: number; scope: 'DONG' | 'ADJACENT' | 'NONE'; dongs: string[]; areaMinM2: number | null; areaMaxM2: number | null; from: string | null; to: string | null };
  budget: { rentCap: number | null; depositCap: number | null; overRent: number | null; overDeposit: number | null } | null;
  /** AI 적정가 (원/월, fairRent 와 같은 환산 기준). 룰 기반 판정과 별개로 옆에 보여 준다. 매물만, 없으면 null */
  aiEstimate: AiEstimate | null;
};

export type AiEstimate = { fairRent: number; low: number; high: number };

export type Alternative = { type: FavoriteType; id: number; name: string; convertedRent: number; monthlyDiff: number; twoYearDiff: number; walkMin: number | null };

export type SearchResult = { type: SearchType; id: number | null; name: string; address: string | null; lat: number; lng: number };

export type Profile = {
  id: number;
  email: string;
  nickname: string;
  departmentId: number | null;
  buildingIds: number[];
  budget: { rentCap: number | null; depositCap: number | null } | null;
};

export type Department = { id: number; name: string; college: string; defaultBuildingIds: number[] };
export type CampusBuilding = { id: number; name: string; type: BuildingType; lat: number; lng: number };

export type LoginResult = { accessToken: string; expiresIn: number; user: { id: number; email: string; nickname: string } };

export type DormRoomType = { id: number; name: string; capacity: number; semesterFee: number; semesterMonths: number; mealIncluded: boolean; monthlyCost: number; floorplanId: number | null };
export type Dorm = { id: number; name: string; lat: number; lng: number; roomTypes: DormRoomType[]; walkMin?: number | null };

export type AnnouncementStatus = 'UPCOMING' | 'OPEN' | 'CLOSED' | 'ANNOUNCED' | 'ADDITIONAL';
export type EventType = 'NOTICE' | 'APPLY_START' | 'APPLY_END' | 'DOCS_DUE' | 'RESULT' | 'CONTRACT' | 'MOVE_IN';
export type Housing = { id: number; name: string; address: string; lat: number; lng: number; recruiting: boolean; nextEvent: { type: EventType; date: string } | null; subscribed: boolean; /** 가장 싼 주택형의 환산 월세(원). 서버가 주면 목록 카드에 보인다 */ minConvertedRent?: number | null; walkMin?: number | null };
export type HousingUnitType = { id: number; name: string; exclusiveAreaM2: number | null; deposit: number; rent: number; mgmtFee: number | null; convertedRent: number; floorplanId: number | null };
export type HousingDetail = Housing & { unitTypes: HousingUnitType[]; floorLayoutImageUrl: string | null; contact: string | null; walkMin: number | null };
export type Announcement = { id: number; housingId: number; title: string; status: AnnouncementStatus; events: { type: EventType; date: string }[] };

export type FavoriteItem = { type: FavoriteType; targetId: number; name: string; lat: number; lng: number; convertedRent: number | null; grade: Grade | null; walkMin: number | null; createdAt: string };

/** 방 용도. 없으면 3D 쪽이 이름 문자열로 추측한다(furnish.roomUse) */
export type RoomKind = 'bedroom' | 'living' | 'kitchen' | 'bathroom' | 'entrance' | 'balcony' | 'utility' | 'storage' | 'hallway' | 'other';
/** 바닥 재질. tile=욕실·현관 타일, wood=마루, vinyl=장판, concrete=실외기실·베란다 */
export type FloorMaterial = 'wood' | 'tile' | 'vinyl' | 'concrete';
/** 평면도에 그려진 설비·붙박이·가구. 3D 가 종류별 모양을 만든다 */
export type FixtureKind =
  | 'toilet' | 'sink' | 'shower' | 'bathtub' | 'washer'                 // 욕실·세탁
  | 'kitchenSink' | 'cooktop' | 'fridge' | 'kitchenCounter' | 'upperCabinet' // 주방
  | 'bed' | 'desk' | 'chair' | 'wardrobe' | 'builtinWardrobe' | 'shoeRack' | 'shelf' | 'sofa' | 'tv' | 'table' // 가구·수납
  | 'acOutdoor' | 'waterHeater';                                          // 실외기·보일러

export type FloorPlan = {
  id: number; name: string; areaM2: number; ceilingHeight: number;
  /** 좌표는 전부 m, x=오른쪽 y=아래, 원점=벽 중심선 바운딩박스의 좌상단. 벽은 중심선 기준 */
  walls: {
    from: [number, number]; to: [number, number]; thickness: number;
    /** 벽 높이. 없으면 ceilingHeight. 낮은 칸막이·반벽에 쓴다 */
    height?: number;
  }[];
  openings: {
    type: 'door' | 'window'; wall: number; offset: number; width: number; height: number; sill: number;
    /** 문 형태. swing=여닫이, sliding=미닫이/슬라이딩 유리문, open=문 없이 뚫린 개구부. 없으면 swing */
    style?: 'swing' | 'sliding' | 'open';
    /** 여닫이문 경첩 위치와 열리는 쪽. hinge: 벽 from 쪽('start')/to 쪽('end').
     *  opensTo: 평면도를 위에서 본 화면(y 가 아래)에서 벽 진행방향(from→to)을 바라볼 때 왼쪽으로 열리면 +1, 오른쪽이면 -1.
     *  예) 위쪽 벽(왼→오른쪽 진행)에서 +1 은 화면 위쪽(건물 바깥)으로 열린다. 없으면 3D 가 방 크기로 정한다 */
    swing?: { hinge: 'start' | 'end'; opensTo: 1 | -1 };
  }[];
  rooms: {
    name: string; polygon: [number, number][];
    kind?: RoomKind;
    /** 바닥. height 는 기준 바닥 대비 m (욕실·현관 단차는 -0.05~-0.15, 높은 바닥은 +) */
    floor?: { material: FloorMaterial; color?: string; height?: number };
  }[];
  /** 현관문 중심점(벽 위). 입장 시 이 점에서 방 안쪽으로 시작 */
  entrance: [number, number];
  /** 평면도에 그려진 설비·가구. 없으면 3D 가 방 이름·면적으로 예시 배치를 한다 */
  fixtures?: {
    kind: FixtureKind;
    /** 바닥 접지 면 중심 좌표 */
    position: [number, number];
    /** 앞면이 향하는 방향(평면도 기준 N=위 E=오른쪽 S=아래 W=왼쪽). 변기는 물탱크 반대쪽, 침대는 발치, 붙박이장은 문 열리는 쪽 */
    facing: 'N' | 'E' | 'S' | 'W';
    /** 바닥에서 몸체 밑면까지 높이(m). 책상 위 책꽂이·벽걸이 선반처럼 공중에 놓인 것. 없으면 바닥에 놓음(조리대 위 인덕션·싱크, 벽걸이 수납장·보일러는 종류별 기본값) */
    elevation?: number;
    /** [가로(앞에서 본 폭), 깊이, 높이?] m. 높이를 모르면 생략(2개), 전체가 없으면 종류별 기본값 */
    size?: [number, number] | [number, number, number];
    /** 설비가 속한 방 이름(rooms[].name). 선택, 검수용 */
    room?: string;
  }[];
  glbUrl: string | null;
};

export type AppNotification = { id: number; type: 'HOUSING_DDAY' | 'CONTRACT_EXPIRY'; title: string; body: string; targetType: string | null; targetId: number | null; createdAt: string; read: boolean };

export type ReviewScores = { noise: number; light: number; bugs: number; landlord: number; depositReturn: number };
export type ReviewTargetType = 'LISTING' | 'HOUSING' | 'DORM';
export type Review = { id: number; rating: number; scores: ReviewScores; text: string; pin: [number, number, number] | null;
  /** 핀을 찍은 평면도(방) 번호. 실내에서는 지금 방과 같은 것만 그린다 (계약 v1.8). 핀 없는 후기·예전 핀은 null */
  floorplanId?: number | null; authorNickname: string; createdAt: string };
export type ReviewList = { average: number | null; count: number; items: Review[] };

export type MyHome = { address: string; dong: string; lat: number; lng: number; deposit: number; rent: number; mgmtFee: number | null; areaM2: number; contractStart: string; contractEnd: string };
export type Payment = { month: string; amount: number; paidAt: string };
export type Utility = { month: string; electricity: number | null; gas: number | null; water: number | null; internet: number | null };
export type HomeAlert = { id: number; daysBefore: number; enabled: boolean };
export type Report = {
  month: string; total: number;
  breakdown: { rent: number; mgmtFee: number | null; electricity: number | null; gas: number | null; water: number | null; internet: number | null };
  prevTotal: number | null; diff: number | null; topIncrease: { item: string; diff: number } | null;
  excess: { monthly: number; cumulative: number; grade: Grade } | null;
};

export type TransferStatus = 'OPEN' | 'DONE';
export type TransferSummary = ListingSummary & { remainingMonths: number; availableFrom: string | null; status: TransferStatus; authorNickname: string };
export type TransferDetail = TransferSummary & { description: string | null; photos: string[]; priceCheck: PriceCheck; mine: boolean };
export type TransferBody = { /** 글 제목 (2~40자). 목록 카드·상세·말풍선 이름에 그대로 쓴다 */ title: string; address: string; dong: string; lat: number; lng: number; deposit: number; rent: number; mgmtFee: number | null; areaM2: number; roomType: RoomType; floor: number | null; remainingMonths: number; availableFrom: string | null; description: string; photoUrls: string[] };
export type AddressResult = { address: string; roadAddress: string | null; dong: string; lat: number; lng: number };

export type NearbyCategory = 'CONVENIENCE' | 'LAUNDRY' | 'BUS_STOP' | 'SUBWAY';
export type Nearby = { category: NearbyCategory; name: string; lat: number; lng: number; distanceM: number };
