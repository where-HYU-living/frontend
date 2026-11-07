# 구역 플러그인 (src/zones/*.js)

main.js 가 이 폴더의 `*.js` 를 이름 순서대로 자동으로 불러온다. 파일 하나가 깨져도 나머지 장면은 뜬다.

```js
// src/zones/amph.js
export default async function (ctx) {
  const { THREE, world, heightAt, lm, scene, renderer } = ctx;
  // world.buildings[i]: { id, no:'209', name, pts:[[x,z]...], h, floors, look:{ wall, walls, roof, roofColor, window, conf } }
  // 좌표: x=동, z=남 (m), 원점 = 사자상. heightAt(x,z) = 지면 높이(m)
  return {
    group,                 // THREE.Group — 구역의 모든 메시
    skipIds: [b.id],       // 일반 상자 건물로 그리지 않을 건물 id (직접 모델링한 것)
    footprints: [{ id: b.id, pts: b.pts, top: 지붕높이 }], // 충돌·라벨 높이용
    clear: [[[x,z]...]],   // 나무를 심지 않을 다각형들
    plazas: [[[x,z]...]],  // (선택) 직접 포장한 광장 — roads.js 가 점자블록을 안 깖
    replace: ['amph'],     // (선택) 기존 기본 조형 끄기: 'amph' = landmarks.js 의 노천극장
    merge: true,           // (기본) 움직이지 않는 메시를 재질별로 합침 — 성능
    occlude: true,         // (기본) 카메라 가림 판정 대상 (건물)
  };
}
```

규칙
- 다른 구역 파일·main.js 는 고치지 않는다. 공용 도우미가 필요하면 자기 파일 안에 둔다 (hero.js 의 `obb`, `hipRoof`, `gablePrism` 패턴 참고·복사).
- 성능: 같은 재질은 공유, 텍스처는 `/tex/*.jpg` (Poly Haven 1k) 재사용·canvas 텍스처는 작게(≤1024), 그림자 캐스팅은 큰 덩어리만.
- 확인: `?go=209` (건물 번호로 카메라 이동), `?cam=x,z,tx,tz,dist,pitch`, `node scripts/shot.mjs`.
