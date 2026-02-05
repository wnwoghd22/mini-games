import { Card } from '../entities/Card.js';
import { STARTER_DECK } from '../data/cards.js';

export class CardSystem {
    constructor(gameManager) {
        this.game = gameManager;
        this.deck = []; // Active cards
        this.library = []; // Inactive cards (Inventory)
        this.hand = [];
        this.discardPile = [];
        this.maxHandSize = 5;
    }

    initializeDeck() {
        // All cards start in deck, library starts empty
        this.deck = STARTER_DECK.map(data => new Card(data));
        this.library = []; // For acquired cards later
        this.shuffleDeck();
        console.log("Deck Initialized:", this.deck);
    }

    // --- Deck Management ---

    addToDeck(cardIndexInLibrary) {
        const card = this.library.splice(cardIndexInLibrary, 1)[0];
        if (card) {
            this.deck.push(card);
            return true;
        }
        return false;
    }

    removeFromDeck(cardIndexInDeck) {
        if (this.deck.length <= 1) {
            console.warn("Cannot have empty deck!");
            return false;
        }
        const card = this.deck.splice(cardIndexInDeck, 1)[0];
        if (card) {
            this.library.push(card);
            return true;
        }
        return false;
    }

    shuffleDeck() {
        for (let i = this.deck.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [this.deck[i], this.deck[j]] = [this.deck[j], this.deck[i]];
        }
    }

    drawCard(amount = 1) {
        for (let i = 0; i < amount; i++) {
            if (this.hand.length >= this.maxHandSize) {
                console.log("Hand is full!");
                return;
            }

            if (this.deck.length === 0) {
                this.recycleDiscard();
            }

            if (this.deck.length > 0) {
                const card = this.deck.pop();
                this.hand.push(card);
                // Notify UI
                window.dispatchEvent(new CustomEvent('card-drawn', { detail: { card } }));
            }
        }
        this.updateHandUI();
    }

    recycleDiscard() {
        if (this.discardPile.length === 0) return;
        console.log("Recycling discard pile...");
        this.deck = [...this.discardPile];
        this.discardPile = [];
        this.shuffleDeck();
    }

    playCard(cardIndex) {
        const card = this.hand[cardIndex];
        if (!card) return;

        // Logic to check if playable (cost vs mana) will go here

        console.log(`Played card: ${card.name}`);

        this.hand.splice(cardIndex, 1);
        this.discardPile.push(card);
        this.updateHandUI();

        return card;
    }

    updateHandUI() {
        window.dispatchEvent(new CustomEvent('hand-updated', { detail: { hand: this.hand } }));
    }
}
