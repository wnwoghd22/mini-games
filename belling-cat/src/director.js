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

    switchToMode(mode) {
        this.state.currentMode = mode;
        if (mode === 'action') {
            document.getElementById('ui-layer').classList.add('hidden-ui'); // simplified logic
            this.action.start();
        } else {
            document.getElementById('ui-layer').classList.remove('hidden-ui');
            this.action.stop();
        }
    }

    triggerEvent(eventData) {
        console.log('Event triggered:', eventData);
        // Handle global events (e.g., Minigame success/fail)
    }
}
