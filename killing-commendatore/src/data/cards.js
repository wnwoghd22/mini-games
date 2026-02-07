import { CARD_TYPES } from '../entities/Card.js';

// ============================================
// STARTER DECK - 초기 덱 구성
// ============================================
export const STARTER_DECK = [
    {
        id: 'sum_slime',
        name: 'Slime',
        cost: 1,
        type: CARD_TYPES.SUMMON,
        description: 'A weak but sticky minion.',
        effect: { unitId: 'slime', hp: 12, atk: 5 }  // Buffed: hp 10→12, atk 2→5
    },
    {
        id: 'sum_slime',
        name: 'Slime',
        cost: 1,
        type: CARD_TYPES.SUMMON,
        description: 'A weak but sticky minion.',
        effect: { unitId: 'slime', hp: 12, atk: 5 }
    },
    {
        id: 'sum_skeleton',
        name: 'Skeleton',
        cost: 2,
        type: CARD_TYPES.SUMMON,
        description: 'Ranged attacker.',
        effect: { unitId: 'skeleton', hp: 18, atk: 7, range: 2 }  // Buffed: hp 15→18, atk 4→7
    },
    {
        id: 'spell_fireball',
        name: 'Fireball',
        cost: 2,
        type: CARD_TYPES.SPELL,
        description: 'Deals 12 damage to the Knight.',
        effect: { damage: 12, target: 'knight' }  // Buffed: cost 3→2, damage 10→12
    },
    {
        id: 'trap_spikes',
        name: 'Spike Trap',
        cost: 1,
        type: CARD_TYPES.TRAP,
        description: 'Deals 12 damage when stepped on.',
        effect: { damage: 12, trigger: 'step' }  // Buffed: damage 5→12
    }
];

// ============================================
// ALL CARDS - 전체 카드 풀 (보상/상점용)
// ============================================
export const ALL_CARDS = [
    ...STARTER_DECK,
    {
        id: 'sum_goblin',
        name: 'Goblin',
        cost: 1,
        type: CARD_TYPES.SUMMON,
        description: 'Fast and fragile attacker.',
        effect: { unitId: 'goblin', hp: 8, atk: 6 }
    },
    {
        id: 'sum_golem',
        name: 'Stone Golem',
        cost: 3,
        type: CARD_TYPES.SUMMON,
        description: 'Slow but extremely durable.',
        effect: { unitId: 'golem', hp: 35, atk: 4 }
    },
    {
        id: 'trap_poison',
        name: 'Poison Gas',
        cost: 2,
        type: CARD_TYPES.TRAP,
        description: 'Poisons the Knight for 5 damage over 3 turns.',
        effect: { damage: 5, duration: 3, trigger: 'step' }
    },
    {
        id: 'spell_weaken',
        name: 'Curse',
        cost: 1,
        type: CARD_TYPES.SPELL,
        description: 'Reduces Knight ATK by 3 for 3 turns.',
        effect: { atkDebuff: 3, duration: 3, target: 'knight' }
    }
];
