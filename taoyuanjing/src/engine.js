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

        if (promptParams) {
            promptEl.classList.remove('hidden');
            promptEl.style.left = `${promptParams.x + promptParams.w / 2}px`;
            promptEl.style.top = `${promptParams.y - 20}px`;
            promptEl.innerText = `[E] Inspect ${promptParams.label}`;

            if (this.input.isPressed('KeyE')) {
                console.log('Interacting with ' + promptParams.label);
                // Trigger interaction logic here
            }
        } else {
            promptEl.classList.add('hidden');
        }
    }

    render() {
        this.ctx.clearRect(0, 0, this.width, this.height);

        // Background - Rice Paper Effect
        this.renderer.drawBackground();

        // Render World
        this.levelManager.render(this.renderer);
    }
}
