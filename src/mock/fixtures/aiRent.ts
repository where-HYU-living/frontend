import type { AiEstimate } from '../../api/types';

/** 매물별 AI 적정가 (원/월). 백엔드 fixtures/ai-rent.json 과 같은 값을 넣는다. 없는 매물은 AI 적정가를 안 보여 준다 */
export const AI_RENT: Record<number, AiEstimate> = {};
