import * as THREE from 'three';
import { loadTex } from './util.js';

// 바닥 마스크(스플랫맵): R=보도(벽돌 포장), G=차도(아스팔트), B=잔디
export function makeSplat(world, extraPlazas = [], plazaPolys = []) {
  const { minX, maxX, minZ, maxZ } = world.bounds;
  const W = 2048, H = Math.round((2048 * (maxZ - minZ)) / (maxX - minX));
  const sx = W / (maxX - minX), sz = H / (maxZ - minZ);
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const g = c.getContext('2d');
  g.fillStyle = '#000'; g.fillRect(0, 0, W, H);
  g.globalCompositeOperation = 'lighter';
  const P = ([x, z]) => [(x - minX) * sx, (z - minZ) * sz];

  for (const a of world.areas) {
    if (a.cls !== 'grass') continue;
    g.fillStyle = a.sub === 'pitch' ? 'rgb(0,0,200)' : 'rgb(0,0,255)';
    g.beginPath();
    a.pts.forEach((p, i) => (i ? g.lineTo(...P(p)) : g.moveTo(...P(p))));
    g.closePath(); g.fill();
  }
  g.lineCap = 'round'; g.lineJoin = 'round';
  const draw = (r, color) => {
    g.strokeStyle = color; g.lineWidth = r.w * sx;
    g.beginPath();
    r.pts.forEach((p, i) => (i ? g.lineTo(...P(p)) : g.moveTo(...P(p))));
    g.stroke();
  };
  for (const r of world.roads) if (r.kind !== 'road') draw(r, 'rgb(255,0,0)');
  for (const r of world.roads) if (r.kind === 'road') draw(r, 'rgb(0,255,0)');
  for (const pl of extraPlazas) {
    g.fillStyle = pl.kind === 'grass' ? 'rgb(0,0,255)' : 'rgb(255,0,0)';
    g.beginPath(); g.arc(...P(pl.p), pl.r * sx, 0, Math.PI * 2); g.fill();
  }
  // 경계 부드럽게
  const c2 = document.createElement('canvas');
  c2.width = W; c2.height = H;
  const g2 = c2.getContext('2d');
  g2.filter = 'blur(1.2px)';
  g2.drawImage(c, 0, 0);
  // 광장(화강석 블록 포장) 마스크 — 잔디 원(사자상 화단)은 비움
  const cp = document.createElement('canvas');
  cp.width = W; cp.height = H;
  const gp = cp.getContext('2d');
  gp.fillStyle = '#fff';
  for (const poly of plazaPolys) { gp.beginPath(); poly.forEach((p, i) => (i ? gp.lineTo(...P(p)) : gp.moveTo(...P(p)))); gp.closePath(); gp.fill(); }
  gp.globalCompositeOperation = 'destination-out';
  for (const pl of extraPlazas) if (pl.kind === 'grass') { gp.beginPath(); gp.arc(...P(pl.p), pl.r * sx, 0, Math.PI * 2); gp.fill(); }
  for (const a of world.areas) if (a.cls === 'grass') { gp.beginPath(); a.pts.forEach((p, i) => (i ? gp.lineTo(...P(p)) : gp.moveTo(...P(p)))); gp.closePath(); gp.fill(); }
  return { canvas: c2, plaza: cp, W, H };
}

export async function makeTerrain(world, splatCanvas, plazaCanvas = null) {
  const t = world.terrain;
  const { minX, maxX, minZ, maxZ } = world.bounds;
  const sizeX = (t.w - 1) * t.step, sizeZ = (t.h - 1) * t.step;
  const geo = new THREE.PlaneGeometry(sizeX, sizeZ, t.w - 1, t.h - 1);
  geo.rotateX(-Math.PI / 2);
  geo.translate(t.minX + sizeX / 2, 0, t.minZ + sizeZ / 2);
  const pos = geo.attributes.position;
  for (let k = 0; k < pos.count; k++) pos.setY(k, t.data[k]);
  geo.computeVertexNormals();

  const [plazaPave, leaves, leavesN, grass, pave, paveN, road] = await Promise.all([
    loadTex('/tex/plazapave_diff.jpg'),
    loadTex('/tex/leaves_diff.jpg'),
    loadTex('/tex/leaves_nor.jpg', { srgb: false }),
    loadTex('/tex/grass_diff.jpg'),
    loadTex('/tex/brickpave_diff.jpg'),
    loadTex('/tex/brickpave_nor.jpg', { srgb: false }),
    loadTex('/tex/asphalt_diff.jpg'),
  ]);
  const splat = new THREE.CanvasTexture(splatCanvas);
  splat.colorSpace = THREE.NoColorSpace;
  splat.wrapS = splat.wrapT = THREE.ClampToEdgeWrapping;
  const plaza = new THREE.CanvasTexture(plazaCanvas || document.createElement('canvas'));
  plaza.colorSpace = THREE.NoColorSpace;

  const mat = new THREE.MeshStandardMaterial({ map: leaves, normalMap: leavesN, roughness: 0.95, metalness: 0 });
  // uv를 미터 단위 타일로 쓰기 위한 배율 (텍스처 1장 = 약 3m)
  const tile = new THREE.Vector2(sizeX / 3, sizeZ / 3);
  mat.userData.textures = [splat, plaza, plazaPave, grass, pave, road]; // disposeScene 이 해제할 수 있게 (uniform 으로만 쓰는 텍스처)
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, {
      uSplat: { value: splat }, uPlaza: { value: plaza }, uPlazaTex: { value: plazaPave }, uGrass: { value: grass }, uPave: { value: pave }, uRoad: { value: road }, uTile: { value: tile },
    });
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec2 vSUv;')
      .replace('#include <uv_vertex>', '#include <uv_vertex>\nvSUv = uv;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec2 vSUv;\nuniform sampler2D uSplat, uGrass, uPave, uRoad, uPlaza, uPlazaTex;\nuniform vec2 uTile;')
      .replace('#include <map_fragment>', `
        vec2 tuv = vSUv * uTile;
        vec4 sp = texture2D(uSplat, vSUv);
        vec3 cLeaf = texture2D(map, tuv).rgb;
        vec3 cLeaf2 = texture2D(map, tuv * 0.37 + 0.13).rgb;
        cLeaf = mix(cLeaf, cLeaf2, 0.35) * vec3(0.78, 0.8, 0.62);
        vec3 cGrass = texture2D(uGrass, tuv * 0.8).rgb * vec3(0.72, 1.0, 0.5);
        cLeaf = mix(cGrass * 0.82, cLeaf, 0.35); // 봄: 숲 바닥도 풀 위주
        cGrass = mix(cGrass, cLeaf, 0.1);
        vec3 cPave = texture2D(uPave, tuv * 1.2).rgb * vec3(1.02, 0.96, 0.92);
        vec3 cRoad = texture2D(uRoad, tuv * 0.6).rgb * 0.9;
        vec3 col = cLeaf;
        col = mix(col, cGrass, smoothstep(0.3, 0.7, sp.b));
        col = mix(col, cPave, smoothstep(0.3, 0.7, sp.r));
        // 광장: 회색 화강석 블록 (블록 1장 ≈ 2m)
        float pm = texture2D(uPlaza, vSUv).r;
        vec3 cPlaza = texture2D(uPlazaTex, tuv * 1.5).rgb;
        cPlaza = mix(vec3(dot(cPlaza, vec3(0.333))), cPlaza, 0.25) * 1.18;
        col = mix(col, cPlaza, smoothstep(0.3, 0.7, pm));
        col = mix(col, cRoad, smoothstep(0.3, 0.7, sp.g));
        diffuseColor.rgb *= col;
      `)
      .replace('#include <normal_fragment_maps>', `
        #ifdef USE_NORMALMAP_TANGENTSPACE
          vec3 mapN = texture2D( normalMap, vSUv * uTile ).xyz * 2.0 - 1.0;
          mapN.xy *= normalScale;
          normal = normalize( tbn * mapN );
        #endif
      `);
  };
  const mesh = new THREE.Mesh(geo, mat);
  mesh.receiveShadow = true;
  mesh.name = 'terrain';

  // 바깥 바닥 (경계 너머)
  const outer = new THREE.Mesh(
    new THREE.RingGeometry(Math.min(sizeX, sizeZ) * 0.3, 4000, 64, 1),
    new THREE.MeshStandardMaterial({ color: 0x6d7a55, roughness: 1 })
  );
  outer.rotation.x = -Math.PI / 2;
  outer.position.set((minX + maxX) / 2, -0.8, (minZ + maxZ) / 2);
  outer.receiveShadow = true;

  return { mesh, outer };
}
