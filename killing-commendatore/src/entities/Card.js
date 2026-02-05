/**
 * Card.js
 * Defines the base Card structure.
 */
export const CARD_TYPES = {
    SUMMON: 'SUMMON', // Places a unit
    SPELL: 'SPELL',   // Immediate effect
    TRAP: 'TRAP'      // Places a hidden trap
};

export class Card {
    constructor(data) {
        this.id = data.id;
        this.name = data.name;
        this.cost = data.cost;
        this.type = data.type; // SUMMON, SPELL, TRAP
        this.description = data.description;
        this.image = data.image || null;
        this.effect = data.effect || {}; // Payload for the effect
    }
}
