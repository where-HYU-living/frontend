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
};

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
export type Housing = { id: number; name: string; address: string; lat: number; lng: number; recruiting: boolean; nextEvent: { type: EventType; date: string } | null; subscribed: boolean };
export type HousingUnitType = { id: number; name: string; exclusiveAreaM2: number; deposit: number; rent: number; mgmtFee: number | null; convertedRent: number; floorplanId: number | null };
export type HousingDetail = Housing & { unitTypes: HousingUnitType[]; floorLayoutImageUrl: string | null; contact: string | null; walkMin: number | null };
export type Announcement = { id: number; housingId: number; title: string; status: AnnouncementStatus; events: { type: EventType; date: string }[] };

export type FavoriteItem = { type: FavoriteType; targetId: number; name: string; lat: number; lng: number; convertedRent: number | null; grade: Grade | null; walkMin: number | null; createdAt: string };

export type FloorPlan = {
  id: number; name: string; areaM2: number; ceilingHeight: number;
  walls: { from: [number, number]; to: [number, number]; thickness: number }[];
  openings: { type: 'door' | 'window'; wall: number; offset: number; width: number; height: number; sill: number }[];
  rooms: { name: string; polygon: [number, number][] }[];
  entrance: [number, number];
  glbUrl: string | null;
};

export type AppNotification = { id: number; type: 'HOUSING_DDAY' | 'CONTRACT_EXPIRY'; title: string; body: string; targetType: string | null; targetId: number | null; createdAt: string; read: boolean };

export type ReviewScores = { noise: number; light: number; bugs: number; landlord: number; depositReturn: number };
export type ReviewTargetType = 'LISTING' | 'HOUSING' | 'DORM';
export type Review = { id: number; rating: number; scores: ReviewScores; text: string; pin: [number, number, number] | null; authorNickname: string; createdAt: string };
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
export type TransferBody = { address: string; dong: string; lat: number; lng: number; deposit: number; rent: number; mgmtFee: number | null; areaM2: number; roomType: RoomType; floor: number | null; remainingMonths: number; availableFrom: string | null; description: string; photoUrls: string[] };
export type AddressResult = { address: string; roadAddress: string | null; dong: string; lat: number; lng: number };

export type NearbyCategory = 'CONVENIENCE' | 'LAUNDRY' | 'BUS_STOP' | 'SUBWAY';
export type Nearby = { category: NearbyCategory; name: string; lat: number; lng: number; distanceM: number };
