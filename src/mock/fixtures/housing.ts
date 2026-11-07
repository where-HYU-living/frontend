import type { Announcement, EventType, HousingUnitType } from '../../api/types';
import { convertedRent } from '../pricing';
import { at, dayOffset, placeholderImage } from '../util';

export type HousingFixture = {
  id: number; name: string; address: string; lat: number; lng: number; contact: string; floorLayoutImageUrl: string;
  units: Omit<HousingUnitType, 'convertedRent'>[];
};

export const HOUSING: HousingFixture[] = [
  {
    id: 1, name: '왕십리역 청아진', address: '서울 성동구 행당동 한림말길 21', ...at(-380, 520),
    contact: '02-1234-5678', floorLayoutImageUrl: placeholderImage('청아진 층별 배치도', '#5b7a99'),
    units: [
      { id: 101, name: '청아진 18타입', exclusiveAreaM2: 18.22, deposit: 20000000, rent: 420000, mgmtFee: 50000, floorplanId: 1 },
      { id: 102, name: '청아진 18A타입', exclusiveAreaM2: 18.22, deposit: 22000000, rent: 440000, mgmtFee: 50000, floorplanId: 2 },
      { id: 103, name: '청아진 24타입', exclusiveAreaM2: 24.1, deposit: 30000000, rent: 520000, mgmtFee: 60000, floorplanId: null },
    ],
  },
  {
    id: 2, name: '라봄성동', address: '서울 성동구 마장동 마장로 112', ...at(420, 640),
    contact: '02-2345-6789', floorLayoutImageUrl: placeholderImage('라봄성동 층별 배치도', '#7a6a99'),
    units: [
      { id: 201, name: '라봄 16타입', exclusiveAreaM2: 16.4, deposit: 15000000, rent: 380000, mgmtFee: 45000, floorplanId: null },
      { id: 202, name: '라봄 21타입', exclusiveAreaM2: 21.3, deposit: 25000000, rent: 480000, mgmtFee: 55000, floorplanId: null },
    ],
  },
];

export const unitWithConverted = (u: HousingFixture['units'][number]): HousingUnitType => ({ ...u, convertedRent: convertedRent(u.rent, u.mgmtFee, u.deposit) });

const ev = (type: EventType, d: number) => ({ type, date: dayOffset(d) });

/** 일정은 접속 날짜 기준 상대값이라, 언제 열어도 D-day 가 보인다. */
export function makeAnnouncements(): Announcement[] {
  return [
    {
      id: 1, housingId: 1, title: '왕십리역 청아진 청년안심주택 입주자 모집', status: 'OPEN',
      events: [ev('NOTICE', -10), ev('APPLY_START', -3), ev('APPLY_END', 5), ev('DOCS_DUE', 12), ev('RESULT', 25), ev('CONTRACT', 40), ev('MOVE_IN', 70)],
    },
    {
      id: 2, housingId: 1, title: '왕십리역 청아진 지난 모집 (발표 완료)', status: 'ANNOUNCED',
      events: [ev('NOTICE', -150), ev('APPLY_START', -140), ev('APPLY_END', -133), ev('RESULT', -115), ev('MOVE_IN', -60)],
    },
    {
      id: 3, housingId: 2, title: '라봄성동 청년안심주택 입주자 모집 예정', status: 'UPCOMING',
      events: [ev('NOTICE', 9), ev('APPLY_START', 16), ev('APPLY_END', 23), ev('RESULT', 45), ev('CONTRACT', 60)],
    },
    {
      id: 4, housingId: 2, title: '라봄성동 지난 모집 (마감)', status: 'CLOSED',
      events: [ev('NOTICE', -120), ev('APPLY_START', -110), ev('APPLY_END', -103), ev('RESULT', -90)],
    },
  ];
}
