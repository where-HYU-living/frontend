import type { AiEstimate } from '../../api/types';

/** 매물별 AI 적정가 (원/월). 백엔드 fixtures/ai-rent.json 과 같은 값을 넣는다. 없는 매물은 AI 적정가를 안 보여 준다 */
export const AI_RENT: Record<number, AiEstimate> = {
  1: { fairRent: 440000, low: 390000, high: 490000 },
  2: { fairRent: 730000, low: 670000, high: 790000 },
  3: { fairRent: 610000, low: 560000, high: 660000 },
  4: { fairRent: 900000, low: 820000, high: 980000 },
  5: { fairRent: 820000, low: 750000, high: 890000 },
  6: { fairRent: 650000, low: 600000, high: 700000 },
  7: { fairRent: 480000, low: 440000, high: 530000 },
  8: { fairRent: 960000, low: 870000, high: 1040000 },
  9: { fairRent: 430000, low: 380000, high: 480000 },
  10: { fairRent: 810000, low: 750000, high: 880000 },
  11: { fairRent: 940000, low: 860000, high: 1020000 },
  12: { fairRent: 1050000, low: 960000, high: 1140000 },
  13: { fairRent: 630000, low: 580000, high: 680000 },
  14: { fairRent: 770000, low: 710000, high: 830000 },
  15: { fairRent: 1120000, low: 1020000, high: 1210000 },
  16: { fairRent: 650000, low: 600000, high: 700000 },
  17: { fairRent: 770000, low: 710000, high: 830000 },
  18: { fairRent: 780000, low: 720000, high: 840000 },
  19: { fairRent: 750000, low: 690000, high: 800000 },
  20: { fairRent: 950000, low: 870000, high: 1030000 },
};
