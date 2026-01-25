/**
 * Infinite Dice Roll
 * Core Game Logic
 */

// ChunkCache for storing generated map chunks
class ChunkCache {
    constructor() {
        this.chunks = new Map();
        this.lastRowPositions = new Map(); // Store last row X positions for each chunk
        this.maxSize = 10; // Keep last 10 chunks
    }

    getChunk(startY) {
        return this.chunks.get(startY);
    }

    addChunk(chunk) {
        this.chunks.set(chunk.start_y, chunk);

        // Store last row positions for connectivity
        const lastY = chunk.end_y - 1;
        const lastRowTiles = chunk.tiles.filter(t => t.y === lastY);
        const lastRowXPositions = lastRowTiles.map(t => t.x);
        this.lastRowPositions.set(chunk.start_y, lastRowXPositions);

        // Remove old chunks if cache is too large
        if (this.chunks.size > this.maxSize) {
            const oldestKey = Math.min(...this.chunks.keys());
            this.chunks.delete(oldestKey);
            this.lastRowPositions.delete(oldestKey);
        }
    }

    getLastRowPositions(startY) {
        return this.lastRowPositions.get(startY) || [];
    }

    clear() {
        this.chunks.clear();
        this.lastRowPositions.clear();
    }
}

const TILE_SIZE = 60;
const TILE_GAP = 4;
const STEP_SIZE = TILE_SIZE + TILE_GAP;
const GRID_SIZE = 7; // Keep it odd to center easily
const MOVE_SPEED = 200; // ms per move
const SCROLL_SPEED = 1000; // ms per grid shift (initial)

// Initial axis state mapping (match3dice approach)
// Maps axis direction labels to dice face numbers
const INITIAL_AXIS_STATE = {
    'U': 1,  // Up = 1
    'D': 6,  // Down = 6
    'F': 2,  // Front = 2
    'B': 5,  // Back = 5
    'R': 3,  // Right = 3
    'L': 4   // Left = 4
};

// --- Minimal Quaternion helpers (column-major convention for CSS matrix) ---
const quatIdentity = () => ({ x: 0, y: 0, z: 0, w: 1 });
const quatNormalize = (q) => {
    const len = Math.hypot(q.x, q.y, q.z, q.w);
    if (!len) return quatIdentity();
    return { x: q.x / len, y: q.y / len, z: q.z / len, w: q.w / len };
};
const quatMultiply = (a, b) => ({
    w: a.w * b.w - a.x * b.x - a.y * b.y - a.z * b.z,
    x: a.w * b.x + a.x * b.w + a.y * b.z - a.z * b.y,
    y: a.w * b.y - a.x * b.z + a.y * b.w + a.z * b.x,
    z: a.w * b.z + a.x * b.y - a.y * b.x + a.z * b.w,
});
const quatConjugate = (q) => ({ x: -q.x, y: -q.y, z: -q.z, w: q.w });

// Rotate a vector by a quaternion using q * v * q^(-1)
const rotateVectorByQuat = (vec, quat) => {
    const vecQuat = { x: vec.x, y: vec.y, z: vec.z, w: 0 };
    const qInv = quatConjugate(quat);
    const temp = quatMultiply(quat, vecQuat);
    const result = quatMultiply(temp, qInv);
    return { x: result.x, y: result.y, z: result.z };
};

const quatFromAxisAngle = (axis, angleRad) => {
    const half = angleRad / 2;
    const s = Math.sin(half);
    return quatNormalize({
        x: axis.x * s,
        y: axis.y * s,
        z: axis.z * s,
        w: Math.cos(half),
    });
};
const quatSlerp = (a, b, t) => {
    let cosom = a.x * b.x + a.y * b.y + a.z * b.z + a.w * b.w;
    let end = b;
    if (cosom < 0) {
        cosom = -cosom;
        end = { x: -b.x, y: -b.y, z: -b.z, w: -b.w };
    }

    let scale0, scale1;
    if (1 - cosom > 1e-6) {
        const omega = Math.acos(cosom);
        const sinom = Math.sin(omega);
        scale0 = Math.sin((1 - t) * omega) / sinom;
        scale1 = Math.sin(t * omega) / sinom;
    } else {
        scale0 = 1 - t;
        scale1 = t;
    }

    return quatNormalize({
        x: scale0 * a.x + scale1 * end.x,
        y: scale0 * a.y + scale1 * end.y,
        z: scale0 * a.z + scale1 * end.z,
        w: scale0 * a.w + scale1 * end.w,
    });
};
const matrixFromQuatAndPos = (q, pos) => {
    const x2 = q.x + q.x;
    const y2 = q.y + q.y;
    const z2 = q.z + q.z;
    const xx = q.x * x2;
    const yy = q.y * y2;
    const zz = q.z * z2;
    const xy = q.x * y2;
    const xz = q.x * z2;
    const yz = q.y * z2;
    const wx = q.w * x2;
    const wy = q.w * y2;
    const wz = q.w * z2;

    const m11 = 1 - (yy + zz);
    const m12 = xy - wz;
    const m13 = xz + wy;
    const m21 = xy + wz;
    const m22 = 1 - (xx + zz);
    const m23 = yz - wx;
    const m31 = xz - wy;
    const m32 = yz + wx;
    const m33 = 1 - (xx + yy);

    return [
        m11, m12, m13, 0,
        m21, m22, m23, 0,
        m31, m32, m33, 0,
        pos.x, pos.y, pos.z, 1
    ];
};

class Game {
    constructor() {
        this.grid = [];
        this.player = null;
        this.score = 0;
        this.isRunning = false;
        this.isMoving = false;
        this.lastTime = 0;
        this.scrollTimer = 0;
        this.scrollInterval = SCROLL_SPEED;
        this.yOffset = 0;

        // WASM map generator
        this.wasmGenerator = null;
        this.chunkCache = new ChunkCache();
        this.currentChunkY = 0;
        this.worldStep = 0; // Track infinite world progression

        // Dice animation state
        this.orientation = quatIdentity();
        this.startQuat = quatIdentity();
        this.targetQuat = quatIdentity();
        this.moveFrom = { x: 0, y: 0 };
        this.anchor = { x: 0, y: 0 };
        this.moveDirection = null;
        this.moveStart = 0;
        this.moveDuration = MOVE_SPEED;

        // Face tracking using axis_state array (match3dice approach)
        // Index: [0:Up, 1:Front, 2:Right, 3:Back, 4:Left, 5:Down]
        // Initial: U=1, F=2, R=3, B=5, L=4, D=6
        this.axisState = ['U', 'F', 'R', 'B', 'L', 'D'];
        this.currentTopFace = 1; // Initial top face (what we see visually)
        this.currentBottomFace = 6; // Initial bottom face (opposite of 1)

        // Audio
        this.audioCtx = null;

        // DOM Elements
        this.ui = {
            score: document.getElementById('score'),
            finalScore: document.getElementById('final-score-val'),
            startScreen: document.getElementById('start-screen'),
            gameOverScreen: document.getElementById('game-over-screen'),
            gridContainer: document.getElementById('grid'),
            player: document.getElementById('player'),
        };

        // Bindings
        this.handleInput = this.handleInput.bind(this);
        this.update = this.update.bind(this);

        // Attach Event Listeners
        document.getElementById('start-btn').addEventListener('click', () => this.start());
        document.getElementById('restart-btn').addEventListener('click', () => this.reset());
        window.addEventListener('keydown', this.handleInput);
    }

    async init() {
        await this.initWasm();
        this.createGrid();
        this.resetPlayer();
    }

    async initWasm() {
        try {
            console.log("Attempting to load WASM map generator...");
            const wasm = await import('./wasm-mapgen/pkg/infinite_dice_mapgen.js');
            await wasm.default();

            // Create generator with random seed
            const seed = BigInt(Math.floor(Math.random() * 1000000));
            const difficulty = 0.3; // Start with medium difficulty
            this.wasmGenerator = new wasm.WasmMapGenerator(seed, difficulty);
            console.log("WASM Map Generator loaded successfully!");
        } catch (error) {
            console.error('Failed to load WASM, using fallback generator. Error:', error);
            this.wasmGenerator = null;
        }
    }

    createGrid() {
        this.ui.gridContainer.innerHTML = '';
        this.grid = [];

        // Create a logical grid larger than view? Or just recycle?
        // Let's create a visual grid centered around 0,0
        // We'll track tiles by their logical coordinates (x, y)

        // Initial 7x7 grid centered
        // Initial fill covering the full view range
        const range = Math.floor(GRID_SIZE / 2) + 2;

        for (let x = -range; x <= range; x++) {
            for (let y = -range; y <= range; y++) {
                this.spawnTile(x, y);
            }
        }
    }

    spawnTile(x, y, type = 'normal', metadata = null) {
        const tile = document.createElement('div');
        tile.className = 'tile tile-enter';

        // Add special tile type classes
        if (type === 'bonus') {
            tile.classList.add('tile-bonus');
            // Display required face number
            if (metadata && metadata.requiredFace) {
                const numberLabel = document.createElement('div');
                numberLabel.className = 'tile-number';
                numberLabel.textContent = metadata.requiredFace;
                tile.appendChild(numberLabel);
            }
        } else if (type === 'conditional') {
            tile.classList.add('tile-conditional');
        } else if (type === 'teleport') {
            tile.classList.add('tile-teleport');
        } else if (type === 'lock') {
            tile.classList.add('tile-lock');
            if (metadata && metadata.isKey) {
                tile.classList.add('key');
            } else {
                tile.classList.add('door');
            }
        }

        // Position visually
        this.updateTilePosition(tile, x, y);

        this.ui.gridContainer.appendChild(tile);

        const tileObj = {
            x,
            y,
            element: tile,
            ready: false,
            type: type,
            metadata: metadata
        };
        this.grid.push(tileObj);

        // Mark as ready after animation
        setTimeout(() => {
            if (this.grid.includes(tileObj)) {
                tileObj.ready = true;
            }
        }, 500);

        return tileObj;
    }

    updateTilePosition(element, x, y) {
        // Isometric Logic:
        // Adjust for tile size + gap
        const size = STEP_SIZE;

        // In this CSS isometric setup (rx 60, rz 45):
        // Visual X corresponds to ... logic?
        // Let's just key off standard cartesian first and see how it aligns visually.
        // We'll map logical X,Y directly to left/top for now.

        element.style.left = `${x * size}px`;
        element.style.top = `${y * size}px`;
    }

    start() {
        this.initAudio();
        this.isRunning = true;
        this.score = 0;
        this.scrollInterval = SCROLL_SPEED;
        this.ui.score.innerText = '0';
        this.ui.startScreen.classList.add('hidden');
        this.ui.gameOverScreen.classList.add('hidden');

        this.lastTime = performance.now();
        requestAnimationFrame(this.update);
    }
    // ...


    async reset() {
        await this.init(); // Rebuild grid
        this.start();
    }

    resetPlayer() {
        // Reset player logic pos
        this.player = { x: 0, y: 0 };
        this.yOffset = 0; // Reset scroll offset
        this.orientation = quatIdentity();
        this.startQuat = quatIdentity();
        this.targetQuat = quatIdentity();

        // Reset axis_state to initial configuration
        this.axisState = ['U', 'F', 'R', 'B', 'L', 'D'];
        this.currentTopFace = 1;    // U
        this.currentBottomFace = 6; // D

        this.isMoving = false;

        // Clear any death animation transitions
        this.ui.player.style.transition = 'none';
        // Force reflow to ensure transition removal takes effect if we were to re-add it immediately (though we don't here)
        this.ui.player.offsetHeight;

        this.updatePlayerVisual();
    }

    handleInput(e) {
        if (!this.isRunning || this.isMoving) return;

        let dx = 0;
        let dy = 0;

        switch (e.key) {
            case 'ArrowUp': dy = -1; break;
            case 'ArrowDown': dy = 1; break;
            case 'ArrowLeft': dx = -1; break;
            case 'ArrowRight': dx = 1; break;
            default: return;
        }

        this.movePlayer(dx, dy);
    }

    movePlayer(dx, dy) {
        if (this.isMoving) return;

        const startX = this.player.x;
        const startY = this.player.y;

        const targetX = startX + dx;
        const targetY = startY + dy;

        // Check Bounds
        // Top bound: Prevent moving into the spawn row (y = -range)
        const range = Math.floor(GRID_SIZE / 2) + 2;
        // The safe zone starts from -range + 1
        if (targetY <= -range) return;

        // Also check if moving into a falling tile (optional, but good for feel)
        // If targetY > range, it's a death move, but we allow it so they can die.

        this.player.x = targetX;
        this.player.y = targetY;
        this.playTone(300 + Math.random() * 100, 'triangle', 0.05);
        this.startRollAnimation(dx, dy, startX, startY);
    }

    scrollWorld() {
        // "Conveyor Belt" logic:
        // Move everything "Down-Left"? 
        // Or simpler: Move everything DOWN (increasing Y) and LEFT (decreasing X)?
        // Let's say the belt moves towards +Y +X (Diagonally down-right in screen, or down-left? depends on camera)

        // To mimic "belt moving away", we shift player and tiles.
        // Actually, easier to keep player relative and shift tiles?
        // No, player moves on tiles. 

        // Let's make the GRID move.
        // South-West direction.
        // South = +Y, West = -X.
        // So we shift all tiles: x-1, y+1? 
        // Or we just spawn new ones at Top-Right and remove Bottom-Left.

        // Let's just shift the logical coordinates of the "valid zone".
        // But visual elements need to move.

        // OPTION 2: Player stays centered? No, player moves to survive.
        // Player needs to move OPPOSITE to the belt. 
        // If Belt moves South-West (+Y, -X), Player must move North-East (-Y, +X) to stay in center.

        // ACTUAL LOGIC:
        // Every Tick:
        // 1. Shift all existing tiles by (dx=-1, dy=1) VISUALLY? No, that's complex.
        //    Better: Use a global offset?

        // LET'S SIMPLIFY:
        // The "World" moves. 
        // We have a global `worldOffsetX` and `worldOffsetY`.
        // Every tick, we increment them. 
        // Tiles are rendered at (tile.x + worldScrollX, tile.y + worldScrollY).
        // Wait, if we just scroll the container, we eventually run out of float precision or DOM size?
        // Unlikely for a mini-game.

        // IMPLEMENTATION:
        // We perform a "Step". 
        // In a Step, every tile's logical coordinate changes? 
        // No, tiles are static in the world. The interactions happen on tiles.
        // The "danger zone" moves.
        // Actually, let's just make the tiles move physically.

        // "Conveyor Belt": 
        // New row of tiles spawns at Top-Right (X+, Y-).
        // Old row of tiles despawns at Bottom-Left (X-, Y+).
        // All tiles shift 1 unit per step?
        // Let's try discrete steps first.

        // Current approach:
        // We have a list of tiles.
        // Every SCROLL_SPEED ms, we:
        // 1. Remove tiles that are too far "down-left".
        // 2. Add tiles at "top-right".
        // 3. Update player position relative to grid? No, player stays at (px, py).
        //    If the tile at (px, py) disappears, player dies.

        // Let's define "Too Far"
        // Center is 0,0.
        // If we want the belt to move (-1, +1) [West-South],
        // then tiles are effectively moving in that direction.

        // Actually, let's just simulate the "Belt" by moving the "Bounds" of the grid.
        // Bounds start at [-3, 3] x [-3, 3].
        // Step 1: Bounds shift to [-2, 4] x [-4, 2]? 
        // Direction: Belt moves SW. 
        // So tiles at South-West edge fall off.
        // Tiles at North-East edge appear.

        // Wait, if belt moves SW, then the grid ITSELF visualy translates SW.
        // To stay in place, player must move NE.

        // LOGIC:
        // `scrollStep` counter.
        // `gridCenter` = { x: scrollStep, y: -scrollStep } (Moves NE)
        // Wait, if grid moves SW, the center of valid tiles drift SW.
        // e.g. center goes (0,0) -> (-1, 1) -> (-2, 2).

        // Player moves freely.
        // We check if player is on a valid tile.
        // A tile is valid if it exists.

        // So:
        // 1. Determine "Active Origin" (starts at 0,0).
        // 2. Every tick, Active Origin moves (-1, +1).
        // 3. We spawn neighbors around Active Origin.
        // 4. We cull tiles far from Active Origin.

        // Let's try that.

        // Shift direction: (-1, +1) (West, South)
        const shiftX = -1;
        const shiftY = 1;

        // Move all tiles
        this.grid.forEach(t => {
            t.x += shiftX;
            t.y += shiftY;
            this.updateTilePosition(t.element, t.x, t.y);
        });

        // Update player LOGICAL pos?
        // If the floor moves, does the player move with it?
        // YES. Realistically, if you stand on a belt, you move with it.
        this.player.x += shiftX;
        this.player.y += shiftY;
        this.updatePlayerVisual();

        // Now cull/spawn
        // We want a Grid of 7x7 centered at (0,0) VISUALLY.
        // Since we moved everything SW, the "hole" is at NE.
        // And "overflow" is at SW.

        // We need to keep the grid populated around visual (0,0)?
        // No, that puts the player in a loop of just standing still visually to survive.
        // That's boring.

        // Better Mechanic:
        // The CAMERA follows the "Center" of the belt? No.
        // The CAMERA is fixed.
        // The BELT moves.
        // The PLAYER must move against the belt to stay in view.

        // So:
        // Tiles move SW.
        // Player moves with tiles (physics).
        // If Player goes out of ViewBounds, Game Over.
        // Player must step NE to stay in ViewBounds.

        // Implementation:
        // `this.grid` contains tiles with `x, y`.
        // `x, y` are Visual Coordinates relative to Camera Center (0,0).
        // Every Tick:
        //   All tile.x -= 1, tile.y += 1.
        //   Player.x -= 1, Player.y += 1.
        //   Spawn new tiles at x > boundary, y < boundary? 
        //   We need to fill the gap created at Top-Right.
        //   Gap is where x was high, y was low. 
        //   Ideally, we spawn a "Line" of tiles at the NE edge.

        // Let's refine the "Spawn Edge".
        // Visual Bounds: x: [-3, 3], y: [-3, 3].
        // Shift (-1, +1).
        // New tiles needed at: 
        //   x=3 (since x=4 became 3) -> No, x=3 became 2.
        //   We need tiles at x=3.
        //   And y=-3 (since y=-4 became -3) -> No, y=-3 became -2.
        //   We need tiles at y=-3.

        // So we spawn a "L" shape? Or just iterate [-4, 4] and fill gaps?
        // Simplest: Iterate x[-4..4], y[-4..4]. If tile missing, spawn it?
        // But only spawn if it's "upstream" (NE).
        // Actually, just spawning "missing" tiles in the visible range is enough.

        // Track world progress
        this.worldStep++;
        this.fillGrid();

        // Cull tiles
        this.cullGrid();

        // Check Player Bounds
        if (Math.abs(this.player.x) > 4 || Math.abs(this.player.y) > 4) {
            this.gameOver();
        }

        this.score++;
        this.ui.score.innerText = this.score;
    }

    fillGrid() {
        const range = Math.floor(GRID_SIZE / 2) + 2;
        const centerY = 0;
        const screenY = centerY - range;

        // World Y moves "Up" (Negative) as we step forward
        // Initial state (step 0): worldY = screenY (-5)
        // Step 1: worldY = -6
        const worldY = screenY - this.worldStep;

        // Use WASM generator if available
        if (this.wasmGenerator) {
            console.log(`[FILL] worldStep=${this.worldStep}, screenY=${screenY}, worldY=${worldY}`);
            this.fillGridWithWasm(screenY, worldY);
        } else {
            console.log("[FILL] Using fallback generator (WASM failed to load)");
            this.fillGridFallback(screenY, range);
        }
    }

    fillGridWithWasm(screenY, worldY) {
        const chunkSize = 15;
        // Use worldY to decide which chunk to fetch
        const chunkStartY = Math.floor(worldY / chunkSize) * chunkSize;
        const prevChunkStartY = chunkStartY - chunkSize;

        console.log(`[WASM] Requesting worldY=${worldY}, chunkStartY=${chunkStartY}`);

        // Check if we need a new chunk
        let chunk = this.chunkCache.getChunk(chunkStartY);

        if (!chunk) {
            console.log(`[WASM] Cache MISS - Generating new chunk`);
            // Generate new chunk
            const chunkData = this.wasmGenerator.generateChunk(chunkStartY);
            chunk = chunkData;

            // CRITICAL: Fix chunk boundary connectivity BEFORE caching
            if (chunkStartY !== 0) {
                const prevLastRowPositions = this.chunkCache.getLastRowPositions(prevChunkStartY);

                if (prevLastRowPositions.length > 0) {
                    const firstRowY = chunkStartY;
                    const firstRowTiles = chunk.tiles.filter(t => t.y === firstRowY);
                    const firstRowXPositions = firstRowTiles.map(t => t.x);

                    // Calculate reachable positions from previous row
                    const reachable = new Set();
                    for (const prevX of prevLastRowPositions) {
                        for (let dx = -1; dx <= 1; dx++) {
                            const nextX = prevX + dx;
                            if (nextX >= -5 && nextX <= 5) {
                                reachable.add(nextX);
                            }
                        }
                    }

                    // Check if at least one tile exists in reachable positions
                    const hasReachableTile = firstRowXPositions.some(x => reachable.has(x));

                    if (!hasReachableTile) {
                        console.log(`[WASM] ⚠️ CHUNK BOUNDARY BROKEN! No reachable tiles.`);
                        console.log(`[WASM] Previous row: [${prevLastRowPositions.join(', ')}]`);
                        console.log(`[WASM] Reachable: [${[...reachable].sort((a, b) => a - b).join(', ')}]`);
                        console.log(`[WASM] Current row: [${firstRowXPositions.sort((a, b) => a - b).join(', ')}]`);

                        // Add a guaranteed bridge tile
                        const reachableArray = [...reachable];
                        const bridgeX = reachableArray[Math.floor(Math.random() * reachableArray.length)];
                        const bridgeTile = {
                            x: bridgeX,
                            y: firstRowY,
                            tile_type: 0, // Normal
                            metadata: null
                        };
                        chunk.tiles.push(bridgeTile);
                        console.log(`[WASM] ✓ Added bridge tile at X=${bridgeX}, Y=${firstRowY}`);
                    } else {
                        console.log(`[WASM] ✓ Chunk boundary connected properly`);
                    }
                }
            }

            this.chunkCache.addChunk(chunk);
            console.log(`[WASM] Generated chunk with ${chunk.tiles.length} tiles`);
        } else {
            console.log(`[WASM] Cache HIT - Reusing chunk`);
        }

        // Spawn tiles from chunk for this row
        if (chunk && chunk.tiles) {
            const rowTiles = chunk.tiles.filter(t => t.y === worldY);

            console.log(`[WASM] Row worldY=${worldY} has ${rowTiles.length} tiles at X positions:`,
                rowTiles.map(t => t.x).sort((a, b) => a - b));

            for (const tileData of rowTiles) {
                const exists = this.grid.some(t => t.x === tileData.x && t.y === screenY);
                if (!exists) {
                    const type = this.getTileTypeString(tileData.tile_type);
                    const metadata = this.convertMetadata(tileData.metadata);
                    // IMPORTANT: Spawn at screenY, but use tileData.x (horizontal is shared)
                    this.spawnTile(tileData.x, screenY, type, metadata);
                }
            }
        }
    }

    convertMetadata(wasmMetadata) {
        if (!wasmMetadata) return null;

        // Convert snake_case to camelCase
        return {
            requiredFace: wasmMetadata.required_face,
            allowedFaces: wasmMetadata.allowed_faces,
            bonusPoints: wasmMetadata.bonus_points,
            destination: wasmMetadata.destination,
            pairId: wasmMetadata.pair_id,
            isKey: wasmMetadata.is_key,
            linkedTiles: wasmMetadata.linked_tiles
        };
    }

    fillGridFallback(y, range) {
        // Fallback JavaScript generator
        for (let x = -range; x <= range; x++) {
            const exists = this.grid.some(t => t.x === x && t.y === y);
            if (!exists) {
                let chance = 0.9;
                if (this.score < 20) chance = 1.0;
                else if (this.score > 20) chance = 0.9;

                if (Math.random() < chance) {
                    // Randomly add special tiles
                    const specialChance = 0.15;
                    if (Math.random() < specialChance) {
                        const specialType = Math.floor(Math.random() * 4);
                        switch (specialType) {
                            case 0:
                                this.spawnTile(x, y, 'bonus', {
                                    requiredFace: 6,
                                    bonusPoints: 10
                                });
                                break;
                            case 1:
                                this.spawnTile(x, y, 'conditional', {
                                    allowedFaces: [3, 4, 5]
                                });
                                break;
                            case 2: {
                                const destX = Math.floor(Math.random() * 9) - 4;
                                const destY = y + 3;
                                this.spawnTile(x, y, 'teleport', {
                                    requiredFace: 1,
                                    destination: { x: destX, y: destY }
                                });
                                // Ensure destination tile exists (will be created when that row is generated)
                                break;
                            }
                            case 3: {
                                const doorX = Math.floor(Math.random() * 9) - 4;
                                const doorY = y + 2;
                                const pairId = `lock_${y}_${x}`;
                                this.spawnTile(x, y, 'lock', {
                                    requiredFace: 2,
                                    isKey: true,
                                    pairId: pairId,
                                    linkedTiles: [
                                        { x: doorX + 1, y: doorY },
                                        { x: doorX - 1, y: doorY }
                                    ]
                                });
                                // Door will be spawned when needed
                                break;
                            }
                        }
                    } else {
                        this.spawnTile(x, y);
                    }
                }
            }
        }
    }

    getTileTypeString(tileType) {
        switch (tileType) {
            case 0: return 'normal';
            case 1: return 'bonus';
            case 2: return 'conditional';
            case 3: return 'teleport';
            case 4: return 'lock';
            default: return 'normal';
        }
    }

    cullGrid() {
        // Remove tiles that have drifted too far
        // VISUAL RANGE: The grid typically extends from -range to +range.
        // We want tiles to start falling exactly when they pass the visual edge.

        const range = Math.floor(GRID_SIZE / 2) + 2; // Matches fillGrid range
        const centerY = 0;

        for (let i = this.grid.length - 1; i >= 0; i--) {
            const t = this.grid[i];
            const dy = t.y - centerY;
            const dx = t.x;

            // If tile is beyond the visual range (bottom), trigger exit animation
            if (dy > range) {
                if (!t.element.classList.contains('tile-exit')) {
                    t.element.classList.remove('tile-enter');
                    t.element.classList.add('tile-exit');
                }
            }

            // Actually remove grid data only when it's further down or far X
            // This buffer ensures the tile object exists ("solid") until the logic says "you fell off the world"
            // Wait, if it exists, checkCollision says "safe".
            // So we need checkCollision to know about the range too.

            if (dy > range + 5 || Math.abs(dx) > range + 2) {
                t.element.remove();
                this.grid.splice(i, 1);
            }
        }
    }

    handleBonusTile(tile) {
        // Check if tile is already used
        if (tile.used) return;

        // Bonus tile: check if BOTTOM face (touching the tile) matches required face
        const requiredFace = tile.metadata?.requiredFace;
        console.log(`[BONUS] Required: ${requiredFace}, Bottom face: ${this.currentBottomFace}, Top face: ${this.currentTopFace}`);

        if (requiredFace && this.currentBottomFace === requiredFace) {
            const bonusPoints = tile.metadata?.bonusPoints || 10;
            this.score += bonusPoints;
            this.ui.score.innerText = this.score;
            this.playTone(600, 'sine', 0.2);
            console.log(`[BONUS] ✓ Success! +${bonusPoints} points`);

            // Mark as used
            tile.used = true;

            // Visual feedback
            tile.element.classList.add('tile-inactive');

            // Create and append effect ring
            const ring = document.createElement('div');
            ring.className = 'effect-ring';
            tile.element.appendChild(ring);

            // Cleanup ring after animation
            setTimeout(() => {
                ring.remove();
            }, 600);

            // Bounce effect
            tile.element.style.transform = 'scale(1.2)';
            setTimeout(() => {
                tile.element.style.transform = 'scale(1)';
            }, 200);
        } else {
            console.log(`[BONUS] ✗ Wrong face - no bonus`);
        }
    }

    handleConditionalTile(tile) {
        // Conditional tile: only allows specific faces
        const allowedFaces = tile.metadata?.allowedFaces || [3, 4, 5];
        if (!allowedFaces.includes(this.currentTopFace)) {
            // Wrong face - trigger fall
            this.triggerFall();
            return false;
        }
        return true;
    }

    handleTeleportTile(tile) {
        // Teleport tile: requires face 1 to warp
        if (this.currentTopFace === 1 && tile.metadata?.destination) {
            const dest = tile.metadata.destination;

            // Ensure destination tile exists
            const destTileExists = this.grid.some(t => t.x === dest.x && t.y === dest.y);
            if (!destTileExists) {
                // Create destination tile if it doesn't exist
                this.spawnTile(dest.x, dest.y);
            }

            this.player.x = dest.x;
            this.player.y = dest.y;
            this.playTone(800, 'square', 0.3);
            this.updatePlayerVisual();
        }
    }

    handleLockTile(tile) {
        // Lock tile: key (face 2) opens door and spawns new path
        if (tile.metadata?.isKey && this.currentTopFace === 2) {
            // Find and unlock paired door
            if (tile.metadata.pairId) {
                const door = this.grid.find(t =>
                    t.type === 'lock' &&
                    !t.metadata?.isKey &&
                    t.metadata?.pairId === tile.metadata.pairId
                );
                if (door) {
                    door.element.classList.add('unlocked');
                    this.playTone(500, 'triangle', 0.3);
                    // Spawn linked tiles
                    if (tile.metadata.linkedTiles) {
                        tile.metadata.linkedTiles.forEach(pos => {
                            if (!this.grid.some(t => t.x === pos.x && t.y === pos.y)) {
                                this.spawnTile(pos.x, pos.y);
                            }
                        });
                    }
                }
            }
        }
    }

    triggerFall() {
        // Fall animation
        this.isMoving = false;
        this.ui.player.style.transition = 'transform 0.5s ease-in';
        const size = STEP_SIZE;
        const xPos = this.player.x * size;
        const yPos = this.player.y * size + this.yOffset;

        const mat = matrixFromQuatAndPos(this.orientation, { x: xPos, y: yPos, z: -1000 });
        this.ui.player.style.transform = `matrix3d(${mat.join(',')})`;

        // Wait a bit then game over
        setTimeout(() => this.gameOver(), 500);
        this.isRunning = false;
    }

    checkCollision() {
        // Find the tile at player position
        const currentTile = this.grid.find(t => t.x === this.player.x && t.y === this.player.y && t.ready);

        // Also check global bounds - if player is visibly off the bottom edge, they fall regardless of tile existence
        const range = Math.floor(GRID_SIZE / 2) + 2;
        const outOfBounds = this.player.y > range;

        if (!currentTile || outOfBounds) {
            this.triggerFall();
            return;
        }

        // Handle special tile types
        switch (currentTile.type) {
            case 'bonus':
                this.handleBonusTile(currentTile);
                break;
            case 'conditional':
                if (!this.handleConditionalTile(currentTile)) {
                    return; // Already triggered fall
                }
                break;
            case 'teleport':
                this.handleTeleportTile(currentTile);
                break;
            case 'lock':
                this.handleLockTile(currentTile);
                break;
        }
    }

    gameOver() {
        this.isRunning = false;
        this.playTone(100, 'sawtooth', 0.5);
        this.ui.finalScore.innerText = this.score;
        this.ui.gameOverScreen.classList.remove('hidden');
    }

    update(time) {
        if (!this.isRunning) return;

        const dt = time - this.lastTime;
        this.lastTime = time;

        // Speed Logic: value in pixels per ms? 
        // SCROLL_SPEED was 1000ms per tile.
        // So speed = TILE_SIZE / SCROLL_SPEED
        // Speed up factor: we decrease SCROLL_SPEED.

        const pixelsPerMs = STEP_SIZE / this.scrollInterval;

        // Continuous Scroll
        this.yOffset += pixelsPerMs * dt;

        // Check Wrap
        const fullTile = STEP_SIZE;
        if (this.yOffset >= fullTile) {
            // Use a while loop to catch up if we skipped multiple tiles
            while (this.yOffset >= fullTile) {
                this.yOffset -= fullTile;
                this.shiftLogic();
                if (!this.isRunning) return; // Stop updates if game over triggered in shiftLogic
            }
        }

        // Render Smooth Offset
        this.renderScroll();
        this.updateMovement(time);

        // Basic Speed Up
        if (this.scrollInterval > 300) {
            this.scrollInterval -= 0.01 * dt; // Slower generic speedup
        }

        requestAnimationFrame(this.update);
    }

    renderScroll() {
        // Apply Y offset to the grid container
        // The grid tiles are static in their local X/Y. We move the container.
        this.ui.gridContainer.style.transform = `translate3d(0, ${this.yOffset}px, 0)`;
    }

    shiftLogic() {
        // This is called when we have scrolled 1 full tile Down (+Y).
        const range = Math.floor(GRID_SIZE / 2) + 2;

        // Check if next position would be out of bounds BEFORE shifting
        if (this.player.y + 1 > range) {
            // Trigger exit animation on tiles at current player position
            const currentPlayerY = this.player.y;
            this.grid.forEach(t => {
                if (t.y === currentPlayerY) {
                    t.element.classList.remove('tile-enter');
                    t.element.classList.add('tile-exit');
                }
            });

            // Trigger player fall and game over
            this.player.y++; // Move player to out of bounds position
            this.checkCollision();
            return;
        }

        // Check if player is on a valid tile at current position
        const onTile = this.grid.some(t => t.x === this.player.x && t.y === this.player.y && t.ready);
        if (!onTile) {
            // Player is on a hole - fall before shifting
            this.checkCollision();
            return;
        }

        // 1. Shift all logical coordinates +1 Y
        //    If we shift tile.y += 1, and reset offset to 0...
        //    Old Visual: y*size + size = (y+1)*size.
        //    New Visual: (y+1)*size + 0.
        //    Perfect match.

        this.grid.forEach(t => {
            t.y++;
            this.updateTilePosition(t.element, t.x, t.y);
        });
        this.player.y++; // Player moves with the floor due to friction/physics
        if (this.isMoving) {
            this.moveFrom.y += 1;
            this.anchor.y += 1;
        }

        // 2. Cull/Spawn
        //    "Down-Left" means logic Y increases.
        //    So things with high Y fall off bottom.
        //    Things at low Y (top) need to be spawned.

        //    We define the "Visible Range" relative to the Player?
        //    Or relative to 0?
        //    Let's keep Player centered-ish.
        //    If Player moves UP (-1 Y) to survive, Player Y stays near 0.
        //    So we cull/spawn around Y=0.

        // Track world progress
        this.worldStep++;

        this.cullGrid();
        this.fillGrid();

        this.score++;
        this.ui.score.innerText = this.score;

        // Update difficulty based on score
        this.updateDifficulty();
    }

    updateDifficulty() {
        if (this.wasmGenerator) {
            // Gradually increase difficulty (0.3 to 0.9 over 200 points)
            const newDifficulty = Math.min(0.9, 0.3 + (this.score / 400));
            this.wasmGenerator.setDifficulty(newDifficulty);
        }
    }

    updateMovement(time) {
        if (!this.isMoving) {
            this.updatePlayerVisual();
            return;
        }

        const elapsed = time - this.moveStart;
        const t = Math.min(1, elapsed / this.moveDuration);
        this.applyRollFrame(t);

        if (t >= 1) {
            this.finishMoveAnimation();
        }
    }

    applyRollFrame(t) {
        const moveDeg = t * 90 + 45;
        const rad = moveDeg * Math.PI / 180;
        const sinPart = Math.sin(rad) / Math.SQRT2;
        const cosPart = Math.cos(rad) / Math.SQRT2;
        const pos = { x: this.anchor.x, y: this.anchor.y, z: sinPart };

        if (this.moveDirection.dy === -1) {
            pos.y = this.anchor.y + cosPart;
        } else if (this.moveDirection.dy === 1) {
            pos.y = this.anchor.y - cosPart;
        } else if (this.moveDirection.dx === -1) {
            pos.x = this.anchor.x + cosPart;
        } else if (this.moveDirection.dx === 1) {
            pos.x = this.anchor.x - cosPart;
        }

        const currentQuat = quatSlerp(this.startQuat, this.targetQuat, t);
        this.updatePlayerVisual({ position: pos, quaternion: currentQuat });
    }

    rotateAxis(direction) {
        // Update axis state array based on movement direction
        // This tracks which dice face is in which orientation
        const a = this.axisState;

        switch (direction) {
            case 'UP':  // dy=-1
                // U→F→D→B→U cycle
                const tempUp = a[0];
                a[0] = a[1];  // U ← F
                a[1] = a[5];  // F ← D
                a[5] = a[3];  // D ← B
                a[3] = tempUp; // B ← U
                break;

            case 'DOWN':  // dy=1
                // U→B→D→F→U cycle
                const tempDown = a[0];
                a[0] = a[3];  // U ← B
                a[3] = a[5];  // B ← D
                a[5] = a[1];  // D ← F
                a[1] = tempDown; // F ← U
                break;

            case 'LEFT':  // dx=-1
                // U→R→D→L→U cycle
                const tempLeft = a[0];
                a[0] = a[2];  // U ← R
                a[2] = a[5];  // R ← D
                a[5] = a[4];  // D ← L
                a[4] = tempLeft; // L ← U
                break;

            case 'RIGHT':  // dx=1
                // U→L→D→R→U cycle
                const tempRight = a[0];
                a[0] = a[4];  // U ← L
                a[4] = a[5];  // L ← D
                a[5] = a[2];  // D ← R
                a[2] = tempRight; // R ← U
                break;
        }
    }

    startRollAnimation(dx, dy, startX, startY) {
        this.isMoving = true;
        this.moveStart = performance.now();
        this.moveDuration = MOVE_SPEED;
        this.moveDirection = { dx, dy };
        this.moveFrom = { x: startX, y: startY };
        this.anchor = { x: startX, y: startY };

        if (dy === -1) this.anchor.y -= 0.5;
        else if (dy === 1) this.anchor.y += 0.5;
        else if (dx === -1) this.anchor.x -= 0.5;
        else if (dx === 1) this.anchor.x += 0.5;

        this.startQuat = { ...this.orientation };
        // Match match3dice approach: apply a world-space quarter turn to current orientation.
        let axis;
        let angle;
        if (dy !== 0) {
            axis = { x: 1, y: 0, z: 0 }; // pitch forward/backward
            angle = dy === -1 ? -Math.PI / 2 : Math.PI / 2;
        } else {
            axis = { x: 0, y: 1, z: 0 }; // roll left/right
            angle = dx === -1 ? Math.PI / 2 : -Math.PI / 2;
        }

        const deltaQuat = quatFromAxisAngle(axis, angle);
        this.targetQuat = quatNormalize(quatMultiply(this.startQuat, deltaQuat));
    }

    finishMoveAnimation() {
        this.isMoving = false;
        this.orientation = quatNormalize(this.targetQuat);

        // Update axis_state based on movement direction
        let direction;
        if (this.moveDirection.dy === -1) direction = 'UP';
        else if (this.moveDirection.dy === 1) direction = 'DOWN';
        else if (this.moveDirection.dx === -1) direction = 'LEFT';
        else if (this.moveDirection.dx === 1) direction = 'RIGHT';

        this.rotateAxis(direction);

        // Get face numbers from axis_state
        this.currentTopFace = INITIAL_AXIS_STATE[this.axisState[0]];   // Up face
        this.currentBottomFace = INITIAL_AXIS_STATE[this.axisState[5]]; // Down face

        console.log(`[DICE MOVE] Direction: ${direction}, Top: ${this.currentTopFace}, Bottom: ${this.currentBottomFace}`);

        this.updatePlayerVisual();
        this.checkCollision();
    }

    initAudio() {
        if (!this.audioCtx) {
            this.audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        }
        if (this.audioCtx.state === 'suspended') {
            this.audioCtx.resume();
        }
    }

    playTone(freq, type, duration) {
        if (!this.audioCtx) return;
        try {
            const osc = this.audioCtx.createOscillator();
            const gain = this.audioCtx.createGain();

            osc.type = type;
            osc.frequency.setValueAtTime(freq, this.audioCtx.currentTime);

            gain.gain.setValueAtTime(0.1, this.audioCtx.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.01, this.audioCtx.currentTime + duration);

            osc.connect(gain);
            gain.connect(this.audioCtx.destination);

            osc.start();
            osc.stop(this.audioCtx.currentTime + duration);
        } catch (e) {
            console.warn('Audio play failed', e);
        }
    }

    updatePlayerVisual({ position, quaternion } = {}) {
        const size = STEP_SIZE;
        const pos = position || { x: this.player.x, y: this.player.y, z: 0.5 };
        const q = quaternion || this.orientation;
        const xPos = pos.x * size;
        const yPos = pos.y * size + this.yOffset; // Add the smooth scroll
        const height = pos.z ?? 0.5;
        const zOffset = (TILE_SIZE * 0.5) + (height - 0.5) * STEP_SIZE;

        const mat = matrixFromQuatAndPos(q, { x: xPos, y: yPos, z: zOffset });
        this.ui.player.style.transform = `matrix3d(${mat.join(',')})`;
    }
}

// Start
const game = new Game();
game.init().catch(err => {
    console.error('Failed to initialize game:', err);
});
