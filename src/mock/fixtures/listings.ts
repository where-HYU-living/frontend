import type { ListingDetail, RoomType } from '../../api/types';
import { convertedRent, gradeOf, excessRateOf } from '../pricing';
import { at, placeholderImage } from '../util';
import { FALLBACK_PER_M2, marketFor } from './market';

type Seed = [id: number, title: string, dong: string, x: number, z: number, area: number, floor: number, type: RoomType, depositMan: number, mgmtMan: number, excess: number, built: number];

// excess 는 "적정가 대비 목표 초과율". 등급 경계에서 0.02 이상 떨어뜨려 반올림에 안 흔들리게 했다.
const SEEDS: Seed[] = [
  [1, '행당동 분리형 원룸', '행당동', -210, 300, 18.2, 3, 'SEPARATED', 1000, 8, 0.3, 2019],
  [2, '행당동 오픈형 원룸', '행당동', -120, 380, 16.5, 2, 'OPEN', 500, 5, -0.04, 2012],
  [3, '행당동 투룸', '행당동', -300, 430, 33.0, 4, 'TWO_ROOM', 2000, 10, 0.05, 2016],
  [4, '사근동 신축 원룸', '사근동', 90, -250, 19.8, 5, 'OPEN', 1000, 7, 0.17, 2024],
  [5, '사근동 1.5룸', '사근동', 180, -180, 22.4, 2, 'ONE_HALF', 1000, 8, 0.42, 2018],
  [6, '사근동 복층 원룸', '사근동', 60, -330, 24.0, 6, 'DUPLEX', 1500, 10, 0.62, 2021],
  [7, '마장동 오픈형 원룸', '마장동', 420, -90, 15.8, 1, 'OPEN', 500, 5, -0.12, 2008],
  [8, '마장동 분리형 원룸', '마장동', 510, -20, 20.1, 3, 'SEPARATED', 1000, 7, 0.07, 2017],
  [9, '마장동 투룸', '마장동', 590, 60, 36.0, 5, 'TWO_ROOM', 3000, 12, 0.19, 2020],
  [10, '성수동 오피스텔형 원룸', '성수동', -80, -560, 21.5, 8, 'OPEN', 1000, 10, 0.08, 2022],
  [11, '성수동 분리형 원룸', '성수동', 20, -640, 19.0, 4, 'SEPARATED', 1000, 8, 0.27, 2015],
  [12, '성수동 신축 복층', '성수동', -170, -700, 26.0, 7, 'DUPLEX', 2000, 12, 0.55, 2025],
  [13, '도선동 오픈형 원룸', '도선동', -420, 120, 14.9, 2, 'OPEN', 300, 5, 0.02, 2010],
  [14, '도선동 1.5룸', '도선동', -500, 200, 23.0, 3, 'ONE_HALF', 1000, 7, 0.22, 2014],
  [15, '도선동 분리형 원룸', '도선동', -560, 60, 18.8, 6, 'SEPARATED', 1000, 6, 0.46, 2019],
  [16, '행당동 저층 원룸', '행당동', -60, 520, 13.2, 1, 'OPEN', 300, 3, -0.18, 2005],
  [17, '행당동 신축 오픈형', '행당동', -380, 560, 17.5, 7, 'OPEN', 1000, 9, 0.12, 2025],
  [18, '사근동 오래된 투룸', '사근동', 280, -320, 30.0, 3, 'TWO_ROOM', 2000, 8, 0.58, 2003],
  [19, '송정동 오픈형 원룸', '송정동', 700, -300, 17.0, 3, 'OPEN', 1000, 7, 0.2, 2011],
  [20, '송정동 분리형 원룸', '송정동', 760, -380, 19.5, 4, 'SEPARATED', 500, 6, 0.1, 2013],
];

const OPTIONS = ['에어컨', '세탁기', '냉장고', '책상', '옷장', '인덕션', '전자레인지', '신발장', '도어락'];
const STREET: Record<string, string> = { 행당동: '행당로', 사근동: '사근로', 마장동: '마장로', 성수동: '성수이로', 도선동: '도선로', 송정동: '송정로' };

function makeListing(s: Seed): ListingDetail {
  const [id, title, dong, x, z, areaM2, floor, roomType, depositMan, mgmtMan, excess, builtYear] = s;
  const deposit = depositMan * 10000;
  const mgmtFee = mgmtMan * 10000;
  const market = marketFor(dong, areaM2);
  const fair = market ? market.fairRent : Math.round((FALLBACK_PER_M2 * areaM2) / 1000) * 1000;
  const rent = Math.max(100000, Math.round((fair * (1 + excess) - mgmtFee - deposit / 200) / 10000) * 10000);
  const conv = convertedRent(rent, mgmtFee, deposit);
  const grade = market ? gradeOf(excessRateOf(conv, fair)) : 'PENDING';
  const plan = id === 1 || id === 4 ? 1 : id === 2 || id === 11 ? 2 : null;
  return {
    id, title, address: `서울 성동구 ${dong} ${STREET[dong]} ${10 + id * 3}-${id % 7 + 1}`, dong, ...at(x, z),
    deposit, rent, mgmtFee, areaM2, floor, roomType, convertedRent: conv, grade, walkMin: null,
    thumbnailUrl: placeholderImage(title, '#6f8fb5'), favorited: false,
    options: OPTIONS.filter((_, i) => (id + i) % 3 !== 0 || i < 3),
    photos: [placeholderImage(`${title} 1`, '#6f8fb5'), placeholderImage(`${title} 2`, '#8fa58a')],
    floorplanId: plan, builtYear,
    description: `${dong} ${floor}층 ${areaM2}㎡. 학교까지 가깝고 조용한 편이에요. (개발용 목 데이터)`,
  };
}

export const LISTINGS: ListingDetail[] = SEEDS.map(makeListing);
export const LISTING_SEED_MAP = new Map(SEEDS.map((s) => [s[0], s]));
