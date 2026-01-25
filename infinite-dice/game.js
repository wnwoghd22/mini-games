/**
 * Infinite Dice Roll
 * Core Game Logic
 */

const TILE_SIZE = 60;
const TILE_GAP = 4;
const STEP_SIZE = TILE_SIZE + TILE_GAP;
const GRID_SIZE = 7; // Keep it odd to center easily
const MOVE_SPEED = 200; // ms per move
const SCROLL_SPEED = 1000; // ms per grid shift (initial)

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

        // Dice animation state
        this.orientation = quatIdentity();
        this.startQuat = quatIdentity();
        this.targetQuat = quatIdentity();
        this.moveFrom = { x: 0, y: 0 };
        this.anchor = { x: 0, y: 0 };
        this.moveDirection = null;
        this.moveStart = 0;
        this.moveDuration = MOVE_SPEED;

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

    init() {
        this.createGrid();
        this.resetPlayer();
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

    spawnTile(x, y) {
        const tile = document.createElement('div');
        tile.className = 'tile tile-enter';

        // Position visually
        this.updateTilePosition(tile, x, y);

        this.ui.gridContainer.appendChild(tile);

        const tileObj = { x, y, element: tile, ready: false };
        this.grid.push(tileObj);

        // Mark as ready after animation
        setTimeout(() => {
            if (this.grid.includes(tileObj)) {
                tileObj.ready = true;
            }
        }, 500);
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


    reset() {
        this.init(); // Rebuild grid
        this.start();
    }

    resetPlayer() {
        // Reset player logic pos
        this.player = { x: 0, y: 0 };
        this.yOffset = 0; // Reset scroll offset
        this.orientation = quatIdentity();
        this.startQuat = quatIdentity();
        this.targetQuat = quatIdentity();
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

        // Only spawn the NEW top row (minimum y)
        // Since tiles move down (y increases), the new "top" is the smallest logical Y.
        // Wait, our viewport is fixed at centerY=0.
        // Tiles drift from -range to +range.
        // So we need to insert at y = -range.

        const y = centerY - range;

        for (let x = -range; x <= range; x++) {
            // Check if tile already exists (shouldn't, but for safety)
            const exists = this.grid.some(t => t.x === x && t.y === y);
            if (!exists) {
                // Procedural Generation Logic
                // ... (same as before)
                let chance = 0.9;
                if (this.score < 20) chance = 1.0;
                else if (this.score > 20) chance = 0.9;

                if (Math.random() < chance) {
                    this.spawnTile(x, y);
                }
            }
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

    checkCollision() {
        // Check if player is on a tile AND tile is ready
        const onTile = this.grid.some(t => t.x === this.player.x && t.y === this.player.y && t.ready);

        // Also check global bounds - if player is visibly off the bottom edge, they fall regardless of tile existence
        const range = Math.floor(GRID_SIZE / 2) + 2;
        const outOfBounds = this.player.y > range;

        if (!onTile || outOfBounds) {
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

        this.cullGrid();
        this.fillGrid();

        this.score++;
        this.ui.score.innerText = this.score;
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
game.init();
