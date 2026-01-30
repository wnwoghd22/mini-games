import init, { generate_puzzle } from './wasm/futoshiki_core.js';

let currentPuzzle = null;

// Initial render of empty board
renderInitialGrid();

async function run() {
    await init();

    const boardEl = document.getElementById('game-board');
    const newGameBtn = document.getElementById('new-game-btn');
    const difficultySelect = document.getElementById('difficulty');
    const statusEl = document.getElementById('status-message');

    newGameBtn.addEventListener('click', () => {
        const difficulty = difficultySelect.value;
        startNewGame(difficulty);
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

    function checkSolutionIfComplete() {
        if (!currentPuzzle) return;

        const cells = document.querySelectorAll('.cell');
        let valid = true;
        let filledCount = 0;
        const values = new Array(81).fill(0);

        cells.forEach(el => {
            let val = 0;
            if (el.querySelector('input')) {
                val = parseInt(el.querySelector('input').value) || 0;
            } else {
                val = parseInt(el.textContent) || 0;
            }
            if (val > 0) filledCount++;
            values[el.dataset.index] = val;
        });

        // 81개 미만이면 검증하지 않음
        if (filledCount < 81) {
            statusEl.textContent = '';
            return;
        }

        // 부등호 제약 검증
        currentPuzzle.constraints.forEach(c => {
            const valA = values[c.a];
            const valB = values[c.b];
            if (valA >= valB) valid = false;
        });

        // 중복 검사 (duplicate 클래스가 있는 셀이 있으면 invalid)
        const hasDuplicates = document.querySelector('.cell.duplicate') !== null;
        if (hasDuplicates) valid = false;

        if (valid) {
            statusEl.textContent = 'Correct!';
            statusEl.style.color = '#51cf66';
        } else {
            statusEl.textContent = 'Incorrect!';
            statusEl.style.color = '#ff6b6b';
        }
    }

    // Expose for input listener
    window.checkSolutionIfComplete = checkSolutionIfComplete;

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
                    if (window.validateInequalities) window.validateInequalities();
                    if (window.validateSudokuRules) window.validateSudokuRules();
                    if (window.checkSolutionIfComplete) window.checkSolutionIfComplete();
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

            // We use the '<' symbol for ALL inequalities and rotate it.
            el.textContent = '<';

            const r1 = Math.floor(c.a / 9);
            const c1 = c.a % 9;
            const r2 = Math.floor(c.b / 9);
            const c2 = c.b % 9;

            // Determine position & rotation
            if (r1 === r2) {
                // Horizontal
                const minC = Math.min(c1, c2);
                el.style.left = `calc(${minC + 1} * (100% / 9))`;
                el.style.top = `calc(${r1} * (100% / 9) + (100% / 18))`; // Center of row

                if (c1 < c2) {
                    // Left < Right. '<' points Left. Correct.
                    el.style.transform = `translate(-50%, -50%) rotate(0deg)`;
                } else {
                    // Right < Left. Right is Small. Point Right.
                    // '<' points Left. Rotate 180.
                    el.style.transform = `translate(-50%, -50%) rotate(180deg)`;
                }
            } else {
                // Vertical
                const minR = Math.min(r1, r2);
                el.style.left = `calc(${c1} * (100% / 9) + (100% / 18))`; // Center of col
                el.style.top = `calc(${minR + 1} * (100% / 9))`;

                if (r1 < r2) {
                    // Top < Bottom. Point Up.
                    // '<' points Left. Rotate 90deg -> Points Up.
                    el.style.transform = `translate(-50%, -50%) rotate(90deg)`;
                } else {
                    // Bottom < Top (Top > Bottom). Point Down.
                    // '<' points Left. Rotate -90deg -> Points Down.
                    el.style.transform = `translate(-50%, -50%) rotate(-90deg)`;
                }
            }
            boardEl.appendChild(el);
        });

        // Initial Validation Check (for pre-filled numbers)
        validateInequalities();
        validateSudokuRules();
    }

    function validateSudokuRules() {
        const cells = document.querySelectorAll('.cell');
        const values = new Array(81).fill(0);

        // Clear previous duplicate status
        cells.forEach(cell => cell.classList.remove('duplicate'));

        // Get values
        cells.forEach(el => {
            let val = 0;
            if (el.querySelector('input')) {
                val = parseInt(el.querySelector('input').value) || 0;
            } else {
                val = parseInt(el.textContent) || 0;
            }
            values[el.dataset.index] = val;
        });

        const sets = [];

        // Rows & Cols
        for (let i = 0; i < 9; i++) {
            const rowIndices = [];
            const colIndices = [];
            for (let j = 0; j < 9; j++) {
                rowIndices.push(i * 9 + j);
                colIndices.push(j * 9 + i);
            }
            sets.push(rowIndices);
            sets.push(colIndices);
        }

        // Blocks (3x3)
        for (let br = 0; br < 3; br++) {
            for (let bc = 0; bc < 3; bc++) {
                const blockIndices = [];
                for (let r = 0; r < 3; r++) {
                    for (let c = 0; c < 3; c++) {
                        blockIndices.push((br * 3 + r) * 9 + (bc * 3 + c));
                    }
                }
                sets.push(blockIndices);
            }
        }

        // Check duplicates
        sets.forEach(indices => {
            const seen = new Map(); // value -> [index, index...]
            indices.forEach(idx => {
                const val = values[idx];
                if (val > 0) {
                    if (!seen.has(val)) seen.set(val, []);
                    seen.get(val).push(idx);
                }
            });

            seen.forEach((idxs, val) => {
                if (idxs.length > 1) {
                    idxs.forEach(idx => {
                        cells[idx].classList.add('duplicate');
                    });
                }
            });
        });
    }

    function validateInequalities() {
        if (!currentPuzzle) return;

        // Get all current values
        const values = new Array(81).fill(0);
        document.querySelectorAll('.cell').forEach(el => {
            let val = 0;
            if (el.querySelector('input')) {
                val = parseInt(el.querySelector('input').value) || 0;
            } else {
                val = parseInt(el.textContent) || 0;
            }
            values[el.dataset.index] = val;
        });

        // Check each constraint
        const inequalityEls = document.querySelectorAll('.inequality');
        currentPuzzle.constraints.forEach((c, idx) => {
            const el = inequalityEls[idx]; // Assuming sequential order matches.
            // Ideally we should link them better, but for now assumption holds if render is deterministic.
            // Let's rely on data attribute for safety if we were refactoring, but loop index is OK here
            // since we append them in loop order.

            const valA = values[c.a];
            const valB = values[c.b];

            if (valA !== 0 && valB !== 0) {
                // Both filled, check logic
                if (valA >= valB) { // Constraint is always A < B
                    el.classList.add('invalid');
                } else {
                    el.classList.remove('invalid');
                }
            } else {
                // One or both empty -> Default (valid color)
                el.classList.remove('invalid');
            }
        });
    }

    // Expose for input listener
    window.validateInequalities = validateInequalities;
    window.validateSudokuRules = validateSudokuRules;
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
