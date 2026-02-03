import { Renderer } from './renderer.js';
import { InputHandler } from './input.js';
import { LevelManager } from './levels.js';

export class GameEngine {
    constructor(canvas) {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d');

        // Fix for high DPI displays
        this.dpr = window.devicePixelRatio || 1;
        this.width = canvas.parentElement.clientWidth;
        this.height = canvas.parentElement.clientHeight;
        canvas.width = this.width * this.dpr;
        canvas.height = this.height * this.dpr;
        this.ctx.scale(this.dpr, this.dpr);

        this.lastTime = 0;

        this.renderer = new Renderer(this.ctx, this.width, this.height);
        this.input = new InputHandler(this.canvas);
        this.levelManager = new LevelManager();

        this.state = 'GALLERY'; // GALLERY | PAINTING | DIALOGUE
    }

    start() {
        this.lastTime = performance.now();
        requestAnimationFrame(this.gameLoop.bind(this));
    }

    gameLoop(timestamp) {
        const deltaTime = (timestamp - this.lastTime) / 1000; // Seconds
        this.lastTime = timestamp;

        this.update(deltaTime);
        this.render();

        requestAnimationFrame(this.gameLoop.bind(this));
    }

    update(dt) {
        // Check for active modal
        const modal = document.getElementById('swap-modal');
        if (modal && !modal.classList.contains('hidden')) {
            // Pause interactions if modal is open
            // Update inputs just to flush them, or ignore
            this.input.update();
            return;
        }

        // Handle Input
        if (this.input.keys.includes('Escape')) {
            // Pause menu or similar
        }

        this.levelManager.update(dt, this.input);

        // Update Input State (for justPressed)
        this.input.update();

        // UI Updates
        const promptParams = this.levelManager.nearbyInteractable;
        const promptEl = document.getElementById('interaction-prompt');

        if (promptParams && (!modal || modal.classList.contains('hidden'))) {
            promptEl.classList.remove('hidden');
            promptEl.style.left = `${promptParams.x + promptParams.w / 2}px`;

            if (promptParams.y < 200) {
                promptEl.style.top = `${promptParams.y + promptParams.h + 10}px`;
            } else {
                promptEl.style.top = `${promptParams.y - 20}px`;
            }

            promptEl.innerText = `[E] ${promptParams.type === 'PORTAL' ? 'Inspect' : 'Take'} ${promptParams.label}`;
        } else {
            promptEl.classList.add('hidden');
        }
    }

    render() {
        this.ctx.clearRect(0, 0, this.width, this.height);

        // 1. Draw Background & Room Perspective
        this.renderer.drawBackground();
        if (this.levelManager.scene) {
            this.renderer.drawRoom(this.levelManager.scene);
        }

        // 2. Draw Scene Content (Interactables, Items)
        if (this.levelManager.scene) {
            this.renderer.drawSceneObjects(this.levelManager.scene);
        }

        // 3. Draw Player
        this.levelManager.render(this.renderer);
    }
}
