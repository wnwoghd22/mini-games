/**
 * WaitingRoomSystem.js
 * Manages the preparation phase: Deck editing, Crafting, and Mission Start.
 */
export class WaitingRoomSystem {
    constructor(gameManager) {
        this.game = gameManager;
    }

    enter() {
        console.log("Entered Waiting Room");
        // Trigger UI update
        window.dispatchEvent(new CustomEvent('waiting-room-entered', {
            detail: {
                deck: this.game.cardSystem.deck,
                library: this.game.cardSystem.library, // Now real data
                enemyIntel: {
                    name: "Knight Commander",
                    class: "Paladin",
                    hp: 500,
                    weakness: "Dark Magic"
                }
            }
        }));
    }

    // Proxy methods for UI
    moveToDeck(libraryIndex) {
        if (this.game.cardSystem.addToDeck(libraryIndex)) {
            this.refreshUI();
        }
    }

    moveToLibrary(deckIndex) {
        if (this.game.cardSystem.removeFromDeck(deckIndex)) {
            this.refreshUI();
        }
    }

    refreshUI() {
        window.dispatchEvent(new CustomEvent('waiting-room-updated', {
            detail: {
                deck: this.game.cardSystem.deck,
                library: this.game.cardSystem.library
            }
        }));
    }

    startMission() {
        console.log("Mission Started!");
        this.game.changeState('PLACEMENT');
    }

    craftCard(cardId1, cardId2) {
        // TODO: Implement simple crafting logic
        console.log(`Crafting ${cardId1} + ${cardId2}`);
    }
}
