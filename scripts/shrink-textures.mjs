// public/tex 축소: _diff 는 1024, _nor/_rough 는 512 이하로. 여러 번 돌려도 같은 결과.
import sharp from 'sharp';
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
const DIR = 'public/tex';
let before = 0, after = 0;
for (const f of readdirSync(DIR).filter((f) => f.endsWith('.jpg'))) {
  const p = join(DIR, f), buf = readFileSync(p);
  const cap = /_diff/.test(f) ? 1024 : 512;
  const meta = await sharp(buf).metadata();
  before += buf.length;
  const small = Math.max(meta.width, meta.height) <= cap;
  const out = small && buf.length < 400_000 ? buf
    : await sharp(buf).resize({ width: cap, height: cap, fit: 'inside', withoutEnlargement: true }).jpeg({ quality: 80, mozjpeg: true }).toBuffer();
  if (out.length < buf.length) writeFileSync(p, out);
  after += Math.min(out.length, buf.length);
}
console.log(`tex ${(before / 1e6).toFixed(1)}MB -> ${(after / 1e6).toFixed(1)}MB`);
