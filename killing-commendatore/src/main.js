/**
 * Killing Commendatore - Main Entry Point
 */
import { GameManager } from './game/GameManager.js';
import { UIManager } from './ui/UIManager.js';

window.addEventListener('DOMContentLoaded', () => {
    console.log("Initializing Killing Commendatore...");

    const game = new GameManager();
    const ui = new UIManager(game);

    // Start the game loop
    game.start();
});
