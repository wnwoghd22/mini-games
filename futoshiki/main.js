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

        // Validate
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

        // 1. Render Cells (9x9)
        for (let i = 0; i < 81; i++) {
            const el = document.createElement('div');
            el.className = 'cell';

            const row = Math.floor(i / 9);
            const col = i % 9;

            // Add thick borders for 3x3 blocks
            if (col === 2 || col === 5) el.classList.add('border-right-thick');
            if (row === 2 || row === 5) el.classList.add('border-bottom-thick');

            const val = puzzle.grid[i];
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
            el.dataset.index = i;
            boardEl.appendChild(el);
        }

        // 2. Render Constraints (Overlays)
        puzzle.constraints.forEach(c => {
            const el = document.createElement('div');
            el.className = 'inequality';

            // Check direction. Rust constraint is ALWAYS val[a] < val[b].
            // So we render '<' if visual order is A then B.
            // Or '>' if visual order is B then A.
            // Or 'v' / '^' for vertical.

            const r1 = Math.floor(c.a / 9);
            const c1 = c.a % 9;
            const r2 = Math.floor(c.b / 9);
            const c2 = c.b % 9;

            // Determine position
            if (r1 === r2) {
                // Horizontal
                // Position between c1 and c2.
                const minC = Math.min(c1, c2);
                // Left: (minC + 1) * 100/9 %
                el.style.left = `calc(${minC + 1} * (100% / 9))`;
                el.style.top = `calc(${r1} * (100% / 9) + (100% / 18))`; // Center of row

                // Symbol
                if (c1 < c2) {
                    // a is left, b is right. a < b.
                    el.textContent = '<';
                } else {
                    // a is right, b is left. a < b -> b > a.
                    el.textContent = '>';
                }
            } else {
                // Vertical
                const minR = Math.min(r1, r2);
                el.style.left = `calc(${c1} * (100% / 9) + (100% / 18))`; // Center of col
                el.style.top = `calc(${minR + 1} * (100% / 9))`;

                if (r1 < r2) {
                    // a is top, b is bottom. a < b.
                    // Standard Futoshiki: Opening faces larger number.
                    // Larger is B (bottom). V shape.
                    el.textContent = 'v';
                } else {
                    // a is bottom, b is top. a < b -> b > a.
                    // Larger is B (top). ^ shape.
                    el.textContent = '^';
                }
            }
            boardEl.appendChild(el);
        });
    }
}

function renderInitialGrid() {
    const boardEl = document.getElementById('game-board');
    if (!boardEl) return;
    boardEl.innerHTML = '';

    for (let i = 0; i < 81; i++) {
        const el = document.createElement('div');
        el.className = 'cell';
        const row = Math.floor(i / 9);
        const col = i % 9;
        if (col === 2 || col === 5) el.classList.add('border-right-thick');
        if (row === 2 || row === 5) el.classList.add('border-bottom-thick');
        boardEl.appendChild(el);
    }
}

run();
