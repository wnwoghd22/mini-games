import { CARD_TYPES } from '../entities/Card.js';

export const STARTER_DECK = [
    {
        id: 'sum_slime',
        name: 'Slime',
        cost: 1,
        type: CARD_TYPES.SUMMON,
        description: 'A weak but sticky minion.',
        effect: { unitId: 'slime', hp: 10, atk: 2 }
    },
    {
        id: 'sum_slime',
        name: 'Slime',
        cost: 1,
        type: CARD_TYPES.SUMMON,
        description: 'A weak but sticky minion.',
        effect: { unitId: 'slime', hp: 10, atk: 2 }
    },
    {
        id: 'sum_skeleton',
        name: 'Skeleton',
        cost: 2,
        type: CARD_TYPES.SUMMON,
        description: 'Ranged attacker.',
        effect: { unitId: 'skeleton', hp: 15, atk: 4, range: 2 }
    },
    {
        id: 'spell_fireball',
        name: 'Fireball',
        cost: 3,
        type: CARD_TYPES.SPELL,
        description: 'Deals 10 damage to a target.',
        effect: { damage: 10, target: 'single' }
    },
    {
        id: 'trap_spikes',
        name: 'Spike Trap',
        cost: 1,
        type: CARD_TYPES.TRAP,
        description: 'Deals 5 damage when stepped on.',
        effect: { damage: 5, trigger: 'step' }
    }
];
