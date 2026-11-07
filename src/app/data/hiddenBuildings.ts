import campusPlaces from './campusPlaces.json';
import type { Place } from '../campusSearch';

/**
 * 서비스에서 숨기는 건물 (건물 번호 `no` 기준). 캠퍼스 투어 목록·통합 검색·2D 지도 핀·내 건물 선택에 나오지 않는다.
 * 3D 월드의 건물 자체와 기숙사 탭의 호실 정보는 그대로다. 숨길/되살릴 건물은 이 목록만 고치면 된다.
 */
export const HIDDEN_BUILDING_NOS: readonly string[] = ['807', '809', '810', 'N10'];

const hiddenNo = new Set(HIDDEN_BUILDING_NOS);
const ALL = campusPlaces as Place[];

/** 숨긴 건물의 id (건물 번호가 숫자가 아닌 N10 은 1004 처럼 따로 부여된 id) */
export const HIDDEN_BUILDING_IDS: ReadonlySet<number> = new Set(ALL.filter((p) => hiddenNo.has(p.no)).map((p) => p.id));

export const isHiddenBuilding = (id: number) => HIDDEN_BUILDING_IDS.has(id);

/** 사용자에게 보여 줘도 되는 건물 */
export const visiblePlaces: Place[] = ALL.filter((p) => !hiddenNo.has(p.no));
