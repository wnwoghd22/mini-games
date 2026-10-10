# 씬 파일 포맷 (v1)

씬 하나는 두 파일로 구성된다.

| 파일 | 역할 | 누가 쓰는가 |
| --- | --- | --- |
| `*.scene.json` | 컷(다각형), 자식 오브젝트, 플레이어, 흐름(flow) | VS Code 컷 에디터 (손으로 고쳐도 됨) |
| `*.dialogue.txt` | 대사 본문 | 사람 (에디터의 텍스트 패널도 이 파일을 고침) |

둘 다 `bevy/assets/scenes/` 아래에 두고, 런타임은 `*.scene.json`의 `dialogue` 필드로 대사 파일을 찾는다.
`schema/scene.schema.json`을 `$schema`로 지정하면 VS Code가 자동완성과 검증을 해 준다.

## 좌표계

- 런타임과 같은 **페이지 월드 좌표**. 원점은 페이지 중앙, y는 위가 +, 기본 뷰는 1080×940.
- v1에서는 **모든 좌표가 절대 좌표**다(컷 안의 자식도 절대 좌표). 에디터의 "컷 이동"은 다각형 꼭짓점과 자식을 함께 옮긴다.
- 길이 단위는 월드 단위(기본 줌에서 1 단위 = 1 논리 픽셀).

## `*.scene.json`

```jsonc
{
  "$schema": "../../../schema/scene.schema.json",
  "version": 1,
  "dialogue": "council.dialogue.txt",      // 이 파일과 같은 폴더 기준
  "cuts": [ Cut, ... ],
  "player": Player,
  "flow": [ Trigger, ... ]
}
```

### Cut

```jsonc
{
  "id": "council",                 // 영숫자/밑줄, 씬 안에서 유일
  "label": "01 / THE COUNCIL",     // 패널 왼쪽 위 라벨. 생략하면 라벨 없음
  "polygon": [[-285, 360], [285, 360], [285, -400], [-285, -400]],
                                   // 꼭짓점 3개 이상, 방향 무관, 자기 교차 금지
  "fill": "dark",                  // "dark" | "paper" | "#rrggbb"
  "floor_y": -278,                 // 플레이어가 서는 바닥 y. 없으면 플레이어가 들어올 수 없는 컷
  "walk": [-211, 211],             // 플레이어가 걸을 수 있는 x 범위 (floor_y가 있을 때만)
  "children": [ Child, ... ]
}
```

- 카메라가 컷을 포커스할 때는 다각형의 **바운딩 박스**가 뷰 높이의 81%를 채우도록 줌한다(현재 런타임과 같은 규칙).
- 패널 외곽선(잉크 이중선)은 다각형을 따라 자동으로 그린다.

### Child

모든 자식은 공통 필드를 가진다.

```jsonc
{
  "type": "sprite" | "balloon" | "text" | "shape",
  "id": "candle",                  // 씬 안에서 유일 (flow에서 참조)
  "pos": [0, -166],                // 중심 (절대 좌표)
  "z": 2,                          // 그리기 순서. 생략 시 1. 컷 배경은 -1, 패널 외곽선은 -2
  "clip": true                     // true면 컷 다각형 밖은 잘린다. false면 컷 밖으로 튀어나간다
}
```

| type | 추가 필드 |
| --- | --- |
| `sprite` | `size: [w,h]`, `frames: ["atlas:index", ...]`(1개 이상), `mode: "cycle" \| "hold"`(기본 cycle), `flip: bool`, `tint: "#rrggbb"` |
| `balloon` | `size: [w,h]`(타원 전체 크기), `tail: [dx,dy]`(꼬리가 향하는 점, 풍선 중심 기준; 길이는 런타임이 제한), `kind: "speech"(타원) \| "shout"(뾰족한 강조) \| "thought"(구름, 꼬리는 작은 거품 3개)`, `line: "elder.1"`(대사 id), `initially: "hidden" \| "shown"`(기본 hidden; hidden이면 flow의 `say`로 띄운다) |
| `text` | `text: "..."`, `size: 22`(px), `color: "ink" \| "paper" \| "#rrggbb"`, `box: [w,h]`(선택, 줄바꿈 영역) |
| `shape` | `shape: "ellipse" \| "rect"`, `size: [w,h]`, `color: "#rrggbb"`, `alpha: 0.0~1.0` (배경 장식: 촛불 글로우, 바닥선 등) |

- `frames`의 `"atlas:index"`는 아틀라스 이름과 셀 번호(행 우선, 0부터). 아틀라스 테이블은 `bevy/src/art.rs`에 있다:

  | 이름 | 파일 | 셀 |
  | --- | --- | --- |
  | `mouse` | `art/mouse-poses.png` | 2×2 (0 대기, 1 걷기, 2 걷기, 3 점프) |
  | `walk` | `art/mouse-walk-poses.png` | 2×1 |
  | `candle` | 코드 생성 (또는 `art/candle.png` 3×1) | 3 |
  | `table` | 코드 생성 (또는 `art/table.png`) | 1 |

- 스프라이트는 모두 크로스디졸브 대상이다. `cycle`은 전역 비트마다 다음 프레임, `hold`는 첫 프레임 고정(프레임이 1개면 자연히 고정).
- 말풍선 꼬리 `tail`은 풍선 중심에서 꼬리 끝이 향하는 점까지의 벡터다. 생략하거나 `[0, 0]`이면 꼬리 없음. 실제 길이는 런타임이 테두리 밖 90까지로 제한한다.
- 잘린(`clip: true`) 말풍선의 **텍스트는 마스킹하지 않고**, 텍스트 영역을 풍선 사각형 ∩ 컷 바운딩 박스로 제한한다. 튀어나간 풍선은 그대로 그린다.

### Player

```jsonc
{
  "cut": "council",                // 시작 컷 (floor_y/walk가 있어야 함)
  "x": -203,                       // 시작 x
  "size": [142, 142],
  "frames": { "idle": "mouse:0", "walk": ["walk:0", "walk:1"], "jump": "mouse:3" },
  "clip": true
}
```

### Trigger / Step (flow)

```jsonc
{
  "on": "z" | "near" | "right_edge" | "left_edge" | "enter",
  "target": "candle",              // z/near: 붙어 있는 자식(또는 컷) id. 생략하면 어디서나
  "range": 80,                     // z/near: target과 플레이어 x의 거리 한계 (같은 컷)
  "when": "flow_done" | "always",  // 생략 시 always. flow_done = 어떤 트리거든 return 스텝을 지난 뒤
  "once": true,                    // 생략 시 true. false면 조건이 맞을 때마다 다시 실행
  "steps": [ Step, ... ]
}
```

- `z`: 플레이어가 탐색 중 Z를 누르면 시작하고, 이후 **Z를 누를 때마다 한 스텝씩** 진행한다. `target`이 있으면 그 오브젝트 근처(`range`)에서만 시작한다. 풍선이 타이핑 중이면 Z는 먼저 전체를 드러낸다.
- `near`: 플레이어가 `target`에 `range` 안으로 다가가면 Z 없이 자동으로 시작한다. 이후 진행은 `z`와 같다.
- `right_edge` / `left_edge`: 플레이어가 현재 컷의 `walk` 끝에 닿은 채 그 방향으로 걷는 중.
- `enter`: 씬 시작 직후.

| Step | 의미 |
| --- | --- |
| `{ "focus": "elder" }` | 카메라를 컷으로 슬라이드(0.9초, smoothstep). 끝나면 자동으로 다음 스텝 |
| `{ "say": "b_elder_1" }` | 풍선을 띄우고(한 번 뜨면 사라지지 않음) 다음 Z까지 대기 |
| `{ "path": [ {"x":-330,"y":840,"zoom":0.7,"t":0}, {"x":-200,"y":700,"zoom":0.5,"t":1.2,"ease":"smooth"} ] }` | 자유 카메라 경로. 첫 키프레임은 현재 카메라 위치에서 출발해 `t`초에 도달. `ease`: `"smooth"`(기본) \| `"linear"`. 끝나면 자동으로 다음 스텝 |
| `{ "wait": 0.5 }` | 초 단위 대기 |
| `{ "player": { "cut": "door", "x": 559 } }` | 플레이어를 다른 컷으로 옮긴다(그 컷에 floor_y 필요) |
| `{ "return": true }` | `player.cut`으로 카메라 복귀 후 탐색으로 돌아가고 `flow_done`을 켠다 |

스텝 목록이 끝나면(마지막이 `return`이 아니어도) 탐색으로 돌아간다.

## `*.dialogue.txt`

```
# 줄 맨 앞의 #는 주석
[elder.1] elder
The council has spoken.
The old bell is failing.

[elder.2] elder
You will carry the new one.
Good luck, little one.
```

- `[id] speaker` 한 줄이 헤더. `id`는 영숫자/밑줄/점, `speaker`는 표시용 이름(생략 가능).
- 헤더 다음 줄부터 **빈 줄 전까지**가 본문. 줄바꿈은 그대로 풍선에 들어간다.
- 같은 id가 두 번 나오면 뒤의 것이 이긴다(파서가 경고).
- 런타임은 풍선의 `line`으로 본문을 찾고, 없으면 `[missing: id]`를 표시한다.
