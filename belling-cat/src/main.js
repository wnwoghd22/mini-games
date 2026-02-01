import { GameDirector } from './director.js';

const director = new GameDirector();
director.start();

// Debug Panel
const debugToggle = document.getElementById('debug-toggle');
const debugButtons = document.getElementById('debug-buttons');

if (debugToggle && debugButtons) {
    debugToggle.addEventListener('click', () => {
        debugButtons.classList.toggle('hidden');
    });

    debugButtons.addEventListener('click', (e) => {
        const btn = e.target.closest('button');
        if (!btn) return;

        const scene = btn.dataset.scene;
        const action = btn.dataset.action;

        // Stop any running action
        if (director.action) director.action.stop();

        if (scene) {
            director.switchToMode('narrative');
            director.narrative.loadScene(scene);
        } else if (action) {
            director.startAction(action);
        }

        // Hide debug panel after selection
        debugButtons.classList.add('hidden');
    });
}

console.log('Belling the Cat initialized.');
