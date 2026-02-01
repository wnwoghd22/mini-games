import { NarrativeEngine } from './narrative.js';
import { ActionEngine } from './action.js';

export class GameDirector {
    constructor() {
        this.narrative = new NarrativeEngine(this);
        this.action = new ActionEngine(this);

        this.state = {
            currentMode: 'narrative', // 'narrative' or 'action'
            flags: {
                ropeStrength: 'weak', // 'weak', 'strong'
                elderDead: false,
                catStatus: 'sleeping'
            }
        };
    }

    start() {
        // Start with the Intro scene
        console.log("Director: Starting Game...");
        this.narrative.loadScene('intro');
    }

    startAction(minigameType) {
        console.log(`Director: Switching to Action Mode (${minigameType})`);
        this.switchToMode('action');
        this.action.start(minigameType);
    }

    switchToMode(mode) {
        this.state.currentMode = mode;
        const uiLayer = document.getElementById('ui-layer');
        const dialogueBox = document.getElementById('dialogue-box');

        if (mode === 'action') {
            dialogueBox.classList.add('hidden');
            // We might want to keep HUD visible, but hide dialogue
        } else {
            dialogueBox.classList.remove('hidden');
            this.action.stop();
        }
    }

    onMinigameComplete(result) {
        console.log(`Director: Minigame Result: ${result}`);

        // Switch back to narrative regardless, but decide WHICH scene based on result
        this.switchToMode('narrative');

        if (this.action.currentMinigame === 'stealth') {
            if (result) {
                // Success: However, in our story, the ROPE BREAKS even if we succeed stealth
                // So we transition to the "Mission Failed (Story Event)" scene
                console.log("Stealth Success -> Story Failure (Rope Break)");
                this.narrative.loadScene('phase2_return');
            } else {
                // Failure: Caught by Cat -> Death -> Retry?
                console.log("Stealth Fail -> DEATH");
                alert("You were caught! (Reloading for now)");
                location.reload();
            }
        }
    }

    triggerEvent(eventData) {
        console.log('Event triggered:', eventData);
        // Handle global events (e.g., Minigame success/fail)
    }
}
