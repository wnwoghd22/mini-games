import { GameDirector } from './director.js';

document.addEventListener('DOMContentLoaded', () => {
    const director = new GameDirector();
    director.start();

    console.log('Belling the Cat initialized.');
});
