/**
 * CombatSystem.js
 * Handles combat encounters between Knight party and player's units.
 */

export class CombatSystem {
    constructor(gameManager) {
        this.game = gameManager;

        // Knight Party - 레벨 기반 스케일링
        this.knightParty = this.createKnight(1);

        // Current encounter data
        this.currentRoom = null;
        this.enemySummons = [];
        this.combatLog = [];
        this.isCombatActive = false;
        this.turnNumber = 0;
    }

    // 레벨에 따른 기사 스탯 생성
    createKnight(level) {
        const baseHp = 40 + (level * 15);   // Lv1: 55, Lv2: 70, Lv3: 85
        return {
            name: 'Knight Commander',
            hp: baseHp,
            maxHp: baseHp,
            atk: 6 + (level * 2),           // Lv1: 8, Lv2: 10, Lv3: 12
            def: Math.floor(level / 2)       // Lv1: 0, Lv2: 1, Lv3: 1
        };
    }

    // 레벨 변경 시 기사 리셋
    resetForLevel(level) {
        this.knightParty = this.createKnight(level);
        console.log(`Knight reset for Level ${level}:`, this.knightParty);
    }

    // Initialize combat with the current room's occupants
    startCombat(room) {
        this.currentRoom = room;
        this.combatLog = [];
        this.turnNumber = 0;

        // Handle trap first (instant damage)
        if (room.trap) {
            this.handleTrap(room.trap);
            room.trap = null; // Trap is consumed
        }

        // Check for summons
        if (room.summons && room.summons.length > 0) {
            this.enemySummons = room.summons.map(card => ({
                name: card.name,
                hp: card.effect.hp || 10,
                maxHp: card.effect.hp || 10,
                atk: card.effect.atk || 5
            }));
            this.isCombatActive = true;
            this.log(`Combat started! ${this.enemySummons.length} enemies!`);

            // Notify UI
            this.dispatchUpdate();
        } else {
            // No summons, combat ends immediately (trap only)
            this.isCombatActive = false;
            this.dispatchUpdate();
        }

        return this.isCombatActive;
    }

    handleTrap(trap) {
        const damage = trap.effect.damage || 5;
        this.knightParty.hp -= damage;
        this.log(`⚠️ TRAP! ${trap.name} deals ${damage} damage!`);
        this.log(`Knight HP: ${this.knightParty.hp}/${this.knightParty.maxHp}`);
    }

    // Execute one round of combat
    executeTurn() {
        if (!this.isCombatActive) return;

        this.turnNumber++;
        this.log(`--- Turn ${this.turnNumber} ---`);

        // Knight attacks first enemy
        if (this.enemySummons.length > 0) {
            const target = this.enemySummons[0];
            const damage = Math.max(1, this.knightParty.atk - 2); // Simple damage formula
            target.hp -= damage;
            this.log(`⚔️ Knight attacks ${target.name} for ${damage} damage!`);

            // Check if enemy dead
            if (target.hp <= 0) {
                this.log(`💀 ${target.name} defeated!`);
                this.enemySummons.shift();
            }
        }

        // Enemies attack
        this.enemySummons.forEach(enemy => {
            const damage = Math.max(1, enemy.atk - this.knightParty.def);
            this.knightParty.hp -= damage;
            this.log(`👾 ${enemy.name} attacks Knight for ${damage} damage!`);
        });

        this.log(`Knight HP: ${this.knightParty.hp}/${this.knightParty.maxHp}`);

        // Check combat end conditions
        if (this.enemySummons.length === 0) {
            this.log(`✅ All enemies defeated!`);
            this.isCombatActive = false;
        } else if (this.knightParty.hp <= 0) {
            this.log(`🎉 VICTORY! The Knight has fallen!`);
            this.isCombatActive = false;
        }

        // Clear room summons after combat
        if (!this.isCombatActive && this.currentRoom) {
            this.currentRoom.summons = [];
        }

        this.dispatchUpdate();

        return {
            combatActive: this.isCombatActive,
            knightDead: this.knightParty.hp <= 0,
            enemiesRemaining: this.enemySummons.length
        };
    }

    log(message) {
        this.combatLog.push(message);
        console.log(`[Combat] ${message}`);
    }

    dispatchUpdate() {
        window.dispatchEvent(new CustomEvent('combat-updated', {
            detail: {
                knight: { ...this.knightParty },
                enemies: [...this.enemySummons],
                log: [...this.combatLog],
                isActive: this.isCombatActive,
                turn: this.turnNumber
            }
        }));
    }

    getCombatState() {
        return {
            knight: this.knightParty,
            enemies: this.enemySummons,
            log: this.combatLog,
            isActive: this.isCombatActive
        };
    }
}
