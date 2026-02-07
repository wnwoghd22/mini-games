# Implementation Plan - Killing Commendatore

> **Last Updated**: 2026-02-06
> **Status**: Alpha - Core Loop Playable (Balancing Required)

## Goal Description
Build a "Reverse Dungeon Crawler" game where the player, a female Warlock, summons monsters and traps to assassinate the Knight Commander. The game combines **Deck Building**, **Tower Defense (Placement)**, and **Turn-Based RPG** elements with a strong narrative focus.

## Tech Stack
-   **Core**: Vanilla JavaScript (ES Modules)
-   **Styling**: Vanilla CSS (CSS Variables for theming)
-   **State Management**: Custom Event System (`window.dispatchEvent`)
-   **No Build Tools**: Pure HTML/CSS/JS architecture

---

## Current Implementation Status

### Completed Systems
| System | Status | Notes |
|--------|--------|-------|
| Project Structure | ✅ Done | ES Modules, clean separation |
| Game State Machine | ✅ Done | INIT → DIALOGUE → PREP → PLACEMENT → COMBAT → RESULT |
| Dialogue System | ✅ Done | Script parser, portraits, overlay |
| Card System (Basic) | ✅ Done | Deck, Hand, Discard, Draw/Shuffle |
| Dungeon Generation | ✅ Done | Linear rooms, placement logic |
| Combat System (Basic) | ✅ Done | Auto-battle, turn execution |
| Waiting Room UI | ✅ Done | Enemy intel, deck editing |

### Incomplete/Broken Systems
| System | Status | Blocker |
|--------|--------|---------|
| Mana System | ❌ Missing | Cards have cost but no resource check |
| Spell Cards | ❌ Missing | Cannot use during combat |
| Balance | ⚠️ Broken | Knight too strong, units too weak |
| Level Scaling | ❌ Missing | Only room count increases |
| Shop System | ❌ Missing | No card acquisition |
| Crafting System | ❌ Missing | UI placeholder only |
| Range Attribute | ❌ Missing | Skeleton range ignored |

---

## Phase 1: Critical Fixes (Make Game Playable)

### 1.1 Balance Patch - `data/cards.js` & `CombatSystem.js`
**Priority**: P0 (Blocker)
**Effort**: Small

현재 밸런스 문제:
```
Knight: HP 100, ATK 15, DEF 5
Slime:  HP 10,  ATK 2  → 원킬 당함, 1 데미지만 줌
```

수정 방향:
```javascript
// CombatSystem.js - 기사 스탯 조정
this.knightParty = {
    hp: 40 + (level * 15),      // Lv1: 55
    maxHp: 40 + (level * 15),
    atk: 6 + (level * 2),       // Lv1: 8
    def: 1 + Math.floor(level / 2)  // Lv1: 1
};

// cards.js - 유닛 스탯 버프
Slime:    { hp: 12, atk: 5 }    // 2~3턴 생존, 의미있는 피해
Skeleton: { hp: 18, atk: 7 }    // 탱커 역할 가능
Trap:     { damage: 12 }        // 기사 HP의 20%+
```

**Verification**: 슬라임 2마리로 기사 처치 가능해야 함

---

### 1.2 Mana System - `game/GameState.js` (신규) & `CardSystem.js`
**Priority**: P0 (Blocker)
**Effort**: Medium

```javascript
// GameState.js (신규 파일)
export class GameState {
    constructor() {
        this.mana = 0;
        this.maxMana = 3;
        this.gold = 0;
        this.level = 1;
    }

    startPlacementPhase() {
        this.mana = this.maxMana + Math.floor(this.level / 2);
    }

    spendMana(cost) {
        if (this.mana >= cost) {
            this.mana -= cost;
            return true;
        }
        return false;
    }
}

// CardSystem.js 수정
playCard(cardIndex) {
    const card = this.hand[cardIndex];
    if (!this.game.gameState.spendMana(card.cost)) {
        console.log("Not enough mana!");
        return null;
    }
    // ... existing logic
}
```

**UI 변경**: Hand 영역에 마나 표시 (`💎 3/5`)

---

### 1.3 Spell Card Implementation - `CombatSystem.js` & `UIManager.js`
**Priority**: P1 (Core Feature)
**Effort**: Medium

```javascript
// CombatSystem.js
useSpell(spellCard) {
    if (!this.isCombatActive) return false;

    switch(spellCard.id) {
        case 'spell_fireball':
            // 적 1명에게 피해
            if (this.enemySummons.length > 0) {
                this.knightParty.hp -= spellCard.effect.damage;
                this.log(`🔥 Fireball hits Knight for ${spellCard.effect.damage}!`);
            }
            break;
        // 추가 스펠...
    }
    this.dispatchUpdate();
    return true;
}

// UIManager.js - 전투 중 핸드 표시 및 스펠 사용 버튼
```

---

## Phase 2: Core Loop Completion

### 2.1 Level Scaling - `GameManager.js` & `CombatSystem.js`
**Priority**: P1
**Effort**: Small

```javascript
// GameManager.js
nextLevel() {
    this.currentLevel++;

    // 기사 스탯 스케일링
    const baseHp = 40 + (this.currentLevel * 15);
    this.combatSystem.knightParty = {
        hp: baseHp,
        maxHp: baseHp,
        atk: 6 + (this.currentLevel * 2),
        def: 1 + Math.floor(this.currentLevel / 2)
    };

    // 마나 증가
    this.gameState.maxMana = 3 + Math.floor(this.currentLevel / 2);
}
```

### 2.2 Card Reward System - `WaitingRoomSystem.js`
**Priority**: P1
**Effort**: Medium

레벨 클리어 시 카드 3장 중 1장 선택:
```javascript
generateRewards() {
    const pool = [...ALL_CARDS]; // 전체 카드풀
    const rewards = [];
    for (let i = 0; i < 3; i++) {
        const idx = Math.floor(Math.random() * pool.length);
        rewards.push(pool.splice(idx, 1)[0]);
    }
    return rewards;
}
```

### 2.3 Range Attribute - `CombatSystem.js`
**Priority**: P2
**Effort**: Small

```javascript
// 원거리 유닛은 먼저 공격, 기사 반격 불가
executeTurn() {
    // 1. 원거리 유닛 공격
    this.enemySummons
        .filter(e => e.range > 1)
        .forEach(e => this.unitAttacks(e, this.knightParty));

    // 2. 기사 공격 (근접 유닛만 타겟)
    const meleeTargets = this.enemySummons.filter(e => !e.range || e.range === 1);
    // ...

    // 3. 근접 유닛 반격
}
```

---

## Phase 3: Content Expansion

### 3.1 New Cards - `data/cards.js`
**Priority**: P2
**Effort**: Small per card

| ID | Name | Type | Cost | Effect |
|----|------|------|------|--------|
| `sum_goblin` | Goblin | SUMMON | 1 | HP 8, ATK 6, 빠른 공격 |
| `sum_golem` | Stone Golem | SUMMON | 4 | HP 40, ATK 3, 높은 방어 |
| `trap_poison` | Poison Gas | TRAP | 2 | 3턴간 턴마다 5 피해 |
| `spell_heal` | Dark Heal | SPELL | 2 | 아군 1명 HP +15 |
| `spell_weaken` | Curse | SPELL | 1 | 기사 ATK -3 (3턴) |

### 3.2 Knight Variants - `data/enemies.js` (신규)
**Priority**: P2
**Effort**: Medium

```javascript
export const KNIGHT_TYPES = {
    commander: { hp: 55, atk: 8, def: 1, ability: null },
    paladin:   { hp: 70, atk: 6, def: 3, ability: 'heal_self' },
    berserker: { hp: 40, atk: 12, def: 0, ability: 'enrage' },
    ranger:    { hp: 35, atk: 10, def: 1, ability: 'first_strike' }
};
```

### 3.3 Shop System - `systems/ShopSystem.js` (신규)
**Priority**: P2
**Effort**: Medium

- 레벨 시작 전 상점 접근
- 골드로 카드 구매
- **카드 제거는 무료** (Waiting Room에서 자유롭게)

> **Design Note**: 적 파티 구성(탱커/힐러/딜러)에 따라 덱을 유동적으로 조절하는 것이 핵심 전략.
> 카드 제거에 비용을 부과하면 "실험"과 "적응"이 억제되어 재미가 감소함.
> 대신 **카드 획득**에 비용/선택 제한을 두어 의미있는 결정을 유도.

### 3.4 Crafting System - `WaitingRoomSystem.js`
**Priority**: P3
**Effort**: Medium

```javascript
// 레시피 기반 조합
const RECIPES = {
    'sum_slime+sum_slime': 'sum_king_slime',
    'sum_skeleton+trap_spikes': 'sum_bone_trap',
};

craftCards(cardId1, cardId2) {
    const key = [cardId1, cardId2].sort().join('+');
    if (RECIPES[key]) {
        // 재료 제거, 결과물 추가
    }
}
```

---

## Phase 4: Polish & Narrative

### 4.1 Plot Twist Implementation
**Priority**: P3
**Effort**: Large

- 레벨 3 이후 힌트 대화 추가
- 레벨 5에서 진실 공개
- 분기 선택지 UI
- 멀티 엔딩 (3종)

### 4.2 Sound & Effects
**Priority**: P3
**Effort**: Medium

- 카드 드로우 사운드
- 배치 완료 사운드
- 전투 타격음
- BGM (루프)

### 4.3 Visual Polish
**Priority**: P3
**Effort**: Medium

- 카드 아트워크 (placeholder → 실제 이미지)
- 캐릭터 포트레이트
- 전투 애니메이션 개선

---

## Implementation Order (Sprint Plan)

### Sprint 1: Playability (1-2 days) ✅ COMPLETE
1. [x] Balance patch (스탯 조정) - cards.js, CombatSystem.js
2. [x] Mana system (GameState.js) - 신규 생성
3. [x] Mana UI (hand container) - UIManager.js, style.css

### Sprint 2: Core Combat (2-3 days)
4. [ ] Spell cards in combat
5. [ ] Level scaling
6. [ ] Range attribute

### Sprint 3: Progression (2-3 days)
7. [ ] Card rewards after level
8. [ ] Gold system
9. [ ] Basic shop

### Sprint 4: Content (3-4 days)
10. [ ] 5 new cards
11. [ ] Knight variants
12. [ ] Crafting system

### Sprint 5: Narrative (3-4 days)
13. [ ] Plot twist dialogues
14. [ ] Ending branches
15. [ ] Polish & testing

---

## File Change Summary

| File | Action | Sprint |
|------|--------|--------|
| `src/game/GameState.js` | **CREATE** | 1 |
| `src/data/cards.js` | MODIFY | 1 |
| `src/systems/CombatSystem.js` | MODIFY | 1, 2 |
| `src/systems/CardSystem.js` | MODIFY | 1 |
| `src/ui/UIManager.js` | MODIFY | 1, 2 |
| `src/game/GameManager.js` | MODIFY | 2 |
| `src/data/enemies.js` | **CREATE** | 4 |
| `src/systems/ShopSystem.js` | **CREATE** | 3 |
| `src/data/dialogues/` | **CREATE** | 5 |

---

## Verification Checklist

### Sprint 1 완료 조건
- [ ] 마나 부족 시 카드 사용 불가
- [ ] 슬라임 2마리로 Lv1 기사 처치 가능
- [ ] 마나 UI 정상 표시

### Sprint 2 완료 조건
- [ ] 전투 중 Fireball 사용 가능
- [ ] Lv2 기사가 Lv1보다 강함
- [ ] 스켈레톤이 먼저 공격함

### Full Game 완료 조건
- [ ] 5레벨까지 클리어 가능
- [ ] 3종 이상의 엔딩 도달 가능
- [ ] 10분+ 플레이 세션 유지

---

*Plan authored by: Senior Game Developer*
*Reference: design_review.md*
