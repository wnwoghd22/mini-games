import { NarrativeEngine } from './narrative.js';
import { ActionEngine } from './action.js';
import { NarrativeRenderer } from './narrative-renderer.js';

export class GameDirector {
    constructor() {
        this.narrative = new NarrativeEngine(this);
        this.action = new ActionEngine(this);
        this.renderer = new NarrativeRenderer('action-canvas');

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

    setVisual(visualId) {
        console.log(`Director: setVisual(${visualId})`);
        if (this.state.currentMode === 'narrative') {
            this.renderer.render(visualId);
        }
    }

    switchToMode(mode) {
        this.state.currentMode = mode;
        const uiLayer = document.getElementById('ui-layer');
        const dialogueBox = document.getElementById('dialogue-box');

        if (mode === 'action') {
            dialogueBox.classList.add('hidden');
            // We might want to keep HUD visible, but hide dialogue
            this.renderer.clear(); // Clear narrative visuals
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
        } else if (minigame === 'escape') {
            if (result) {
                console.log("Escape Success -> Phase 3 Approach");
                this.switchToMode('narrative');
                this.narrative.loadScene('phase3_approach');
            } else {
                console.log("Escape Fail -> Crushed");
                alert("You were crushed! Hide behind boxes when the bell is loud!");
                this.action.start('escape');
            }
        } else if (minigame === 'climb') {
            if (result) {
                console.log("Climb Success -> Summit Choice");
                this.switchToMode('narrative');
                this.narrative.loadScene('phase3_summit');
            } else {
                console.log("Climb Fail -> Cat woke up");
                alert("The Cat woke up! Hold DOWN during twitches!");
                this.action.start('climb');
            }
        } else if (minigame === 'chase') {
            if (result) {
                console.log("Chase Success -> Bell Ending");
                this.switchToMode('narrative');
                this.narrative.loadScene('ending_bell_escape');
            } else {
                console.log("Chase Fail -> Caught");
                alert("The Cat got you! Duck (DOWN) for high attacks, Jump (UP) for low attacks!");
                this.action.start('chase');
            }
        } else if (minigame === 'qte_kill') {
            if (result) {
                console.log("QTE Success -> Kill Ending");
                this.switchToMode('narrative');
                this.narrative.loadScene('ending_kill_victory');
            } else {
                console.log("QTE Fail -> Cat escaped");
                alert("The Cat broke free! Mash SPACE faster!");
                this.action.start('qte_kill');
            }
        }
    }

    triggerEvent(eventData) {
        console.log('Event triggered:', eventData);
        // Handle global events (e.g., Minigame success/fail)
    }
}
