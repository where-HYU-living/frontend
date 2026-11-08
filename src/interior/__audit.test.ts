import fs from 'node:fs';
import path from 'node:path';
import { test } from 'vitest';
import { checkPlan } from './planCheck';
const DIR = path.resolve(process.cwd(), '../backend/src/main/resources/fixtures/floorplans');
test('audit', () => {
  for (const f of ['9', '12', '104', '105']) {
    const p = JSON.parse(fs.readFileSync(path.join(DIR, f + '.json'), 'utf8'));
    const r = checkPlan(p); console.log(`R #${f} errors=${r.errors.length} warn: ${r.warnings.join(' / ') || '-'}`);
  }
});
