/**
 * Infinite Dice Roll
 * Core Game Logic
 */

const TILE_SIZE = 60;
const TILE_GAP = 4;
const GRID_SIZE = 7; // Keep it odd to center easily
const MOVE_SPEED = 200; // ms per move
const SCROLL_SPEED = 1000; // ms per grid shift (initial)

class Game {
    constructor() {
        this.grid = [];
        this.player = null;
        this.score = 0;
        this.isRunning = false;
        this.lastTime = 0;
        this.scrollTimer = 0;
        this.scrollInterval = SCROLL_SPEED;
        this.yOffset = 0;

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
        const offset = Math.floor(GRID_SIZE / 2);

        for (let x = -offset; x <= offset; x++) {
            for (let y = -offset; y <= offset; y++) {
                this.spawnTile(x, y);
            }
        }
    }

    spawnTile(x, y) {
        const tile = document.createElement('div');
        tile.className = 'tile';

        // Position visually
        this.updateTilePosition(tile, x, y);

        this.ui.gridContainer.appendChild(tile);
        this.grid.push({ x, y, element: tile });
    }

    updateTilePosition(element, x, y) {
        // Isometric Logic:
        // Adjust for tile size + gap
        const size = TILE_SIZE + TILE_GAP;

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
        this.updatePlayerVisual();
    }

    updatePlayerVisual() {
        const size = TILE_SIZE + TILE_GAP;
        // Transform the player wrapper to the correct position
        // We need to match the tile logic
        const xPos = this.player.x * size;
        const yPos = this.player.y * size;

        // We need to lift the die up by half its height so it sits ON the tile
        const zOffset = TILE_SIZE / 2;

        this.ui.player.style.transform = `translate3d(${xPos}px, ${yPos}px, ${zOffset}px)`;
    }

    handleInput(e) {
        if (!this.isRunning) return;

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
        this.player.x += dx;
        this.player.y += dy;
        this.playTone(300 + Math.random() * 100, 'triangle', 0.05);
        this.updatePlayerVisual();

        this.checkCollision();
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
        // Ensure standard grid area has tiles relative to PLAYER
        // Player Y increases indefinitely as they ride the belt.
        // We want tiles in range [player.y - range, player.y + range]

        const range = Math.floor(GRID_SIZE / 2) + 2;

        // Center the loops around the player's current logical Y
        const centerY = this.player ? this.player.y : 0;

        for (let x = -range; x <= range; x++) { // X is usually centered on 0 unless player strays
            for (let y = centerY - range; y <= centerY + range; y++) {
                // Check if tile exists at x,y
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
    }

    cullGrid() {
        // Remove tiles far from player
        const range = Math.floor(GRID_SIZE / 2) + 3;
        const centerY = this.player ? this.player.y : 0;

        for (let i = this.grid.length - 1; i >= 0; i--) {
            const t = this.grid[i];
            const dy = t.y - centerY;
            const dx = t.x; // Player X is usually near 0, but if player moves side to side?
            // Actually, player.x can be anything. We should cull relative to player X too.
            // But if player goes too far X, they die anyway.

            if (Math.abs(dx) > range || Math.abs(dy) > range) {
                t.element.remove();
                this.grid.splice(i, 1);
            }
        }
    }

    checkCollision() {
        // Check if player is on a tile
        const onTile = this.grid.some(t => t.x === this.player.x && t.y === this.player.y);

        if (!onTile) {
            // Fall animation
            this.ui.player.style.transition = 'transform 0.5s ease-in';
            const currentTransform = getComputedStyle(this.ui.player).transform;
            // We can't easily append to matrix, but we can just add a class or force a new style.
            // Actually, we are updating the style every frame in game loop? No, only on move.
            // But let's just force a big Z drop.

            // We need to re-apply the current X/Y and Drop Z.
            const size = TILE_SIZE + TILE_GAP;
            const xPos = this.player.x * size;
            const yPos = this.player.y * size;

            this.ui.player.style.transform = `translate3d(${xPos}px, ${yPos}px, -1000px)`;

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

        const pixelsPerMs = (TILE_SIZE + TILE_GAP) / this.scrollInterval;

        // Continuous Scroll
        this.yOffset += pixelsPerMs * dt;

        // Check Wrap
        const fullTile = TILE_SIZE + TILE_GAP;
        if (this.yOffset >= fullTile) {
            this.yOffset -= fullTile;
            this.shiftLogic();
        }

        // Render Smooth Offset
        this.renderScroll();

        // Basic Speed Up
        if (this.scrollInterval > 200) {
            this.scrollInterval -= 0.05 * dt; // Slow generic speedup
        }

        requestAnimationFrame(this.update);
    }

    renderScroll() {
        // Apply Y offset to the grid container
        // The grid tiles are static in their local X/Y. We move the container.
        this.ui.gridContainer.style.transform = `translate3d(0, ${this.yOffset}px, 0)`;

        // Player is separate, so we must manually offset the player too?
        // Player position = Logical(x,y) * size
        // We need to ADD the visual offset.
        this.updatePlayerVisual();
    }

    shiftLogic() {
        // This is called when we have scrolled 1 full tile Down (+Y).
        // 1. Shift all logical coordinates +1 Y ??
        //    If we shift tile.y += 1, and reset offset to 0...
        //    Old Visual: y*size + size = (y+1)*size.
        //    New Visual: (y+1)*size + 0.
        //    Perfect match.

        this.grid.forEach(t => t.y++);
        this.player.y++; // Player moves with the floor due to friction/physics

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

        // Check collision after shift (did I ride into a hole?)
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

    updatePlayerVisual() {
        const size = TILE_SIZE + TILE_GAP;
        const xPos = this.player.x * size;
        const yPos = this.player.y * size + this.yOffset; // Add the smooth scroll
        const zOffset = TILE_SIZE / 2;

        this.ui.player.style.transform = `translate3d(${xPos}px, ${yPos}px, ${zOffset}px)`;
    }
}

// Start
const game = new Game();
game.init();
