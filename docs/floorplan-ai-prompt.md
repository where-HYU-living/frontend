# 평면도 이미지 → FloorPlan JSON 프롬프트

이미지를 첨부하고 아래 `---` 사이 전체를 붙여넣는다. `{{ }}` 자리는 평면도마다 채운다.
결과는 반드시 3D 뷰어에서 눈으로 확인하고 고친다(좌표는 AI가 자주 틀린다).

---

너는 한국 원룸·기숙사 평면도 이미지를 3D 렌더링용 JSON 으로 옮기는 도면 변환기다.
첨부한 평면도 이미지를 보고, 아래 규칙대로 **JSON 하나만** 출력해라. 설명·마크다운·코드블록 표시 없이 JSON 만.

## 평면도 정보 (사용자가 제공)
- id: {{id}}
- name: {{예: 청아진 18타입}}
- 전용면적: {{예: 18.22}} ㎡
- 바깥 벽 중심선 기준 전체 크기: 가로 {{예: 3.8}} m × 세로 {{예: 4.8}} m  (모르면 "모름"이라고 쓰고, 면적과 이미지 비율로 추정)
- 천장 높이: {{기본 2.4}} m

## 좌표 규칙
- 단위는 전부 m. x = 오른쪽, y = 아래쪽. 원점 (0,0) = 바깥 벽 중심선 바운딩박스의 좌상단.
- 이미지 픽셀 비율을 가로·세로 전체 크기에 맞춰 환산한다. 소수 둘째 자리까지.
- 벽은 **중심선**으로 그린다. 바깥 벽 두께 0.2, 안쪽 칸막이 0.1 (이미지에서 확연히 얇거나 두꺼우면 조정).
- 방 polygon 은 벽 중심선 좌표를 그대로 쓰고, 이웃한 방과 경계 좌표가 정확히 같아야 한다. 시계방향.

## 스키마
```ts
{
  id: number; name: string; areaM2: number; ceilingHeight: number;
  walls: { from: [x,y]; to: [x,y]; thickness: number; height?: number }[];
  openings: { type: 'door'|'window'; wall: number; offset: number; width: number; height: number; sill: number;
              style?: 'swing'|'sliding'|'open'; swing?: { hinge: 'start'|'end'; opensTo: 1|-1 } }[];
  rooms: { name: string; polygon: [x,y][]; kind?: 'bedroom'|'living'|'kitchen'|'bathroom'|'entrance'|'balcony'|'utility'|'storage'|'hallway'|'other';
           floor?: { material: 'wood'|'tile'|'vinyl'|'concrete'; color?: string; height?: number } }[];
  entrance: [x,y];
  fixtures: { kind: 'toilet'|'sink'|'shower'|'bathtub'|'washer'|'kitchenSink'|'cooktop'|'fridge'|'kitchenCounter'|'upperCabinet'|
                     'bed'|'desk'|'chair'|'wardrobe'|'builtinWardrobe'|'shoeRack'|'shelf'|'sofa'|'tv'|'table'|'acOutdoor'|'waterHeater';
              position: [x,y]; facing: 'N'|'E'|'S'|'W'; size?: [w,d] | [w,d,h]; elevation?: number; room?: string }[];
  glbUrl: null;
}
```

## 필드 규칙
**walls**
- 바깥 벽 4개를 먼저, 위쪽 벽부터 시계방향으로 (인덱스 0~3). 그 뒤에 안쪽 칸막이.
- 문·창이 열린 벽도 끊지 말고 **한 줄로** 그린다. 문·창은 openings 로 표현한다.
- 허리 높이 정도의 낮은 칸막이는 height(m)를 쓴다. 천장까지면 생략.

**openings**
- wall = walls 배열 인덱스. offset = 그 벽 from 점에서 개구부 시작까지의 거리(m). width/height/sill 은 m.
- 현관문·방문: type door, sill 0, height 2.0~2.1, width 0.75~0.95. 여닫이는 style swing, 호(arc)가 그려진 쪽을 보고 swing 지정.
  - hinge: 경첩 위치. 벽 from 쪽이면 'start', to 쪽이면 'end'.
  - opensTo: 문이 열려 나가는 쪽. **평면도 그림을 위에서 본 화면 기준**으로 벽 진행방향(from→to)을 바라볼 때 왼쪽이 +1, 오른쪽이 -1.
    예) 위쪽 벽을 왼쪽→오른쪽으로 그렸다면 +1 은 화면 위(건물 바깥), -1 은 화면 아래(방 안쪽). 문 호(arc)가 그려진 쪽이 열리는 쪽이다.
- 슬라이딩 문·베란다 유리문: style sliding. 문 없이 터진 곳: style open.
- 창: type window, 일반 sill 0.9~1.0, height 1.2~1.4. 베란다 큰 창은 sill 0.1 처럼 낮게.

**rooms**
- name 은 이미지의 한글 라벨 그대로 (현관, 욕실, 거실, 실외기실, 주방 …). 라벨 없는 방은 용도로 추정해 이름 붙인다.
- kind 는 반드시 채운다. 현관=entrance, 욕실=bathroom, 실외기실·다용도실=utility, 베란다=balcony.
- floor.material: 욕실·현관=tile, 실외기실·베란다=concrete, 거실·침실=wood (장판 느낌이면 vinyl). 이미지에서 바닥 색이 보이면 color 를 #RRGGBB 로.
- floor.height: 욕실·현관처럼 단차가 보이거나 일반적인 곳은 -0.05 ~ -0.12, 나머지는 0.
- 거실·주방·침실이 한 공간이면 방 하나로 합쳐도 된다(이름 "원룸" 또는 "거실·주방").

**entrance**
- 현관문 개구부의 중심점 (벽 중심선 위 좌표).

**fixtures** — 이미지에 **그려진 것만** 넣는다. 상상으로 추가하지 마라.
- position = 바닥에 닿는 면의 중심 좌표. size 는 이미지에서 읽히면 [폭, 깊이] 또는 [폭, 깊이, 높이] (높이를 모르면 두 개만), 아무것도 모르면 생략(기본값 사용).
- facing = 가구의 앞면이 향하는 방향. 변기는 앉았을 때 정면(물탱크 반대쪽), 침대는 발치, 붙박이장·신발장은 문이 열리는 쪽, 싱크대·인덕션은 사용자가 서는 쪽, 책상은 앉은 사람이 바라보는 방향.
- 욕실: toilet, sink, shower(또는 bathtub). 주방: kitchenSink, cooktop, kitchenCounter, fridge, upperCabinet. 수납: builtinWardrobe, shoeRack. 베란다·실외기실: acOutdoor, waterHeater.
- elevation: 바닥에서 몸체 밑면까지 높이(m). 책상 위 책꽂이·벽걸이 선반처럼 공중에 놓인 것에만 쓴다(바닥에 놓인 건 생략).
- room 에는 해당 방 이름을 쓴다.

## 출력 전 자체 검수 (틀리면 고쳐서 출력)
1. 모든 openings.wall 이 walls 범위 안의 인덱스이고, offset + width ≤ 그 벽 길이.
2. 바깥 벽 4개가 닫혀 있다 (끝점이 다음 벽 시작점과 일치).
3. 방 polygon 넓이 합이 areaM2 의 ±15% 안이다. 벗어나면 좌표를 다시 계산.
4. 모든 fixtures.position 이 해당 room polygon 안쪽이다.
5. 이미지에 없는 문·창·가구를 만들지 않았다.
6. JSON 이 유효하다 (주석·말줄임표·후행 쉼표 없음).

## 출력 예시 (형식 참고용, 내용은 이미지에 맞게 새로 작성)
{"id":1,"name":"예시 18타입","areaM2":18.22,"ceilingHeight":2.4,
"walls":[{"from":[0,0],"to":[3.8,0],"thickness":0.2},{"from":[3.8,0],"to":[3.8,4.8],"thickness":0.2},{"from":[3.8,4.8],"to":[0,4.8],"thickness":0.2},{"from":[0,4.8],"to":[0,0],"thickness":0.2},{"from":[2.5,3.3],"to":[2.5,4.8],"thickness":0.1},{"from":[2.5,3.3],"to":[3.8,3.3],"thickness":0.1}],
"openings":[{"type":"door","wall":2,"offset":2.5,"width":0.9,"height":2.1,"sill":0,"style":"swing","swing":{"hinge":"start","opensTo":1}},{"type":"window","wall":0,"offset":1.0,"width":1.8,"height":1.3,"sill":0.9},{"type":"door","wall":5,"offset":0.25,"width":0.75,"height":2.0,"sill":0,"style":"swing","swing":{"hinge":"start","opensTo":-1}}],
"rooms":[{"name":"방·거실","kind":"living","polygon":[[0,0],[3.8,0],[3.8,3.3],[0,3.3]],"floor":{"material":"wood","height":0}},{"name":"주방","kind":"kitchen","polygon":[[0,3.3],[2.5,3.3],[2.5,4.8],[0,4.8]],"floor":{"material":"wood","height":0}},{"name":"욕실","kind":"bathroom","polygon":[[2.5,3.3],[3.8,3.3],[3.8,4.8],[2.5,4.8]],"floor":{"material":"tile","height":-0.08}}],
"entrance":[2.95,4.8],
"fixtures":[{"kind":"toilet","position":[3.55,4.55],"facing":"W","room":"욕실"},{"kind":"sink","position":[3.0,3.5],"facing":"S","room":"욕실"},{"kind":"kitchenSink","position":[0.4,4.5],"facing":"E","room":"주방"}],
"glbUrl":null}

---

## 사용 팁
- 한 번에 안 맞으면 "벽 좌표만 다시", "fixtures 만 다시" 식으로 나눠서 고치게 한다.
- 비슷한 유형(같은 건물 같은 타입)은 완성본 JSON 을 붙여주고 "이 평면도와 비교해 다른 부분만 고쳐줘"라고 한다.
- 3D 뷰어에서 확인할 때 가장 자주 틀리는 것: 문 열림 방향(`opensTo` 부호), 변기·붙박이장 `facing`, 벽 인덱스 번호.
