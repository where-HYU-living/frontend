// Poly Haven(CC0) 텍스처·하늘 받기 → public/tex, public/env
// 사용: node scripts/fetch-assets.mjs   (이미 있는 파일은 건너뜀)
import fs from 'node:fs';
import path from 'node:path';

const PUB = path.resolve(import.meta.dirname, '..', 'public');
// [Poly Haven id, 저장 이름]
const TEX = [
  ['japanese_stone_wall', 'stoneblock'], // 101 역사관 거친 화강석 블록, 석축
  ['square_concrete_pavers', 'plazapave'], // 사자상 광장 회색 블록 포장
  ['green_metal_rust', 'greenmetal'], // 101 초록 금속 지붕, 102 돔
  ['white_sandstone_blocks_02', 'whitestone'], // 102 위층 흰 석재
];
const HDRI = ['kloofendal_48d_partly_cloudy_puresky', 'sky']; // 봄 하늘

const get = async (u) => { const r = await fetch(u); if (!r.ok) throw new Error(`${r.status} ${u}`); return Buffer.from(await r.arrayBuffer()); };
for (const [id, name] of TEX) {
  const files = await (await fetch(`https://api.polyhaven.com/files/${id}`)).json();
  const pick = { diff: files.Diffuse || files.diffuse, nor: files.nor_gl, rough: files.Rough || files.rough };
  for (const [k, v] of Object.entries(pick)) {
    const out = path.join(PUB, 'tex', `${name}_${k}.jpg`);
    if (fs.existsSync(out) || !v) continue;
    const url = v['1k']?.jpg?.url || v['1k']?.png?.url;
    fs.writeFileSync(out, await get(url));
    console.log('tex', out);
  }
}
{
  const [id, name] = HDRI;
  const files = await (await fetch(`https://api.polyhaven.com/files/${id}`)).json();
  const hdr = path.join(PUB, 'env', `${name}_1k.hdr`), bg = path.join(PUB, 'env', `${name}_bg.jpg`);
  if (!fs.existsSync(hdr)) fs.writeFileSync(hdr, await get(files.hdri['1k'].hdr.url));
  if (!fs.existsSync(bg)) fs.writeFileSync(bg, await get(files.tonemapped.url));
  console.log('hdri', hdr, bg);
}
