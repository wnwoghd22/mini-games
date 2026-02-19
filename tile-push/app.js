
// Tile Push Puzzle - Core Logic

// -- Constants --
const GRID_SIZE = 5;
const TILE_TYPES = {
    STRAIGHT: { name: 'straight', connections: 0b0101 }, // N-S
    CORNER:   { name: 'corner',   connections: 0b0011 }, // N-E
    T_SHAPE:  { name: 't_shape',  connections: 0b0111 }, // N-E-S
    CROSS:    { name: 'cross',    connections: 0b1111 }, // N-E-S-W
};

const DIRECTIONS = {
    NORTH: 0,
    EAST:  1,
    SOUTH: 2,
    WEST:  3
};

// Bitmasks: N=1, E=2, S=4, W=8
const MASK_N = 1;
const MASK_E = 2;
const MASK_S = 4;
const MASK_W = 8;

// Color palette for flow pairs
const PAIR_COLORS = ['#0ea5e9', '#f97316', '#a855f7', '#22c55e', '#ec4899'];

const DIFFICULTIES = {
    single: [
        { id: 0, color: PAIR_COLORS[0], source: { r: 0, c: 0 }, sink: { r: 4, c: 4 } }
    ],
    double: [
        { id: 0, color: PAIR_COLORS[0], source: { r: 0, c: 0 }, sink: { r: 2, c: 4 } },
        { id: 1, color: PAIR_COLORS[1], source: { r: 4, c: 4 }, sink: { r: 2, c: 0 } },
    ]
};

const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

class Tile {
    constructor(typeObj, rotation = 0) {
        this.type = typeObj;
        this.rotation = rotation; // 0, 1, 2, 3 (x 90deg)
        this.locked = false;
    }

    // Get effective connections after rotation
    getConnections() {
        let conns = this.type.connections;
        for (let i = 0; i < this.rotation; i++) {
            conns = ((conns << 1) & 0b1111) | ((conns & 0b1000) >> 3);
        }
        return conns;
    }

    clone() {
        const t = new Tile(this.type, this.rotation);
        t.locked = this.locked;
        return t;
    }
}

class Grid {
    constructor(pairs) {
        this.width  = GRID_SIZE;
        this.height = GRID_SIZE;
        this.cells  = [];
        this.pairs  = pairs; // [{ id, color, source:{r,c}, sink:{r,c} }, ...]

        this.initSolvable();
    }

    initSolvable() {
        this.cells = [];
        for (let r = 0; r < this.height; r++) {
            const row = [];
            for (let c = 0; c < this.width; c++) {
                row.push(this.randomTile());
            }
            this.cells.push(row);
        }

        // Carve a guaranteed path for each pair
        this._carvePaths();

        // Lock 2 random tiles, avoiding all source/sink positions
        const specialCells = new Set(
            this.pairs.flatMap(p => [
                `${p.source.r},${p.source.c}`,
                `${p.sink.r},${p.sink.c}`
            ])
        );

        let locksAdded = 0;
        let safety = 0;
        while (locksAdded < 2 && safety < 100) {
            safety++;
            const r = Math.floor(Math.random() * this.height);
            const c = Math.floor(Math.random() * this.width);
            if (specialCells.has(`${r},${c}`)) continue;
            if (this.cells[r][c].locked) continue;
            this.cells[r][c].locked = true;
            locksAdded++;
        }
    }

    // Carve guaranteed paths depending on pair count.
    _carvePaths() {
        if (this.pairs.length === 1) {
            // Single pair: (0,0) → row 0 east → col 4 south → (4,4)
            this.forceTile(0, 0, [MASK_E]);
            this.forceTile(0, 1, [MASK_W, MASK_E]);
            this.forceTile(0, 2, [MASK_W, MASK_E]);
            this.forceTile(0, 3, [MASK_W, MASK_E]);
            this.forceTile(0, 4, [MASK_W, MASK_S]);
            this.forceTile(1, 4, [MASK_N, MASK_S]);
            this.forceTile(2, 4, [MASK_N, MASK_S]);
            this.forceTile(3, 4, [MASK_N, MASK_S]);
            this.forceTile(4, 4, [MASK_N]);
        } else {
            // Double pair (non-overlapping):
            // Pair 0: (0,0) → row 0 east → col 4 south → (2,4)
            this.forceTile(0, 0, [MASK_E]);
            this.forceTile(0, 1, [MASK_W, MASK_E]);
            this.forceTile(0, 2, [MASK_W, MASK_E]);
            this.forceTile(0, 3, [MASK_W, MASK_E]);
            this.forceTile(0, 4, [MASK_W, MASK_S]);
            this.forceTile(1, 4, [MASK_N, MASK_S]);
            this.forceTile(2, 4, [MASK_N]);

            // Pair 1: (4,4) → row 4 west → col 0 north → (2,0)
            this.forceTile(4, 4, [MASK_W]);
            this.forceTile(4, 3, [MASK_W, MASK_E]);
            this.forceTile(4, 2, [MASK_W, MASK_E]);
            this.forceTile(4, 1, [MASK_W, MASK_E]);
            this.forceTile(4, 0, [MASK_E, MASK_N]);
            this.forceTile(3, 0, [MASK_N, MASK_S]);
            this.forceTile(2, 0, [MASK_S]);
        }
    }

    forceTile(r, c, requiredMasks) {
        let bestTile = null;
        for (let i = 0; i < 50; i++) {
            const t = this.randomTile();
            const conns = t.getConnections();
            let valid = true;
            for (let m of requiredMasks) {
                if (!(conns & m)) valid = false;
            }
            if (valid) { bestTile = t; break; }
        }
        if (!bestTile) bestTile = new Tile(TILE_TYPES.CROSS, 0);
        this.cells[r][c] = bestTile;
    }

    randomTile() {
        const types = Object.values(TILE_TYPES);
        const type  = types[Math.floor(Math.random() * types.length)];
        const rot   = Math.floor(Math.random() * 4);
        return new Tile(type, rot);
    }

    shiftRow(rowIndex, moveDirection, newTile) {
        let poppedTile;
        if (moveDirection === DIRECTIONS.EAST) {
            poppedTile = this.cells[rowIndex][this.width - 1];
            for (let c = this.width - 1; c > 0; c--) {
                this.cells[rowIndex][c] = this.cells[rowIndex][c - 1];
            }
            this.cells[rowIndex][0] = newTile;
        } else if (moveDirection === DIRECTIONS.WEST) {
            poppedTile = this.cells[rowIndex][0];
            for (let c = 0; c < this.width - 1; c++) {
                this.cells[rowIndex][c] = this.cells[rowIndex][c + 1];
            }
            this.cells[rowIndex][this.width - 1] = newTile;
        }
        return poppedTile;
    }

    shiftCol(colIndex, moveDirection, newTile) {
        let poppedTile;
        if (moveDirection === DIRECTIONS.SOUTH) {
            poppedTile = this.cells[this.height - 1][colIndex];
            for (let r = this.height - 1; r > 0; r--) {
                this.cells[r][colIndex] = this.cells[r - 1][colIndex];
            }
            this.cells[0][colIndex] = newTile;
        } else if (moveDirection === DIRECTIONS.NORTH) {
            poppedTile = this.cells[0][colIndex];
            for (let r = 0; r < this.height - 1; r++) {
                this.cells[r][colIndex] = this.cells[r + 1][colIndex];
            }
            this.cells[this.height - 1][colIndex] = newTile;
        }
        return poppedTile;
    }
}

class Game {
    constructor() {
        this.boardContainer = document.getElementById('game-board');
        this.handContainer  = document.getElementById('hand-container');
        this.messageArea    = document.getElementById('message-area');

        this.difficulty = 'single';
        this.pairs = DIFFICULTIES[this.difficulty];

        this.grid = new Grid(this.pairs);
        this.hand = [];
        for (let i = 0; i < 3; i++) this.hand.push(this.grid.randomTile());

        this.isAnimating = false;
        this.isSolved    = false;
        this.history     = [];

        this.initUI();
        this.scrambleGame();
    }

    initUI() {
        document.getElementById('btn-undo').addEventListener('click',    () => this.undoMove());
        document.getElementById('btn-reset').addEventListener('click',   () => this.resetLevel());
        document.getElementById('btn-scramble').addEventListener('click', () => this.scrambleGame());
        document.getElementById('btn-single').addEventListener('click', () => this.setDifficulty('single'));
        document.getElementById('btn-double').addEventListener('click', () => this.setDifficulty('double'));
        this._updateDifficultyUI();
    }

    _updateDifficultyUI() {
        document.getElementById('btn-single').classList.toggle('active', this.difficulty === 'single');
        document.getElementById('btn-double').classList.toggle('active', this.difficulty === 'double');
    }

    setDifficulty(key) {
        if (!DIFFICULTIES[key] || this.difficulty === key) return;
        this.difficulty = key;
        this.pairs = DIFFICULTIES[key];
        this._updateDifficultyUI();
        this.scrambleGame();
    }

    resetGame() {
        this.grid = new Grid(this.pairs);
        this.hand = [];
        for (let i = 0; i < 3; i++) this.hand.push(this.grid.randomTile());
        this.isSolved = false;
        this.history  = [];
        this.messageArea.textContent = '';
        this.render();
    }

    scrambleGame() {
        this.resetGame();

        let lastMove = null;
        let moves    = 0;
        const MIN_MOVES = 30;

        while (moves < MIN_MOVES || this._anyPairConnected()) {
            const rOrC = Math.random() > 0.5;
            const idx  = Math.floor(Math.random() * GRID_SIZE);

            if (lastMove && rOrC === lastMove.isRow && idx === lastMove.idx) continue;

            // Skip locked rows/cols
            let isLocked = false;
            if (rOrC) {
                for (let c = 0; c < GRID_SIZE; c++) {
                    if (this.grid.cells[idx][c].locked) isLocked = true;
                }
            } else {
                for (let r = 0; r < GRID_SIZE; r++) {
                    if (this.grid.cells[r][idx].locked) isLocked = true;
                }
            }
            if (isLocked) continue;

            const input = this.hand[0];
            let pop, dir, isRow = false;

            if (rOrC) {
                dir  = (Math.random() > 0.5) ? DIRECTIONS.EAST : DIRECTIONS.WEST;
                pop  = this.grid.shiftRow(idx, dir, input);
                isRow = true;
            } else {
                dir = (Math.random() > 0.5) ? DIRECTIONS.SOUTH : DIRECTIONS.NORTH;
                pop = this.grid.shiftCol(idx, dir, input);
            }
            this.hand[0] = pop;
            lastMove = { isRow, idx, dir };
            moves++;

            if (moves > 100) break;
        }

        this.saveState();
        this.messageArea.textContent = 'Scrambled! Good Luck.';
        this.render();
    }

    saveState() {
        const gridState = this.grid.cells.map(row =>
            row.map(cell => ({
                type:     cell.type.name.toUpperCase(),
                rotation: cell.rotation,
                locked:   cell.locked
            }))
        );
        const handState = this.hand.map(tile => ({
            type:     tile.type.name.toUpperCase(),
            rotation: tile.rotation
        }));
        this.initialState = { grid: gridState, hand: handState };
    }

    resetLevel() {
        if (!this.initialState) return;

        for (let r = 0; r < GRID_SIZE; r++) {
            for (let c = 0; c < GRID_SIZE; c++) {
                const saved  = this.initialState.grid[r][c];
                const typeObj = TILE_TYPES[saved.type] || TILE_TYPES.STRAIGHT;
                const tile   = new Tile(typeObj, saved.rotation);
                tile.locked  = saved.locked;
                this.grid.cells[r][c] = tile;
            }
        }

        this.hand = [];
        this.initialState.hand.forEach(saved => {
            const typeObj = TILE_TYPES[saved.type] || TILE_TYPES.STRAIGHT;
            this.hand.push(new Tile(typeObj, saved.rotation));
        });

        this.isSolved = false;
        this.history  = [];
        this.messageArea.textContent = 'Level Reset.';
        this.render();
    }

    async pushMove(row, col, direction, handIndex = 0, isUndo = false) {
        if (this.isAnimating) return;
        if (this.isSolved && !isUndo) return;
        if (handIndex < 0 || handIndex >= this.hand.length) return;

        if (this.messageArea.textContent.includes('Scrambled')) {
            this.messageArea.textContent = '';
        }

        // Block locked rows/cols
        let isLocked = false;
        if (row !== null) {
            for (let c = 0; c < GRID_SIZE; c++) {
                if (this.grid.cells[row][c].locked) isLocked = true;
            }
        } else if (col !== null) {
            for (let r = 0; r < GRID_SIZE; r++) {
                if (this.grid.cells[r][col].locked) isLocked = true;
            }
        }
        if (isLocked) return;

        this.isAnimating = true;

        const inputTile = this.hand[handIndex];
        await this.animateShift(row, col, direction, inputTile);

        let poppedTile;
        if (direction === DIRECTIONS.SOUTH || direction === DIRECTIONS.NORTH) {
            poppedTile = this.grid.shiftCol(col, direction, inputTile);
        } else {
            poppedTile = this.grid.shiftRow(row, direction, inputTile);
        }

        if (!isUndo) {
            this.history.push({ row, col, direction, handIndex, poppedTile });
        }

        this.hand[handIndex] = poppedTile;
        this.isSolved = this.checkFlowConnection();

        this.render();
        this.isAnimating = false;
    }

    async undoMove() {
        if (this.isAnimating || this.history.length === 0) return;
        const lastMove   = this.history.pop();
        const { row, col, direction, handIndex } = lastMove;
        const reverseDir = (direction + 2) % 4;
        await this.pushMove(row, col, reverseDir, handIndex, true);
    }

    // BFS from a single start position; returns Set of "r,c" keys reachable.
    // blockedPositions: Set of "r,c" keys treated as walls (other pairs' markers).
    traceFlowFrom(startPos, blockedPositions = new Set()) {
        const connected = new Set();
        const visited   = new Set();
        const queue     = [startPos];
        const startKey  = `${startPos.r},${startPos.c}`;
        connected.add(startKey);
        visited.add(startKey);

        while (queue.length > 0) {
            const curr      = queue.shift();
            const currTile  = this.grid.cells[curr.r][curr.c];
            const currConns = currTile.getConnections();

            const neighbors = [
                { r: curr.r - 1, c: curr.c,     myBit: MASK_N, oppBit: MASK_S },
                { r: curr.r + 1, c: curr.c,     myBit: MASK_S, oppBit: MASK_N },
                { r: curr.r,     c: curr.c - 1, myBit: MASK_W, oppBit: MASK_E },
                { r: curr.r,     c: curr.c + 1, myBit: MASK_E, oppBit: MASK_W },
            ];

            for (const n of neighbors) {
                if (n.r < 0 || n.r >= GRID_SIZE || n.c < 0 || n.c >= GRID_SIZE) continue;
                if (!(currConns & n.myBit)) continue;
                const neighborTile = this.grid.cells[n.r][n.c];
                if (!(neighborTile.getConnections() & n.oppBit)) continue;
                const key = `${n.r},${n.c}`;
                if (blockedPositions.has(key)) continue;
                if (!visited.has(key)) {
                    visited.add(key);
                    connected.add(key);
                    queue.push({ r: n.r, c: n.c });
                }
            }
        }
        return connected;
    }

    // Returns Map<pairId, Set<string>> — one connected set per pair.
    // Each pair's BFS is blocked by the other pairs' source/sink positions.
    traceFlows() {
        const allMarkers = new Set(
            this.pairs.flatMap(p => [
                `${p.source.r},${p.source.c}`,
                `${p.sink.r},${p.sink.c}`
            ])
        );
        const results = new Map();
        for (const pair of this.pairs) {
            const blocked = new Set(allMarkers);
            blocked.delete(`${pair.source.r},${pair.source.c}`);
            blocked.delete(`${pair.sink.r},${pair.sink.c}`);
            results.set(pair.id, this.traceFlowFrom(pair.source, blocked));
        }
        return results;
    }

    // True only when every pair's sink is reachable from its source
    checkFlowConnection() {
        const flowSets = this.traceFlows();
        for (const pair of this.pairs) {
            if (!flowSets.get(pair.id).has(`${pair.sink.r},${pair.sink.c}`)) return false;
        }
        return true;
    }

    // True when at least one pair's source-sink is connected
    _anyPairConnected() {
        const flowSets = this.traceFlows();
        for (const pair of this.pairs) {
            if (flowSets.get(pair.id).has(`${pair.sink.r},${pair.sink.c}`)) return true;
        }
        return false;
    }

    async animateShift(row, col, direction, inputTile) {
        const children      = Array.from(this.boardContainer.children);
        const movingElements = [];
        const moveDist      = 60 + 4; // cellSize + gap

        if (row !== null) {
            const visualRow = row + 1;
            for (let c = 1; c <= 5; c++) movingElements.push(children[visualRow * 7 + c]);
        } else {
            const visualCol = col + 1;
            for (let r = 1; r <= 5; r++) movingElements.push(children[r * 7 + visualCol]);
        }

        const newEl = this.createTileElement(inputTile);
        newEl.classList.add('sliding');

        let startR, startC, transX = 0, transY = 0;
        if      (direction === DIRECTIONS.EAST)  { startR = row + 1; startC = 0; transX =  moveDist; }
        else if (direction === DIRECTIONS.WEST)  { startR = row + 1; startC = 6; transX = -moveDist; }
        else if (direction === DIRECTIONS.SOUTH) { startR = 0; startC = col + 1; transY =  moveDist; }
        else if (direction === DIRECTIONS.NORTH) { startR = 6; startC = col + 1; transY = -moveDist; }

        newEl.style.gridRowStart    = startR + 1;
        newEl.style.gridColumnStart = startC + 1;
        this.boardContainer.appendChild(newEl);
        movingElements.push(newEl);

        newEl.offsetHeight; // force reflow

        movingElements.forEach(el => {
            el.classList.add('sliding');
            el.style.transform = `translate(${transX}px, ${transY}px)`;
        });

        await delay(300);
    }

    render() {
        this.renderGrid();
        this.renderHand();
    }

    renderHand() {
        this.handContainer.innerHTML = '';
        this.hand.forEach((tile, index) => {
            const tileView = this.createTileElement(tile);
            tileView.classList.add('hand-tile');
            tileView.draggable = true;
            tileView.dataset.handIndex = index;

            tileView.addEventListener('dragstart', (e) => {
                e.dataTransfer.setData('text/plain', index);
                e.dataTransfer.effectAllowed = 'move';
                setTimeout(() => tileView.classList.add('dragging'), 0);
            });
            tileView.addEventListener('dragend', () => {
                tileView.classList.remove('dragging');
            });

            this.handContainer.appendChild(tileView);
        });
    }

    createTileElement(tile) {
        const el    = document.createElement('div');
        el.className = 'cell';
        const conns = tile.getConnections();

        const center = document.createElement('div');
        center.className = 'pipe pipe-center';
        el.appendChild(center);

        if (conns & MASK_N) this.addPipeArm(el, 'top');
        if (conns & MASK_E) this.addPipeArm(el, 'right');
        if (conns & MASK_S) this.addPipeArm(el, 'bottom');
        if (conns & MASK_W) this.addPipeArm(el, 'left');

        return el;
    }

    addPipeArm(parent, classDir) {
        const arm = document.createElement('div');
        arm.className = `pipe pipe-arm ${classDir}`;
        parent.appendChild(arm);
    }

    renderGrid() {
        this.boardContainer.innerHTML = '';

        // Compute per-pair flow sets once; build a "r,c" → color lookup
        const flowSets     = this.traceFlows();
        const cellFlowColor = new Map();
        for (const pair of this.pairs) {
            for (const key of flowSets.get(pair.id)) {
                cellFlowColor.set(key, pair.color);
            }
        }

        for (let r = 0; r < 7; r++) {
            for (let c = 0; c < 7; c++) {
                const isEdgeRow = (r === 0 || r === 6);
                const isEdgeCol = (c === 0 || c === 6);

                if (isEdgeRow && isEdgeCol) {
                    // Corner — empty placeholder
                    const div = document.createElement('div');
                    div.style.gridRowStart    = r + 1;
                    div.style.gridColumnStart = c + 1;
                    this.boardContainer.appendChild(div);

                } else if (isEdgeRow) {
                    // Top/Bottom push buttons
                    const btn   = document.createElement('button');
                    btn.className = 'control-btn';
                    const dir   = (r === 0) ? DIRECTIONS.SOUTH : DIRECTIONS.NORTH;
                    btn.textContent = (r === 0) ? '⬇' : '⬆';
                    btn.style.gridRowStart    = r + 1;
                    btn.style.gridColumnStart = c + 1;
                    this.addDragEvents(btn, null, c - 1, dir);
                    this.boardContainer.appendChild(btn);

                } else if (isEdgeCol) {
                    // Left/Right push buttons
                    const btn   = document.createElement('button');
                    btn.className = 'control-btn';
                    const dir   = (c === 0) ? DIRECTIONS.EAST : DIRECTIONS.WEST;
                    btn.textContent = (c === 0) ? '➡' : '⬅';
                    btn.style.gridRowStart    = r + 1;
                    btn.style.gridColumnStart = c + 1;
                    this.addDragEvents(btn, r - 1, null, dir);
                    this.boardContainer.appendChild(btn);

                } else {
                    // Inner grid cell
                    const gridR = r - 1;
                    const gridC = c - 1;
                    const tile  = this.grid.cells[gridR][gridC];
                    const el    = this.createTileElement(tile);

                    if (tile.locked) el.classList.add('locked');
                    el.style.gridRowStart    = r + 1;
                    el.style.gridColumnStart = c + 1;

                    // Apply per-pair flow color to active pipes
                    const flowColor = cellFlowColor.get(`${gridR},${gridC}`);
                    if (flowColor) {
                        el.querySelectorAll('.pipe').forEach(p => {
                            p.style.setProperty('--pipe-active', flowColor);
                            p.classList.add('flow-active');
                        });
                    }

                    this.boardContainer.appendChild(el);
                }
            }
        }

        // Render source (circle) and sink (diamond) markers for each pair
        for (const pair of this.pairs) {
            const sourceMarker = document.createElement('div');
            sourceMarker.className = 'marker source';
            sourceMarker.style.color           = pair.color;
            sourceMarker.style.gridRowStart    = pair.source.r + 2;
            sourceMarker.style.gridColumnStart = pair.source.c + 2;
            this.boardContainer.appendChild(sourceMarker);

            const sinkMarker = document.createElement('div');
            sinkMarker.className = 'marker sink';
            sinkMarker.style.color           = pair.color;
            sinkMarker.style.gridRowStart    = pair.sink.r + 2;
            sinkMarker.style.gridColumnStart = pair.sink.c + 2;
            this.boardContainer.appendChild(sinkMarker);
        }
    }

    addDragEvents(target, row, col, dir) {
        target.addEventListener('dragover', (e) => {
            e.preventDefault();
            target.classList.add('drag-over');
        });
        target.addEventListener('dragleave', () => {
            target.classList.remove('drag-over');
        });
        target.addEventListener('drop', (e) => {
            e.preventDefault();
            target.classList.remove('drag-over');
            const handIndex = parseInt(e.dataTransfer.getData('text/plain'));
            if (!isNaN(handIndex)) this.pushMove(row, col, dir, handIndex);
        });
    }
}

// Start Game
const app = new Game();
