/**
 * GameState.js
 * Manages global game resources: Mana, Gold, Level progression.
 */

export class GameState {
    constructor() {
        this.level = 1;

        // Mana - 배치 페이즈에서 카드 사용 비용
        this.mana = 0;
        this.maxMana = 3;

        // Gold - 상점에서 카드 구매용 (Phase 3)
        this.gold = 0;
    }

    // 배치 페이즈 시작 시 마나 충전
    startPlacementPhase() {
        // 기본 3 + 레벨당 0.5 (2레벨마다 +1)
        this.maxMana = 3 + Math.floor(this.level / 2);
        this.mana = this.maxMana;

        this.dispatchUpdate();
        console.log(`Mana refreshed: ${this.mana}/${this.maxMana}`);
    }

    // 마나 소모 시도
    spendMana(cost) {
        if (this.mana >= cost) {
            this.mana -= cost;
            this.dispatchUpdate();
            return true;
        }
        console.log(`Not enough mana! Need ${cost}, have ${this.mana}`);
        return false;
    }

    // 마나 환불 (카드 배치 취소 시)
    refundMana(amount) {
        this.mana = Math.min(this.mana + amount, this.maxMana);
        this.dispatchUpdate();
    }

    // 골드 추가 (전투 승리 보상)
    addGold(amount) {
        this.gold += amount;
        this.dispatchUpdate();
        console.log(`Gold gained: +${amount} (Total: ${this.gold})`);
    }

    // 골드 소모 (상점 구매)
    spendGold(cost) {
        if (this.gold >= cost) {
            this.gold -= cost;
            this.dispatchUpdate();
            return true;
        }
        return false;
    }

    // 레벨업
    advanceLevel() {
        this.level++;
        // 레벨 클리어 보상: 기본 골드
        this.addGold(10 + (this.level * 5));
        console.log(`Advanced to Level ${this.level}`);
    }

    // 게임 리셋
    reset() {
        this.level = 1;
        this.mana = 0;
        this.maxMana = 3;
        this.gold = 0;
        this.dispatchUpdate();
    }

    // UI 업데이트 이벤트 발송
    dispatchUpdate() {
        window.dispatchEvent(new CustomEvent('gamestate-updated', {
            detail: {
                mana: this.mana,
                maxMana: this.maxMana,
                gold: this.gold,
                level: this.level
            }
        }));
    }

    // 현재 상태 조회
    getState() {
        return {
            mana: this.mana,
            maxMana: this.maxMana,
            gold: this.gold,
            level: this.level
        };
    }
}
