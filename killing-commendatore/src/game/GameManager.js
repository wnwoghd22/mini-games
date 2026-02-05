/**
 * GameManager.js
 * Handles the high-level state of the game (Phase transitions).
 */
export class GameManager {
    constructor() {
        this.gameState = 'INIT'; // INIT, DIALOGUE, MENU, SHOP, PLACEMENT, COMBAT, RESULT
        this.isRunning = false;
        this.currentLevel = 1;
    }

    start() {
        if (this.isRunning) return;
        this.isRunning = true;
        console.log("Game System Started.");

        // Initial Flow: Init -> Title Screen/Dialogue
        this.changeState('INIT');
        this.loop();
    }

    changeState(newState) {
        console.log(`State Change: ${this.gameState} -> ${newState}`);
        this.gameState = newState;
        // Dispatch event for UI to react
        window.dispatchEvent(new CustomEvent('game-state-changed', { detail: { state: newState } }));
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
                // Load assets, then switch to Intro
                // Simulated loading for now
                setTimeout(() => this.changeState('DIALOGUE'), 1000);
                break;
            case 'DIALOGUE':
                // Waiting for dialogue to finish
                break;
            case 'COMBAT':
                // Process turn logic
                break;
        }
    }
}
