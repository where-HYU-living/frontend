// 사자상 조각(SDF → 마칭큐브)을 미리 구워 public/models/lion.bin 으로 저장한다.
// 브라우저에서 매번 1~2초 걸리던 계산을 없앰. 조각 모양(src/landmarks/lion.js 의 lionSDF)을 고치면 다시 실행:
//   npm run bake
import fs from 'node:fs';
import { mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { polygonize } from '../src/landmarks/sdf.js';
import { lionSDF, LION_BOX } from '../src/landmarks/lion.js';

const t0 = Date.now();
let geo = polygonize(lionSDF(), { ...LION_BOX, res: 112 });
geo.deleteAttribute('uv');
geo = mergeVertices(geo, 1e-5);
geo.computeVertexNormals();
const pos = geo.attributes.position.array, nor = geo.attributes.normal.array, idx = geo.index.array;
const n = pos.length / 3;
if (n > 65535) throw new Error('정점이 65535개를 넘음: ' + n);
const { center, half } = LION_BOX;
const qp = new Uint16Array(n * 3), qn = new Int8Array(n * 3 + ((4 - ((n * 3) % 4)) % 4));
for (let i = 0; i < n * 3; i++) {
  qp[i] = Math.round(((pos[i] - center[i % 3]) / half * 0.5 + 0.5) * 65535);
  qn[i] = Math.round(nor[i] * 127);
}
const head = new Uint32Array([n, idx.length]);
const qi = Uint16Array.from(idx);
fs.writeFileSync(new URL('../public/models/lion.bin', import.meta.url), Buffer.concat([head, qp, qn, qi].map((a) => Buffer.from(a.buffer, a.byteOffset, a.byteLength))));
console.log(`lion: ${n} verts, ${idx.length / 3} tris, ${Date.now() - t0}ms`);
