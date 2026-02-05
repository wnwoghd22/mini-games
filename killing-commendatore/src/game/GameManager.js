/**
 * GameManager.js
 * Handles the high-level state of the game (Phase transitions).
 */
import { CardSystem } from '../systems/CardSystem.js';
import { WaitingRoomSystem } from '../systems/WaitingRoomSystem.js';
import { DungeonSystem } from '../systems/DungeonSystem.js';
import { CombatSystem } from '../systems/CombatSystem.js';

export class GameManager {
    constructor() {
        this.gameState = 'INIT'; // INIT, DIALOGUE, PREPARATION, PLACEMENT, COMBAT, RESULT
        this.isRunning = false;
        this.currentLevel = 1;

        // Systems
        this.cardSystem = new CardSystem(this);
        this.waitingRoomSystem = new WaitingRoomSystem(this);
        this.dungeonSystem = new DungeonSystem(this);
        this.combatSystem = new CombatSystem(this);
    }

    start() {
        if (this.isRunning) return;
        this.isRunning = true;
        console.log("Game System Started.");

        // Setup Initial State
        this.cardSystem.initializeDeck();

        // Initial Flow: Init -> Title Screen/Dialogue
        this.changeState('INIT');
        this.loop();
    }

    changeState(newState) {
        console.log(`State Change: ${this.gameState} -> ${newState}`);
        this.gameState = newState;

        // Dispatch event for UI to react
        window.dispatchEvent(new CustomEvent('game-state-changed', { detail: { state: newState } }));

        // Handle State Entry Logic
        if (newState === 'PREPARATION') {
            this.waitingRoomSystem.enter();
        } else if (newState === 'PLACEMENT') {
            console.log("Entering Placement Phase");
            // Draw cards FIRST so hand is ready when dungeon renders
            this.cardSystem.drawCard(this.cardSystem.maxHandSize);
            console.log("Hand after draw:", this.cardSystem.hand.length, "cards");
            // Then generate and render dungeon
            this.dungeonSystem.generateDungeon(this.currentLevel);
        } else if (newState === 'COMBAT') {
            console.log("Entering Combat Phase");
            const room = this.dungeonSystem.rooms[this.dungeonSystem.currentKnightPosition];
            const hasCombat = this.combatSystem.startCombat(room);
            // Combat UI will be rendered via 'combat-updated' event
        }
    }

    loop() {
        if (!this.isRunning) return;

        // Calculate Delta Time (dt) here if needed for animations
        requestAnimationFrame(() => this.loop());

        // Update current state logic
        this.update();
    }

    update() {
        switch (this.gameState) {
            case 'INIT':
                // Loading simulation
                setTimeout(() => this.changeState('DIALOGUE'), 1000);
                break;
            case 'DIALOGUE':
                break;
            case 'PREPARATION':
                // Waiting for user to click "Start Mission"
                break;
            case 'PLACEMENT':
                // Logic occurs in changeState
                break;
            case 'COMBAT':
                break;
        }
    }
}
