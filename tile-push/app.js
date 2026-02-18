
// Tile Push Puzzle - Core Logic

// -- Constants --
const GRID_SIZE = 5;
const TILE_TYPES = {
    STRAIGHT: { name: 'straight', connections: 0b0101 }, // N-S (1 | 4) = 5
    CORNER: { name: 'corner', connections: 0b0011 }, // N-E (1 | 2) = 3
    T_SHAPE: { name: 't_shape', connections: 0b0111 }, // N-E-S (1 | 2 | 4) = 7
    CROSS: { name: 'cross', connections: 0b1111 }, // N-E-S-W (1 | 2 | 4 | 8) = 15
};

const DIRECTIONS = {
    NORTH: 0,
    EAST: 1,
    SOUTH: 2,
    WEST: 3
};

// Bitmasks: N=1, E=2, S=4, W=8
const MASK_N = 1;
const MASK_E = 2;
const MASK_S = 4;
const MASK_W = 8;

const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

class Tile {
    constructor(typeObj, rotation = 0) {
        this.type = typeObj;
        this.rotation = rotation; // 0, 1, 2, 3 (x 90deg)
    }

    // Get effective connections after rotation
    getConnections() {
        let conns = this.type.connections;
        // Rotate bits: shift left, wrap around 8->1
        for (let i = 0; i < this.rotation; i++) {
            // (conns << 1) & 15 | ((conns & 8) ? 1 : 0)
            conns = ((conns << 1) & 0b1111) | ((conns & 0b1000) >> 3);
        }
        return conns;
    }

    clone() {
        return new Tile(this.type, this.rotation);
    }
}

class Grid {
    constructor(sourcePos, sinkPos) {
        this.width = GRID_SIZE;
        this.height = GRID_SIZE;
        this.cells = []; // 5x5 array
        this.source = sourcePos; // {r, c}
        this.sink = sinkPos;     // {r, c}

        this.initSolvable();
    }

    initSolvable() {
        this.cells = [];
        // 1. Fill with random background noise (Straight/Corner/T/Cross)
        for (let r = 0; r < this.height; r++) {
            const row = [];
            for (let c = 0; c < this.width; c++) {
                row.push(this.randomTile());
            }
            this.cells.push(row);
        }

        // 2. Carve a guaranteed path
        // Simple L-shape: (0,0) -> (0,4) -> (4,4)
        // Path: (0,0)-(0,1)-(0,2)-(0,3)-(0,4)-(1,4)-(2,4)-(3,4)-(4,4)

        // (0,0): Start. Needs East.
        this.forceTile(0, 0, [MASK_E]);

        // Top Row (0,1 to 0,3): West-East
        for (let c = 1; c <= 3; c++) this.forceTile(0, c, [MASK_W, MASK_E]);

        // Corner (0,4): West-South
        this.forceTile(0, 4, [MASK_W, MASK_S]);

        // Right Col (1,4 to 3,4): North-South
        for (let r = 1; r <= 3; r++) this.forceTile(r, 4, [MASK_N, MASK_S]);

        // Sink (4,4): North.
        this.forceTile(4, 4, [MASK_N]);
    }

    forceTile(r, c, requiredMasks) {
        // Find a random tile type/rotation that satisfies requirements
        let bestTile = null;

        for (let i = 0; i < 50; i++) {
            const t = this.randomTile();
            const conns = t.getConnections();
            let valid = true;
            for (let m of requiredMasks) {
                if (!(conns & m)) valid = false;
            }
            if (valid) {
                bestTile = t;
                break;
            }
        }

        // Fallback
        if (!bestTile) {
            let mask = 0;
            requiredMasks.forEach(m => mask |= m);
            bestTile = new Tile(TILE_TYPES.CROSS, 0);
        }

        this.cells[r][c] = bestTile;
    }

    randomTile() {
        const types = Object.values(TILE_TYPES);
        const type = types[Math.floor(Math.random() * types.length)];
        const rot = Math.floor(Math.random() * 4);
        return new Tile(type, rot);
    }

    // Shift Row: direction is where the items MOVE
    shiftRow(rowIndex, moveDirection, newTile) {
        let poppedTile;
        if (moveDirection === DIRECTIONS.EAST) {
            // Push Right: [0]->[1], [1]->[2]...
            poppedTile = this.cells[rowIndex][this.width - 1];
            for (let c = this.width - 1; c > 0; c--) {
                this.cells[rowIndex][c] = this.cells[rowIndex][c - 1];
            }
            this.cells[rowIndex][0] = newTile;
        } else if (moveDirection === DIRECTIONS.WEST) {
            // Push Left
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
            // Push Down
            poppedTile = this.cells[this.height - 1][colIndex];
            for (let r = this.height - 1; r > 0; r--) {
                this.cells[r][colIndex] = this.cells[r - 1][colIndex];
            }
            this.cells[0][colIndex] = newTile;
        } else if (moveDirection === DIRECTIONS.NORTH) {
            // Push Up
            poppedTile = this.cells[0][colIndex];
            for (let r = 0; r < this.height - 1; r++) {
                this.cells[r][colIndex] = this.cells[r + 1][colIndex];
            }
            this.cells[this.height - 1][colIndex] = newTile;
        }
        return poppedTile;
    }

    // Check connectivity from Source to Sink
    checkWin() {
        const visited = new Set();
        const queue = [this.source]; // {r,c}
        const startKey = `${this.source.r},${this.source.c}`;
        visited.add(startKey);

        while (queue.length > 0) {
            const curr = queue.shift();

            // Check if we reached sink AND Sink tile connects to flow
            if (curr.r === this.sink.r && curr.c === this.sink.c) {
                return true;
            }

            const currTile = this.cells[curr.r][curr.c];
            const currConns = currTile.getConnections();

            // Check neighbors
            const neighbors = [
                { r: curr.r - 1, c: curr.c, dir: DIRECTIONS.NORTH, myBit: MASK_N, oppBit: MASK_S },
                { r: curr.r + 1, c: curr.c, dir: DIRECTIONS.SOUTH, myBit: MASK_S, oppBit: MASK_N },
                { r: curr.r, c: curr.c - 1, dir: DIRECTIONS.WEST, myBit: MASK_W, oppBit: MASK_E },
                { r: curr.r, c: curr.c + 1, dir: DIRECTIONS.EAST, myBit: MASK_E, oppBit: MASK_W },
            ];

            for (let n of neighbors) {
                if (n.r >= 0 && n.r < this.height && n.c >= 0 && n.c < this.width) {
                    if (currConns & n.myBit) {
                        const neighborTile = this.cells[n.r][n.c];
                        if (neighborTile.getConnections() & n.oppBit) {
                            const key = `${n.r},${n.c}`;
                            if (!visited.has(key)) {
                                visited.add(key);
                                queue.push({ r: n.r, c: n.c });
                            }
                        }
                    }
                }
            }
        }
        return false;
    }
}

class Game {
    constructor() {
        this.boardContainer = document.getElementById('game-board');
        this.handContainer = document.getElementById('hand-container');
        this.messageArea = document.getElementById('message-area');

        // Fixed positions
        this.sourcePos = { r: 0, c: 0 };
        this.sinkPos = { r: 4, c: 4 };

        this.grid = new Grid(this.sourcePos, this.sinkPos);

        // Hand now holds 3 tiles
        this.hand = [];
        for (let i = 0; i < 3; i++) {
            this.hand.push(this.grid.randomTile());
        }


        this.isAnimating = false;
        this.isSolved = false;

        this.initUI();
        this.scrambleGame();
    }

    initUI() {
        document.getElementById('btn-reset').addEventListener('click', () => this.resetLevel());
        document.getElementById('btn-scramble').addEventListener('click', () => this.scrambleGame());
    }

    resetGame() {
        this.grid.initSolvable();
        this.hand = [];
        for (let i = 0; i < 3; i++) {
            this.hand.push(this.grid.randomTile());
        }
        this.isSolved = false;
        this.messageArea.textContent = "";
        this.render();
    }

    scrambleGame() {
        // 1. Create a new random solvable state
        this.resetGame();

        // 2. Perform random pushes to scramble
        for (let i = 0; i < 30; i++) {
            const rOrC = Math.random() > 0.5;
            const idx = Math.floor(Math.random() * GRID_SIZE);
            const input = this.hand[0];
            let pop;

            if (rOrC) {
                const dir = (Math.random() > 0.5) ? DIRECTIONS.EAST : DIRECTIONS.WEST;
                pop = this.grid.shiftRow(idx, dir, input);
            } else {
                const dir = (Math.random() > 0.5) ? DIRECTIONS.SOUTH : DIRECTIONS.NORTH;
                pop = this.grid.shiftCol(idx, dir, input);
            }
            this.hand[0] = pop;
        }

        // 3. Save this state as the "Initial State" for this level
        this.saveState();

        this.messageArea.textContent = "Scrambled! Good Luck.";
        this.render();
    }

    saveState() {
        // Serialize Grid: Save type name and rotation
        const gridState = this.grid.cells.map(row =>
            row.map(cell => ({
                type: cell.type.name.toUpperCase(), // Store key for TILE_TYPES
                rotation: cell.rotation
            }))
        );

        // Serialize Hand
        const handState = this.hand.map(tile => ({
            type: tile.type.name.toUpperCase(),
            rotation: tile.rotation
        }));

        this.initialState = {
            grid: gridState,
            hand: handState
        };
    }

    resetLevel() {
        if (!this.initialState) return;

        // Restore Grid
        for (let r = 0; r < GRID_SIZE; r++) {
            for (let c = 0; c < GRID_SIZE; c++) {
                const saved = this.initialState.grid[r][c];
                // TILE_TYPES keys: STRAIGHT, CORNER, T_SHAPE, CROSS
                // We stored name: 'straight', etc. Need to map back or store keys.
                // Let's rely on name matching or just store the TILE_TYPES key.
                // Correction: In saveState I will store the TILE_TYPES key (e.g. 'STRAIGHT').
                // But cell.type.name is lowercase 'straight'. 
                // Let's fix saveState to find the key.
                const typeObj = TILE_TYPES[saved.type] || TILE_TYPES.STRAIGHT;
                this.grid.cells[r][c] = new Tile(typeObj, saved.rotation);
            }
        }

        // Restore Hand
        this.hand = [];
        this.initialState.hand.forEach(saved => {
            const typeObj = TILE_TYPES[saved.type] || TILE_TYPES.STRAIGHT;
            this.hand.push(new Tile(typeObj, saved.rotation));
        });

        this.isSolved = false;
        this.messageArea.textContent = "Level Reset.";
        this.render();
    }

    async pushMove(row, col, direction, handIndex = 0) {
        if (this.isAnimating) return;

        // Validate handIndex
        if (handIndex < 0 || handIndex >= this.hand.length) return;

        // Clear message if it was just "Scrambled!"
        if (this.messageArea.textContent.includes("Scrambled")) {
            this.messageArea.textContent = "";
        }

        this.isAnimating = true;

        // 1. Animate
        // We peek at the incoming tile (hand[handIndex]) for the visual
        const inputTile = this.hand[handIndex];

        // TODO: Animate the specific tile from hand to the edge?
        // For now, simple slide from edge is fine.
        await this.animateShift(row, col, direction, inputTile);

        // 2. Logic Update
        // Actually perform the shift
        let poppedTile;

        if (direction === DIRECTIONS.SOUTH || direction === DIRECTIONS.NORTH) {
            poppedTile = this.grid.shiftCol(col, direction, inputTile);
        } else {
            poppedTile = this.grid.shiftRow(row, direction, inputTile);
        }

        // RECYCLE: Popped tile goes to the emptied hand slot
        this.hand[handIndex] = poppedTile;

        // Check connection for Lock
        if (this.checkFlowConnection()) {
            this.isSolved = true;
        }

        this.render();
        this.isAnimating = false;
    }

    // New method to check if Source connects to Sink using traceFlow
    checkFlowConnection() {
        // We can reuse traceFlow to see if Sink is in the connected set
        const connectedSet = this.traceFlow();
        const sinkKey = `${this.sinkPos.r},${this.sinkPos.c}`;
        // But we also need to ensure the Sink Tile *itself* connects back to the Flow?
        // traceFlow handles connectivity. If sink is in set, it's connected.
        return connectedSet.has(sinkKey);
    }

    async animateShift(row, col, direction, inputTile) {
        // Gather the 5 DOM elements for this row/col
        // Grid is 7x7. Inner 5x5 starts at index 1.
        // Board children: 0..48.
        // inner (r, c) maps to visual (r+1, c+1)

        const children = Array.from(this.boardContainer.children);
        const movingElements = [];
        const gap = 4; // match CSS
        const cellSize = 60; // match CSS
        const moveDist = cellSize + gap;

        // Calculate visual indices
        if (row !== null) {
            // Row shift. Row index 'row' (0..4) -> Visual Row constant = row + 1
            // Columns 1..5 are the tiles.
            const visualRow = row + 1;
            for (let c = 1; c <= 5; c++) {
                const idx = visualRow * 7 + c;
                movingElements.push(children[idx]);
            }
        } else {
            // Col shift. Col index 'col' (0..4) -> Visual Col constant = col + 1
            const visualCol = col + 1;
            for (let r = 1; r <= 5; r++) {
                const idx = r * 7 + visualCol;
                movingElements.push(children[idx]);
            }
        }

        // Create the "Entering" tile visually
        const newEl = this.createTileElement(inputTile);
        newEl.classList.add('sliding'); // ensure z-index

        // Determine start position for newEl
        // It should be placed in the button slot from where it enters
        let startR, startC;
        let transX = 0, transY = 0;

        if (direction === DIRECTIONS.EAST) {
            // Enters from Left (Col 0), moves Right
            startR = row + 1; startC = 0;
            transX = moveDist;
        } else if (direction === DIRECTIONS.WEST) {
            // Enters from Right (Col 6), moves Left
            startR = row + 1; startC = 6;
            transX = -moveDist;
        } else if (direction === DIRECTIONS.SOUTH) {
            // Enters from Top (Row 0), moves Down
            startR = 0; startC = col + 1;
            transY = moveDist;
        } else if (direction === DIRECTIONS.NORTH) {
            // Enters from Bottom (Row 6), moves Up
            startR = 6; startC = col + 1;
            transY = -moveDist;
        }

        // Position newEl on grid
        // CSS Grid lines are 1-based. Slot (r,c) 0-based -> Grid Line r+1 / c+1
        newEl.style.gridRowStart = startR + 1;
        newEl.style.gridColumnStart = startC + 1;

        this.boardContainer.appendChild(newEl);
        movingElements.push(newEl);

        // Force Reflow
        newEl.offsetHeight;

        // Apply Transition
        movingElements.forEach(el => {
            el.classList.add('sliding');
            el.style.transform = `translate(${transX}px, ${transY}px)`;
        });

        // Wait for animation
        await delay(300);

        // No cleanup needed: render() will clear boardContainer immediately after
    }

    render() {
        this.renderGrid();
        this.renderHand();
    }

    // Traverse from Source and return Set of "r,c" that are connected
    traceFlow() {
        const connected = new Set();
        const queue = [this.sourcePos]; // {r,c}
        const startKey = `${this.sourcePos.r},${this.sourcePos.c}`;
        connected.add(startKey);

        const visited = new Set();
        visited.add(startKey);

        while (queue.length > 0) {
            const curr = queue.shift();
            const currTile = this.grid.cells[curr.r][curr.c];
            const currConns = currTile.getConnections();

            // Check neighbors
            const neighbors = [
                { r: curr.r - 1, c: curr.c, dir: DIRECTIONS.NORTH, myBit: MASK_N, oppBit: MASK_S },
                { r: curr.r + 1, c: curr.c, dir: DIRECTIONS.SOUTH, myBit: MASK_S, oppBit: MASK_N },
                { r: curr.r, c: curr.c - 1, dir: DIRECTIONS.WEST, myBit: MASK_W, oppBit: MASK_E },
                { r: curr.r, c: curr.c + 1, dir: DIRECTIONS.EAST, myBit: MASK_E, oppBit: MASK_W },
            ];

            for (let n of neighbors) {
                // Bounds check
                if (n.r >= 0 && n.r < GRID_SIZE && n.c >= 0 && n.c < GRID_SIZE) {
                    // Check if current tile connects to neighbor
                    if (currConns & n.myBit) {
                        const neighborTile = this.grid.cells[n.r][n.c];
                        // Check if neighbor connects back
                        if (neighborTile.getConnections() & n.oppBit) {
                            const key = `${n.r},${n.c}`;
                            if (!visited.has(key)) {
                                visited.add(key);
                                connected.add(key);
                                queue.push({ r: n.r, c: n.c });
                            }
                        }
                    }
                }
            }
        }
        return connected;
    }

    renderHand() {
        this.handContainer.innerHTML = '';

        this.hand.forEach((tile, index) => {
            const tileView = this.createTileElement(tile);
            tileView.classList.add('hand-tile');
            // Make draggable
            tileView.draggable = true;
            tileView.dataset.handIndex = index;

            // Drag Events
            tileView.addEventListener('dragstart', (e) => {
                e.dataTransfer.setData('text/plain', index);
                e.dataTransfer.effectAllowed = 'move';
                // Add class for visual feedback if needed
                setTimeout(() => tileView.classList.add('dragging'), 0);
            });

            tileView.addEventListener('dragend', () => {
                tileView.classList.remove('dragging');
            });

            this.handContainer.appendChild(tileView);
        });
    }

    createTileElement(tile) {
        const el = document.createElement('div');
        el.className = 'cell';

        // Render pipes
        const conns = tile.getConnections();

        // Center piece
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

        for (let r = 0; r < 7; r++) {
            for (let c = 0; c < 7; c++) {
                const isEdgeRow = (r === 0 || r === 6);
                const isEdgeCol = (c === 0 || c === 6);

                if (isEdgeRow && isEdgeCol) {
                    // Corner - empty
                    const div = document.createElement('div');
                    this.boardContainer.appendChild(div);
                    div.style.gridRowStart = r + 1;
                    div.style.gridColumnStart = c + 1;
                } else if (isEdgeRow) {
                    // Top/Bottom Buttons
                    const btn = document.createElement('button');
                    btn.className = 'control-btn';
                    const dir = (r === 0) ? DIRECTIONS.SOUTH : DIRECTIONS.NORTH;
                    const arrow = (r === 0) ? '⬇' : '⬆';
                    btn.textContent = arrow;

                    btn.style.gridRowStart = r + 1;
                    btn.style.gridColumnStart = c + 1;

                    const gridCol = c - 1;
                    // Click removed to enforce Drag & Drop
                    // btn.onclick = () => this.pushMove(null, gridCol, dir);

                    // Drag & Drop
                    this.addDragEvents(btn, null, gridCol, dir);

                    this.boardContainer.appendChild(btn);
                } else if (isEdgeCol) {
                    // Left/Right Buttons
                    const btn = document.createElement('button');
                    btn.className = 'control-btn';
                    const dir = (c === 0) ? DIRECTIONS.EAST : DIRECTIONS.WEST;
                    const arrow = (c === 0) ? '➡' : '⬅';
                    btn.textContent = arrow;

                    btn.style.gridRowStart = r + 1;
                    btn.style.gridColumnStart = c + 1;

                    const gridRow = r - 1;
                    // Click removed to enforce Drag & Drop
                    // btn.onclick = () => this.pushMove(gridRow, null, dir);

                    // Drag & Drop
                    this.addDragEvents(btn, gridRow, null, dir);

                    this.boardContainer.appendChild(btn);
                } else {
                    // Grid Cell
                    const gridR = r - 1;
                    const gridC = c - 1;
                    const tile = this.grid.cells[gridR][gridC];
                    const el = this.createTileElement(tile);

                    el.style.gridRowStart = r + 1;
                    el.style.gridColumnStart = c + 1;

                    // Apply Glow if part of active flow
                    const connectedSet = this.traceFlow();
                    if (connectedSet.has(`${gridR},${gridC}`)) {
                        const pipes = el.querySelectorAll('.pipe');
                        pipes.forEach(p => p.classList.add('flow-active'));
                    }



                    this.boardContainer.appendChild(el);
                }
            }
        }

        // Add Source/Sink markers (Fixed positions, overlay)
        // Source: (0,0) -> Grid (2,2)
        const sourceMarker = document.createElement('div');
        sourceMarker.className = 'marker source';
        sourceMarker.style.gridRowStart = 2;
        sourceMarker.style.gridColumnStart = 2;
        this.boardContainer.appendChild(sourceMarker);

        // Sink: (4,4) -> Grid (6,6)
        const sinkMarker = document.createElement('div');
        sinkMarker.className = 'marker sink';
        sinkMarker.style.gridRowStart = 6;
        sinkMarker.style.gridColumnStart = 6;
        this.boardContainer.appendChild(sinkMarker);
    }

    addDragEvents(target, row, col, dir) {
        target.addEventListener('dragover', (e) => {
            e.preventDefault(); // Allow drop
            target.classList.add('drag-over');
        });

        target.addEventListener('dragleave', () => {
            target.classList.remove('drag-over');
        });

        target.addEventListener('drop', (e) => {
            e.preventDefault();
            target.classList.remove('drag-over');
            const handIndex = parseInt(e.dataTransfer.getData('text/plain'));
            if (!isNaN(handIndex)) {
                this.pushMove(row, col, dir, handIndex);
            }
        });
    }
}

// Start Game
const app = new Game();
