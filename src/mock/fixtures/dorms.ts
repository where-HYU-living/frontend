import type { Dorm } from '../../api/types';
import { at } from '../util';

export type DormFixture = Omit<Dorm, 'walkMin'>;

export const DORMS: DormFixture[] = [
  {
    id: 1, name: '제1학생생활관', ...at(256, -294),
    roomTypes: [
      { id: 11, name: '2인실', capacity: 2, semesterFee: 1150000, semesterMonths: 4, mealIncluded: false, monthlyCost: Math.round(1150000 / 4), floorplanId: 3 },
      { id: 12, name: '4인실', capacity: 4, semesterFee: 820000, semesterMonths: 4, mealIncluded: false, monthlyCost: Math.round(820000 / 4), floorplanId: null },
    ],
  },
  {
    id: 2, name: '제2학생생활관·한양테크노숙사', ...at(483, -395),
    roomTypes: [
      { id: 21, name: '2인실(식사 포함)', capacity: 2, semesterFee: 1980000, semesterMonths: 4, mealIncluded: true, monthlyCost: Math.round(1980000 / 4), floorplanId: null },
    ],
  },
];
