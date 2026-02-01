# Belling the Cat: Development Plan

## Overview
이 문서는 게임의 스토리 및 컨셉에 대한 분석과 개선 방향을 정리합니다.

---

## 1. 핵심 강점 (유지할 요소)

### 컨셉
- 이솝 우화 "고양이 목에 방울 달기"를 어두운 성인 내러티브로 재해석
- "왜 방울만 달지? 죽이면 되지 않나?"라는 핵심 질문

### 테마
- "옛 악마(Old Cat)가 새 악마보다 낫다"
- 급진적 해결책 vs 보수적 공존의 도덕적 딜레마

### 비주얼/톤
- 느와르, 고대비, 실루엣 아트 스타일
- Lovecraftian 공포 요소 (고양이 = 이해 불가능한 존재)

---

## 2. 개선 방향

### 2.1 반전의 예측 가능성 해결

**문제:** "Kill = Bad Ending"이 너무 예상 가능함

**해결책 (구현됨):**
- Elder가 죽기 전 파편적 힌트 제공:
  - "The nest behind the great wall"
  - "The bell is a warning for THEM"
  - 아버지가 "둥지"를 발견했다는 언급
- 플레이어가 진실을 추측하도록 유도하되 확신은 주지 않음

### 2.2 Elder 캐릭터 심화

**문제:** 비밀을 밝히기 전에 죽어서 캐릭터가 평면적

**해결책 (구현됨):**
- 주인공 아버지와의 연결고리 추가
- "It is our—" (보호막? 파수꾼?) 말이 끊기며 미스터리 유지
- "The Cat must live"의 이유를 암시하되 명시하지 않음

### 2.3 주인공 배경 추가

**문제:** "급진적 젊은 쥐" 외에 깊이 부족

**해결책 (구현됨):**
- 가족(어머니, 형제들)이 고양이에게 당한 과거 암시
- 아버지가 같은 생각을 했다는 복선
- 분노의 원인이 개인적 트라우마임을 보여줌

### 2.4 선택의 도덕적 균형

**문제:** Bell = 영웅, Kill = 파멸 → 일방적

**해결 방향 (Phase 4에서 구현 필요):**

| 선택 | 결과 | 숨겨진 대가 |
|------|------|------------|
| Bell | 마을 생존, 주인공 희생 | "문제를 다음 세대에 떠넘김", Elder의 진실은 영원히 묻힘 |
| Kill | 축제 → 새 고양이 출현 → 멸망 | 영웅이 되고 싶은 욕망이 모두를 죽임 |

**추가 고려사항:**
- Bell 엔딩에서도 주인공이 "이게 정말 옳은 건가?" 의문을 갖도록
- "영원한 공포 속 생존" vs "자유를 향한 도박" 구도로 재구성

---

## 3. 스토리 구현 현황

### Phase 1: The Mission
- [x] `intro` - 회의장 장면
- [x] `step_forward` / `look_around` - 선택지
- [x] `mission_brief` - 미션 부여
- [x] **Action Sequence** - Journey + Stealth 통합 레벨
- [x] `rope_break` - 밧줄 끊어지는 장면 (새로 추가)

### Phase 2: The Conflict
- [x] `phase2_return` - 실패 후 귀환
- [x] `phase2_confrontation` - Elder와 대립
- [x] `phase2_revelation` - Elder의 힌트 (둥지, 아버지, "THEM")
- [x] `phase2_attack` - 고양이 습격
- [x] `phase2_grief` - 선택적 애도 장면
- [x] `phase2_escape_action` - 탈출
- [x] **Action Sequence** - Escape 미니게임 (상자 숨기 + 벽 추격)

### Phase 3: The Climb (완다와 거상 스타일)
- [x] `phase3_approach` - 잠든 고양이에게 접근
- [x] **Action Sequence** - Climb 미니게임 (수직 플랫포밍)
  - 고양이 숨결에 따라 플랫폼(갈비뼈/털) 움직임
  - Twitch 시 DOWN 홀드로 버티기
  - Wakefulness 게이지 관리
- [x] `phase3_summit` - 정상 도달, 최종 선택

### Phase 4: The Choice
- [x] `ending_bell_start` - 방울 달기 선택
- [x] **Action Sequence** - Chase 미니게임 (오토러너)
  - High/Low 공격 회피 (Duck/Jump)
- [x] `ending_bell_escape` - 방울 엔딩 (The Devil We Know)

- [x] `ending_kill_start` - 목 조르기 선택
- [x] **Action Sequence** - QTE 미니게임 (Space 연타)
- [x] `ending_kill_victory` - 킬 엔딩 (The Devil We Made)
  - 새 고양이 출현 → 멸망

---

## 4. 기술적 TODO

### Narrative System
- [x] 기본 대화 시스템 (`narrative.js`)
- [x] 타이핑 효과
- [x] 선택지 UI
- [x] `action:` 접두사로 미니게임 전환
- [ ] 화면 흔들림 효과 (긴장 장면용)
- [ ] 텍스트 색상 변화 (빨간색 = 분노/위험)

### Action System
- [x] Journey 플랫포밍 구간
- [x] Stealth 잠입 구간 (Red Light/Green Light 방식)
- [x] Journey → Stealth 자연스러운 전환 (카메라 이동)
- [x] 상자 근처에서만 숨기 가능 (`canHide` 체크)
- [x] Cat Eye HUD (Watching/Sleeping 상태 표시)
- [x] 고양이 실루엣 시각화
- [x] Escape 구간 (상자 숨기 + 벽 추격 + Bell 리듬)
- [x] Climb 구간 (수직 플랫포밍 + 숨결 + Twitch)
- [x] Chase 구간 (오토러너 + High/Low 회피)
- [x] QTE 구간 (Space 연타)

### Director
- [x] Narrative ↔ Action 모드 전환
- [x] 미니게임 완료 후 씬 분기 처리
- [x] 엔딩 분기 처리 (Bell/Kill)
- [ ] 게임 상태 저장/로드

---

## 5. 남은 작업

1. **폴리싱** - 밸런스 조정, 버그 수정
2. **오디오** - 심장박동, 숨소리, 긴장 음악
3. **시각 효과** - 화면 흔들림, 비네트 효과
4. **게임 저장/로드** - 진행 상황 저장
