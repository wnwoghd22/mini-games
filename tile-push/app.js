
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
        this.hand = [this.grid.randomTile()];

        this.initUI();
        this.scrambleGame();
    }

    initUI() {
        document.getElementById('btn-reset').addEventListener('click', () => {
            // Reset just reloads the scramble? Or sets to solved?
            // "Reset Level" usually means go to initial state of THIS level.
            // But we generate random levels.
            // Let's make reset = New Game / Scramble.
            this.scrambleGame();
        });
        document.getElementById('btn-scramble').addEventListener('click', () => this.scrambleGame());
    }

    resetGame() {
        this.grid.initSolvable();
        this.hand = [this.grid.randomTile()];
        this.messageArea.textContent = "";
        this.render();
    }

    scrambleGame() {
        // Start from solved state
        this.resetGame();

        // Perform random pushes to scramble
        // NOTE: We must update the grid AND the hand.
        for (let i = 0; i < 30; i++) {
            const rOrC = Math.random() > 0.5;
            const idx = Math.floor(Math.random() * GRID_SIZE);
            const input = this.hand.shift();
            let pop;

            if (rOrC) {
                // Shift ROW
                // Directions for Row Shift: EAST (Right) or WEST (Left)
                const dir = (Math.random() > 0.5) ? DIRECTIONS.EAST : DIRECTIONS.WEST;
                pop = this.grid.shiftRow(idx, dir, input);
            } else {
                // Shift COL
                // Directions for Col Shift: SOUTH (Down) or NORTH (Up)
                const dir = (Math.random() > 0.5) ? DIRECTIONS.SOUTH : DIRECTIONS.NORTH;
                pop = this.grid.shiftCol(idx, dir, input);
            }
            this.hand.push(pop);
        }
        this.messageArea.textContent = "Scrambled! Good Luck.";
        this.render();
    }

    pushMove(row, col, direction) {
        // Clear message if it was just "Scrambled!"
        if (this.messageArea.textContent.includes("Scrambled")) {
            this.messageArea.textContent = "";
        }

        const inputTile = this.hand.shift();
        let poppedTile;

        if (direction === DIRECTIONS.SOUTH || direction === DIRECTIONS.NORTH) {
            poppedTile = this.grid.shiftCol(col, direction, inputTile);
        } else {
            poppedTile = this.grid.shiftRow(row, direction, inputTile);
        }

        this.hand.push(poppedTile);

        if (this.grid.checkWin()) {
            this.messageArea.textContent = "CONNECTED! FLOW STABLE.";
            // Can add visual flair here
        }

        this.render();
    }

    render() {
        this.renderGrid();
        this.renderHand();
    }

    renderHand() {
        this.handContainer.innerHTML = '';
        const tileView = this.createTileElement(this.hand[0]);
        this.handContainer.appendChild(tileView);
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
                } else if (isEdgeRow) {
                    // Top/Bottom Buttons
                    const btn = document.createElement('button');
                    btn.className = 'control-btn';
                    const dir = (r === 0) ? DIRECTIONS.SOUTH : DIRECTIONS.NORTH;
                    const arrow = (r === 0) ? '⬇' : '⬆';
                    btn.textContent = arrow;

                    const gridCol = c - 1;
                    btn.onclick = () => this.pushMove(null, gridCol, dir);

                    this.boardContainer.appendChild(btn);
                } else if (isEdgeCol) {
                    // Left/Right Buttons
                    const btn = document.createElement('button');
                    btn.className = 'control-btn';
                    const dir = (c === 0) ? DIRECTIONS.EAST : DIRECTIONS.WEST;
                    const arrow = (c === 0) ? '➡' : '⬅';
                    btn.textContent = arrow;

                    const gridRow = r - 1;
                    btn.onclick = () => this.pushMove(gridRow, null, dir);

                    this.boardContainer.appendChild(btn);
                } else {
                    // Grid Cell
                    const gridR = r - 1;
                    const gridC = c - 1;
                    const tile = this.grid.cells[gridR][gridC];
                    const el = this.createTileElement(tile);

                    // Add Source/Sink markers
                    if (gridR === this.sourcePos.r && gridC === this.sourcePos.c) {
                        const marker = document.createElement('div');
                        marker.className = 'marker source';
                        el.appendChild(marker);
                    }
                    if (gridR === this.sinkPos.r && gridC === this.sinkPos.c) {
                        const marker = document.createElement('div');
                        marker.className = 'marker sink';
                        el.appendChild(marker);
                    }

                    this.boardContainer.appendChild(el);
                }
            }
        }
    }
}

// Start Game
const app = new Game();
