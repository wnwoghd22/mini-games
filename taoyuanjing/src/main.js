import { GameEngine } from './engine.js';

window.addEventListener('load', () => {
    const canvas = document.getElementById('game-canvas');
    const game = new GameEngine(canvas);
    game.start();
});
