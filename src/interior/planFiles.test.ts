import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, test } from 'vitest';
import type { FloorPlan } from '../api/types';
import { checkPlan } from './planCheck';

/**
 * 백엔드 fixtures/floorplans/*.json 전체를 3D 로 올려도 되는지 검수한다 (planCheck 의 errors 가 없어야 통과).
 * 백엔드 폴더가 없으면(프론트만 받은 경우) 건너뛴다. 경고(warnings)는 통과시키되 3D 에서 눈으로 볼 것.
 */
const DIR = path.resolve(process.cwd(), '../backend/src/main/resources/fixtures/floorplans');
const files = fs.existsSync(DIR) ? fs.readdirSync(DIR).filter((f) => /^\d+\.json$/.test(f)).sort((a, b) => parseInt(a) - parseInt(b)) : [];

describe.skipIf(files.length === 0)('백엔드 평면도 JSON 검수', () => {
  test.each(files)('%s', (f) => {
    const plan = JSON.parse(fs.readFileSync(path.join(DIR, f), 'utf8')) as FloorPlan;
    expect(plan.id, '파일명과 id 가 같아야 해요').toBe(parseInt(f));
    const { errors } = checkPlan(plan);
    expect(errors, errors.join('\n')).toEqual([]);
  });
});
