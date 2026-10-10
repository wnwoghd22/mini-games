# Belling the Cat — 작업 체크리스트

진행 규칙: 위에서부터 **하나씩** 구현 → 테스트/clippy/npm test → 게임 스크린샷 또는 헤드리스 시나리오로 확인 → 체크 → 사용자 확인 후 다음 항목. 에디터와 런타임은 항상 같은 모습을 유지한다(에디터에 기능이 생기면 런타임도 같은 단계에서 반영).

## 지금 할 것 (2026-10-10, 쉬운 것 → 어려운 것)

- [x] **1. 컷 라벨을 플레이 화면에서 제거** (2026-10-10, 코드 반영·cargo check 통과; 실행 중이던 게임 때문에 exe 재빌드는 다음 `cargo run` 때) — `label`은 에디터 식별용으로만 쓰고 런타임은 그리지 않는다. (`bevy/src/scenes/loader.rs`, `FORMAT.md`)
- [x] **2. 플레이어를 에디터에서 선택·이동** (2026-10-10, Cut Editor 0.4.1) — 플레이어는 자식이 아닌 별도 필드라 히트테스트에 빠져 있었음. 캔버스에서 클릭·드래그로 `player.x`를 바꾸고, 바닥 있는 다른 컷에 놓으면 `player.cut`이 바뀐다. 속성 패널에 cut/x/size/frames. (`editor/media/main.ts`)
- [x] **3. Z 판정을 "바라보는 방향 + 가장자리 틈"으로** (2026-10-10, 테스트 통과; exe는 실행 중인 게임 종료 후 재빌드) — 플레이어가 보는 쪽에 대상이 있고 두 스프라이트 가장자리 사이 틈이 `range`(기본 80) 이하면 발동. `near`는 방향 무관, 틈 기준. (`bevy/src/script.rs`, `scenes/mod.rs`, `FORMAT.md`)
- [ ] **4. 뒤로 돌 때 과이동** — 그림 위치가 비트(0.36s)마다 샘플링되어 방향 전환 직후 뒤쪽 위치로 보였다가 돌아오는 문제. 방향이 바뀌는 틱에 즉시 샘플링. (`bevy/src/dissolve.rs`, `player.rs`)
- [x] **5. 말풍선 글자 크기·자동 맞춤 + 대사 편집** (2026-10-10, Cut Editor 0.5.0; 런타임 exe는 실행 중인 게임 종료 후 재빌드) — 기본 글자 크기 13(컷 라벨 크기), 풍선 안에 들어가도록 자동 축소. 포맷에 balloon `font` 추가. 에디터 풍선 패널에서 본문을 직접 편집하면 `*.dialogue.txt`에 기록. (`bevy/src/balloon.rs`, `schema`, `editor/media/main.ts`, `editor/src/extension.ts`)
- [ ] **5b. 반복 트리거** — Z 상호작용은 한 번 발생한 뒤에도 다시 발동. 두 번째부터는 이미 떠 있는 말풍선을 다시 띄우거나 타이핑하지 않고(그대로 둔 채 Z 대기만), focus/path/player 등은 그대로 실행. `once` 기본값을 반복 가능으로 바꾸고 FORMAT.md 갱신. (`bevy/src/script.rs`, `scenes/mod.rs`, `schema`)
- [ ] **5c. 컷 초기 숨김** — 말풍선처럼 컷도 `initially: "hidden"`이면 최초 `focus` 전까지 배경·테두리·자식을 그리지 않음. 한 번 보이면 유지. 에디터에서는 반투명으로 표시하고 속성 토글 제공. (`schema`, `scenes/loader.rs`, `cut.rs`, `editor`)
- [ ] **6. 런타임 clip 마스킹** — 에디터처럼 `clip: true` 자식을 컷 다각형 안에서만 그린다. 셰이더 마스크 머티리얼. 텍스트는 마스킹하지 않음. (`bevy/src/mask.rs`, `assets/shaders/mask.wgsl`, `dissolve.rs`, `balloon.rs`)
- [ ] **7. 글로우 → 비녯** — council의 glow 대신 대비가 강한 비녯. 크로스디졸브 비트에 맞춰 크기가 ±5% 맥동. 포맷 shape `vignette`. (`bevy/src/art.rs` 또는 `mask.rs`, `editor`)

## 나중에

- [ ] 말풍선 텍스트의 마스킹 영역 제한(잘린 풍선에서 TextBounds를 컷 bbox와 교차)
- [ ] 에디터에서 대사 id 새로 만들기 / speaker 편집
- [ ] 웹 빌드(trunk)로 데이터 구동 씬 확인
- [ ] 생성 그림(candle/table/meeting-room PNG)으로 플레이스홀더 교체

## 완료

- [x] 모듈 분리 + 크로스디졸브/컷/말풍선 런타임 (2026-10-09)
- [x] 씬 포맷(`FORMAT.md`, `schema/scene.schema.json`) + 대사 스크립트 포맷
- [x] VS Code Cut Editor: 컷 다각형 편집, flow/카메라 경로, 미리보기, 자식 편집, 정렬 스냅, Flow 모드 GUI (v0.4.0)
- [x] 데이터 구동 런타임: scene.json/dialogue.txt 로딩, 다각형 컷, 자식 스폰, flow(target/range/near), 핫리로드 (2026-10-10)
