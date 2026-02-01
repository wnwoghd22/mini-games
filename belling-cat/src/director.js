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
        const minigame = this.action.currentMinigame;
        const phase = this.action.level.phase;

        if (minigame === 'journey') {
            if (result) {
                // Journey (including stealth) Success -> Rope snaps story
                console.log("Mission Complete -> Rope Break Scene");
                this.switchToMode('narrative');
                this.narrative.loadScene('rope_break');
            } else {
                // Failed - check which phase
                if (phase === 'stealth') {
                    console.log("Caught by Cat -> Retry from stealth");
                    alert("Caught by the Cat! Hide behind boxes when the eye opens.");
                    // Restart from stealth only
                    this.action.start('stealth');
                } else {
                    console.log("Journey Fail -> Restart");
                    alert("You fell! Try again.");
                    this.action.start('journey');
                }
            }
        } else if (minigame === 'stealth') {
            // Standalone stealth (retry mode)
            if (result) {
                console.log("Stealth Success -> Rope Break Scene");
                this.switchToMode('narrative');
                this.narrative.loadScene('rope_break');
            } else {
                console.log("Stealth Fail -> Caught");
                alert("Caught by the Cat! Be sure to hide BEHIND cover (DOWN key).");
                this.action.start('stealth');
            }
        } else if (this.action.currentMinigame === 'escape') {
            if (result) {
                console.log("Escape Success -> Phase 3");
                this.switchToMode('narrative');
                // TODO: Add phase3_start scene
                alert("Escape Success! (End of Demo for now)");
            } else {
                console.log("Escape Fail -> Crushed");
                alert("You were crushed! Watch the bell status!");
                this.action.start('escape');
            }
        }
    }

    triggerEvent(eventData) {
        console.log('Event triggered:', eventData);
        // Handle global events (e.g., Minigame success/fail)
    }
}
