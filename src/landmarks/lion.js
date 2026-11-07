// 한양대 서울캠퍼스 사자상 (본관 앞)
// 참고 사진(웹 검색, 2026-11-07): 한양대 학보 newshyu.com, hyu.wiki, Flickr '한양대사자상_2021'
//  - 밝은 회색 화강암을 거칠게 깎은 조각 (청동 아님)
//  - 앞다리를 굽히고 가슴을 낮춘 '사냥 자세', 엉덩이가 더 높음
//  - 고개를 들어 정면(바깥쪽)으로 돌리고 입을 벌림, 덥수룩한 갈기
//  - 울퉁불퉁한 바위 받침 → 얇은 판석 → 2×2 돌블록 좌대 → 아래 넓은 기단
//  - 좌대 정면에 검은 명판, 잔디 위 흰 원형 선, 뒤로 본관 계단
import * as THREE from 'three';
import { loadTex } from '../util.js';
import { ellipsoid, capsule, box, sphere, smin, smax, fbm, noise3, polygonize, stoneMaterial } from './sdf.js';

// ---- 사자 + 바위 받침 SDF (단위 m, 바위 바닥 y=0, 머리 방향 +x, 고개는 +z 쪽으로 돌림)
function lionSDF() {
  const y0 = 0.32; // 바위 윗면
  const H = [0.93, y0 + 1.17, 0.22];
  let f = [0.5, 0.06, 0.86];
  const fl = Math.hypot(...f); f = f.map((v) => v / fl);
  const s = [-f[2], 0, f[0]]; // 얼굴 옆 방향
  const at = (c, t, up = 0, side = 0) => [c[0] + f[0] * t + s[0] * side, c[1] + f[1] * t + up, c[2] + f[2] * t + s[2] * side];

  return (p) => {
    // 빠른 바깥 판정
    if (Math.abs(p[0]) > 1.42 || p[1] < -0.1 || p[1] > 1.72 || Math.abs(p[2]) > 0.72) return 0.2;

    // 바위 받침
    let rock = box(p, [0, 0.14, 0], [1.28, 0.17, 0.56], 0.1);
    if (rock < 0.15) rock += 0.055 * fbm(p[0] * 2.5, p[1] * 2.5, p[2] * 2.5) + 0.012 * noise3(p[0] * 14, p[1] * 14, p[2] * 14);

    // 몸통
    let body = ellipsoid(p, [0.44, y0 + 0.6, 0], [0.42, 0.39, 0.33]);
    body = smin(body, ellipsoid(p, [-0.16, y0 + 0.66, 0], [0.56, 0.29, 0.28]), 0.25);
    body = smin(body, ellipsoid(p, [-0.72, y0 + 0.78, 0], [0.36, 0.35, 0.3]), 0.25);
    body = smin(body, capsule(p, [0.52, y0 + 0.8, 0.03], [0.84, y0 + 1.06, 0.13], 0.26, 0.21), 0.15);

    // 다리 (앞: 굽혀서 앞으로 내딛음 / 뒤: 굵은 허벅지)
    const leg = (a, b, c, ra, rb, rc) => smin(capsule(p, a, b, ra, rb), capsule(p, b, c, rb, rc), 0.06);
    let legs = leg([0.5, y0 + 0.55, 0.21], [0.63, y0 + 0.26, 0.24], [0.96, y0 + 0.07, 0.27], 0.14, 0.1, 0.085);
    legs = smin(legs, leg([0.44, y0 + 0.55, -0.2], [0.5, y0 + 0.27, -0.22], [0.74, y0 + 0.07, -0.23], 0.14, 0.1, 0.085), 0.05);
    legs = smin(legs, ellipsoid(p, [1.0, y0 + 0.06, 0.27], [0.14, 0.07, 0.11]), 0.05);
    legs = smin(legs, ellipsoid(p, [0.78, y0 + 0.06, -0.23], [0.14, 0.07, 0.11]), 0.05);
    for (const [z, dx] of [[0.2, 0], [-0.2, -0.1]]) {
      legs = smin(legs, capsule(p, [-0.72 + dx, y0 + 0.68, z], [-0.55 + dx, y0 + 0.36, z * 1.12], 0.2, 0.12), 0.08);
      legs = smin(legs, leg([-0.55 + dx, y0 + 0.36, z * 1.12], [-0.88 + dx, y0 + 0.2, z * 1.1], [-0.76 + dx, y0 + 0.06, z * 1.1], 0.11, 0.075, 0.075), 0.05);
      legs = smin(legs, ellipsoid(p, [-0.72 + dx, y0 + 0.05, z * 1.1], [0.13, 0.065, 0.1]), 0.05);
    }
    body = smin(body, legs, 0.1);

    // 꼬리
    let tail = capsule(p, [-1.02, y0 + 0.84, 0], [-1.24, y0 + 0.55, 0.05], 0.065, 0.05);
    tail = smin(tail, capsule(p, [-1.24, y0 + 0.55, 0.05], [-1.18, y0 + 0.2, 0.16], 0.05, 0.045), 0.03);
    tail = smin(tail, capsule(p, [-1.18, y0 + 0.2, 0.16], [-1.04, y0 + 0.08, 0.27], 0.045, 0.04), 0.03);
    tail = smin(tail, sphere(p, [-1.03, y0 + 0.08, 0.28], 0.075), 0.03);
    body = smin(body, tail, 0.05);

    // 머리
    let head = ellipsoid(p, H, [0.24, 0.25, 0.23]);
    head = smin(head, ellipsoid(p, at(H, 0.22, -0.07), [0.15, 0.12, 0.15]), 0.08);
    head = smin(head, sphere(p, at(H, 0.34, -0.03), 0.07), 0.05);
    head = smin(head, ellipsoid(p, at(H, 0.21, -0.21), [0.12, 0.06, 0.12]), 0.05); // 아래턱
    head = smax(head, -ellipsoid(p, at(H, 0.3, -0.135), [0.1, 0.045, 0.1]), 0.02); // 벌린 입
    for (const sd of [-1, 1]) {
      head = smax(head, -sphere(p, at(H, 0.19, 0.07, 0.095 * sd), 0.035), 0.015); // 눈
      head = smin(head, sphere(p, at(H, -0.06, 0.21, 0.15 * sd), 0.06), 0.04); // 귀
    }
    // 갈기: 얼굴 뒤쪽으로만, 덥수룩하게
    let mane = ellipsoid(p, at(H, -0.13, -0.08), [0.37, 0.47, 0.42]);
    if (mane < 0.2) {
      const dx = p[0] - H[0], dy = p[1] - H[1], dz = p[2] - H[2];
      mane -= 0.06 * (fbm(p[0] * 7, p[1] * 7, p[2] * 7, 3) + 0.25) + 0.02 * noise3(dx * 3 + dy * 18, dy * 3, dz * 3 + dy * 18);
      mane = smax(mane, dx * f[0] + dy * f[1] + dz * f[2] - 0.04, 0.06);
    }
    head = smin(head, mane, 0.06);
    body = smin(body, head, 0.12);

    // 바위와 발이 이어지게
    let d = smin(body, rock, 0.05);
    // 정으로 쫀 듯한 표면
    if (Math.abs(d) < 0.06) d += 0.006 * noise3(p[0] * 26, p[1] * 26, p[2] * 26);
    return d;
  };
}

// 명판 (실제 문구는 확인 불가 → 새긴 줄만 표현)
function plaqueTexture() {
  const c = document.createElement('canvas');
  c.width = 256; c.height = 140;
  const g = c.getContext('2d');
  const gr = g.createLinearGradient(0, 0, 256, 140);
  gr.addColorStop(0, '#2a2a2c'); gr.addColorStop(1, '#151517');
  g.fillStyle = gr; g.fillRect(0, 0, 256, 140);
  g.strokeStyle = 'rgba(210,205,195,.55)'; g.lineWidth = 6; g.lineCap = 'round';
  for (const [y, w] of [[50, 150], [92, 120]]) { g.beginPath(); g.moveTo(128 - w / 2, y); g.lineTo(128 + w / 2, y); g.stroke(); }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export async function makeLion(p, heightAt, outward = [0, 1]) {
  const granite = await loadTex('/tex/granite_diff.jpg');
  const lionStone = stoneMaterial(granite, { color: 0xd8d3ca, roughness: 0.93, scale: 0.9, contrast: 0.55 });
  const blockStone = stoneMaterial(granite, { color: 0xc9c3b8, roughness: 0.85, scale: 0.45, contrast: 0.4 });

  const g = new THREE.Group();
  g.name = 'lion-statue';

  // 기단 → 2×2 블록 좌대 → 판석
  const step = new THREE.Mesh(new THREE.BoxGeometry(3.0, 0.22, 2.3), blockStone);
  step.position.y = 0.11;
  g.add(step);
  const BW = 1.2, BH = 1.1, BD = 1.7, gap = 0.025;
  for (let r = 0; r < 2; r++)
    for (let c = 0; c < 2; c++) {
      const m = new THREE.Mesh(new THREE.BoxGeometry(BW - gap, BH - gap, BD), blockStone);
      m.position.set((c - 0.5) * BW, 0.22 + BH * r + BH / 2, 0);
      g.add(m);
    }
  const topY = 0.22 + BH * 2;
  const cap = new THREE.Mesh(new THREE.BoxGeometry(2.7, 0.16, 1.95), blockStone);
  cap.position.y = topY + 0.08;
  g.add(cap);
  const plaque = new THREE.Mesh(new THREE.PlaneGeometry(0.8, 0.44), new THREE.MeshStandardMaterial({ map: plaqueTexture(), roughness: 0.25, metalness: 0.1 }));
  plaque.position.set(0, 0.22 + BH * 0.95, BD / 2 + 0.006);
  g.add(plaque);

  // 사자 조각
  const t0 = performance.now();
  const geo = polygonize(lionSDF(), { center: [0, 0.82, 0], half: 1.45, res: 112 });
  const lion = new THREE.Mesh(geo, lionStone);
  lion.position.y = topY + 0.16;
  lion.scale.setScalar(1.15);
  g.add(lion);
  console.log(`lion sculpt: ${(geo.attributes.position.count / 3) | 0} tris, ${(performance.now() - t0) | 0}ms`);

  // 잔디 위 흰 원형 선
  const ring = new THREE.Mesh(new THREE.RingGeometry(3.55, 3.66, 96), new THREE.MeshStandardMaterial({ color: 0xf4f1ea, roughness: 0.9 }));
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.09;
  g.add(ring);

  g.traverse((o) => { if (o.isMesh) { o.castShadow = o !== ring; o.receiveShadow = true; } });
  // 땅에 맞춤: 좌대 아래 가장 낮은 지점 기준
  let base = Infinity;
  for (const [dx, dz] of [[-1.5, -1.2], [1.5, -1.2], [-1.5, 1.2], [1.5, 1.2], [0, 0]]) base = Math.min(base, heightAt(p[0] + dx, p[1] + dz));
  g.position.set(p[0], base - 0.05, p[1]);
  // 좌대 정면(+z)과 사자 고개가 본관 바깥쪽을 보게
  g.rotation.y = Math.atan2(outward[0], outward[1]);
  return g;
}
