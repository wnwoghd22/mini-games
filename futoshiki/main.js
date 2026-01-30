import init, { generate_puzzle } from './pkg/futoshiki_core.js';

let currentPuzzle = null;

// Initial render of empty board
renderInitialGrid();

async function run() {
    await init();

    const boardEl = document.getElementById('game-board');
    const newGameBtn = document.getElementById('new-game-btn');
    const checkBtn = document.getElementById('check-btn');
    const difficultySelect = document.getElementById('difficulty');
    const statusEl = document.getElementById('status-message');

    newGameBtn.addEventListener('click', () => {
        const diffusion = difficultySelect.value;
        startNewGame(diffusion);
    });

    checkBtn.addEventListener('click', () => {
        checkSolution();
    });

    // Automatically start game after load
    startNewGame('Normal');

    function startNewGame(difficulty) {
        statusEl.textContent = 'Generating...';
        // Small timeout to allow UI to update
        setTimeout(() => {
            try {
                const puzzle = generate_puzzle(difficulty);
                currentPuzzle = puzzle;
                renderBoard(puzzle);
                statusEl.textContent = '';
            } catch (e) {
                console.error(e);
                statusEl.textContent = 'Error generating puzzle.';
            }
        }, 10);
    }

    function checkSolution() {
        if (!currentPuzzle) return;

        const inputs = document.querySelectorAll('.cell');
        let valid = true;
        let filledCount = 0;
        const values = new Array(81).fill(0);

        inputs.forEach(el => {
            let val = 0;
            if (el.querySelector('input')) {
                val = parseInt(el.querySelector('input').value) || 0;
            } else {
                val = parseInt(el.textContent) || 0;
            }
            if (val > 0) filledCount++;
            values[el.dataset.index] = val;
        });

        if (filledCount < 81) {
            statusEl.textContent = 'Incomplete!';
            statusEl.style.color = '#ff6b6b';
            return;
        }

        currentPuzzle.constraints.forEach(c => {
            const valA = values[c.a];
            const valB = values[c.b];
            if (valA >= valB) valid = false;
        });

        if (valid) {
            statusEl.textContent = 'Correct!';
            statusEl.style.color = '#51cf66';
        } else {
            statusEl.textContent = 'Incorrect!';
            statusEl.style.color = '#ff6b6b';
        }
    }

    function renderBoard(puzzle) {
        boardEl.innerHTML = '';

        const constraintMap = new Map();
        puzzle.constraints.forEach(c => {
            const idx1 = Math.min(c.a, c.b);
            const idx2 = Math.max(c.a, c.b);
            constraintMap.set(`${c.a}-${c.b}`, '<');
            constraintMap.set(`${c.b}-${c.a}`, '>');
        });

        for (let r = 0; r < 17; r++) {
            for (let c = 0; c < 17; c++) {
                const el = document.createElement('div');

                if (r % 2 === 0 && c % 2 === 0) {
                    // CELL
                    const cellRow = r / 2;
                    const cellCol = c / 2;
                    const idx = cellRow * 9 + cellCol;

                    el.className = 'cell';
                    const val = puzzle.grid[idx];

                    if (val !== -1) {
                        el.textContent = val;
                        el.classList.add('fixed');
                        el.dataset.value = val;
                    } else {
                        const input = document.createElement('input');
                        input.type = 'text';
                        input.maxLength = 1;
                        input.addEventListener('input', (e) => {
                            const v = e.target.value;
                            if (v && !/^[1-9]$/.test(v)) {
                                e.target.value = '';
                            }
                            el.dataset.value = e.target.value || 0;
                        });
                        el.appendChild(input);
                    }
                    el.dataset.index = idx;

                } else if (r % 2 === 0) {
                    // H GAP
                    const row = r / 2;
                    const colLeft = (c - 1) / 2;
                    const colRight = (c + 1) / 2;
                    const idxA = row * 9 + colLeft;
                    const idxB = row * 9 + colRight;

                    el.className = 'inequality h';
                    if (constraintMap.has(`${idxA}-${idxB}`)) {
                        el.textContent = '<';
                    } else if (constraintMap.has(`${idxB}-${idxA}`)) {
                        el.textContent = '>';
                    }

                } else if (c % 2 === 0) {
                    // V GAP
                    const col = c / 2;
                    const rowTop = (r - 1) / 2;
                    const rowBottom = (r + 1) / 2;
                    const idxA = rowTop * 9 + col;
                    const idxB = rowBottom * 9 + col;

                    el.className = 'inequality v';
                    if (constraintMap.has(`${idxA}-${idxB}`)) {
                        el.textContent = 'v';
                    } else if (constraintMap.has(`${idxB}-${idxA}`)) {
                        el.textContent = '^';
                    }
                }
                boardEl.appendChild(el);
            }
        }
    }
}

function renderInitialGrid() {
    const boardEl = document.getElementById('game-board');
    if (!boardEl) return;
    boardEl.innerHTML = '';
    // Simple empty 17x17 grid
    for (let r = 0; r < 17; r++) {
        for (let c = 0; c < 17; c++) {
            const el = document.createElement('div');
            if (r % 2 === 0 && c % 2 === 0) {
                el.className = 'cell';
            }
            boardEl.appendChild(el);
        }
    }
}

run();
