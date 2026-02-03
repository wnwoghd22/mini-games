export class ActionEngine {
    constructor(director) {
        this.director = director;
        this.canvas = document.getElementById('action-canvas');
        this.ctx = this.canvas.getContext('2d');
        this.isRunning = false;
        this.animationFrameId = null; // Track animation frame for proper cleanup
        this.currentMinigame = null; // Track current minigame type

        // Physics constants
        this.GRAVITY = 0.6;
        this.FRICTION = 0.8;
        this.MOVE_SPEED = 5;
        this.JUMP_FORCE = 12;

        this.player = {
            x: 0,
            y: 0,
            width: 30,
            height: 30,
            vx: 0,
            vy: 0,
            isGrounded: false,
            isHiding: false,
            canHide: false, // Near a cover?
            nearCover: null // Reference to nearby cover
        };

        this.level = {
            platforms: [],
            goal: { x: 0, y: 0, width: 0, height: 0 },
            width: 2000,
            cameraX: 0,
            // Phase transition
            stealthZoneStart: 0, // X position where stealth begins
            phase: 'journey' // 'journey' or 'stealth'
        };

        this.resize();
        window.addEventListener('resize', () => this.resize());

        // Input state
        this.keys = {
            left: false,
            right: false,
            up: false,
            down: false
        };

        window.addEventListener('keydown', (e) => this.handleKey(e, true));
        window.addEventListener('keyup', (e) => this.handleKey(e, false));
    }

    resize() {
        this.canvas.width = window.innerWidth;
        this.canvas.height = window.innerHeight;
    }

    handleKey(e, isDown) {
        if (e.code === 'ArrowLeft') this.keys.left = isDown;
        if (e.code === 'ArrowRight') this.keys.right = isDown;
        if (e.code === 'ArrowUp') this.keys.up = isDown;
        if (e.code === 'ArrowDown') this.keys.down = isDown;

        // Space key handling
        if (e.code === 'Space') {
            if (this.level.phase === 'qte' && isDown) {
                // QTE mashing
                this.handleQTEMash();
            } else {
                // Normal jump
                this.keys.up = isDown;
            }
        }
    }

    start(levelType) {
        console.log(`Action Engine: Starting Level ${levelType}`);

        // IMPORTANT: Stop any existing game first
        this.isRunning = false;

        // Cancel any existing animation frame before starting new one
        if (this.animationFrameId) {
            cancelAnimationFrame(this.animationFrameId);
            this.animationFrameId = null;
        }

        // Reset input state to prevent stuck keys
        this.keys = { left: false, right: false, up: false, down: false };

        // Use setTimeout to ensure previous loop has fully stopped
        setTimeout(() => {
            this.currentMinigame = levelType;
            this.isRunning = true;
            this.loadLevel(levelType);
            this.loop();
        }, 0);
    }

    stop() {
        this.isRunning = false;
        // Cancel any pending animation frame to prevent multiple loops
        if (this.animationFrameId) {
            cancelAnimationFrame(this.animationFrameId);
            this.animationFrameId = null;
        }
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        // Reset keys to prevent sticking
        this.keys = { left: false, right: false, up: false, down: false };
    }

    loadLevel(type) {
        const floorY = this.canvas.height - 100;

        this.player.x = 50;
        this.player.y = floorY - 50;
        this.player.vx = 0;
        this.player.vy = 0;
        this.player.isHiding = false;
        this.player.canHide = false;
        this.player.nearCover = null;

        this.level.platforms = [];
        this.level.covers = [];
        this.level.cameraX = 0;
        this.level.type = type;
        this.level.phase = 'journey'; // Always start with journey phase

        // Cat Logic Data
        this.level.cat = {
            state: 'sleeping',
            timer: 0,
            alertLevel: 0,
            x: 0, // Cat position for drawing
            y: 0
        };

        if (type === 'journey') {
            // ========================================
            // UNIFIED LEVEL: Journey → Stealth
            // ========================================

            // Total level layout:
            // [0 - 2000]: Journey section (platforming)
            // [2000 - 2500]: Transition zone (camera pan, stealth intro)
            // [2500 - 5000]: Stealth section (hide behind covers)

            this.level.width = 5000;
            this.level.stealthZoneStart = 2000;

            // === JOURNEY SECTION (0 - 2000) ===
            // Ground for journey
            this.level.platforms.push({ x: 0, y: floorY, width: 2500, height: 100 });

            // Platforming obstacles
            for (let i = 0; i < 8; i++) {
                this.level.platforms.push({
                    x: 250 + (i * 200),
                    y: floorY - 60 - (Math.random() * 80),
                    width: 100,
                    height: 20
                });
            }

            // === TRANSITION ZONE (2000 - 2500) ===
            // Visual indicator: darker area, sleeping cat silhouette visible

            // === STEALTH SECTION (2500 - 5000) ===
            // Ground with gaps and platforms at various heights

            // Base ground segments (with gaps to force platforming)
            this.level.platforms.push({ x: 2400, y: floorY, width: 400, height: 100 });  // Entry
            this.level.platforms.push({ x: 3000, y: floorY, width: 300, height: 100 });  // Mid-ground 1
            this.level.platforms.push({ x: 3600, y: floorY, width: 400, height: 100 });  // Mid-ground 2
            this.level.platforms.push({ x: 4300, y: floorY, width: 700, height: 100 });  // Final approach

            // Elevated platforms with covers
            const stealthPlatforms = [
                // { x, y (relative to floorY), width, hasCover, coverOffset }
                { x: 2750, y: -80, width: 150, hasCover: true, coverX: 40 },   // Low platform
                { x: 2950, y: -150, width: 120, hasCover: true, coverX: 25 },  // High jump
                { x: 3250, y: -60, width: 180, hasCover: true, coverX: 55 },   // Wide low
                { x: 3450, y: -120, width: 130, hasCover: true, coverX: 30 },  // Medium
                { x: 3700, y: -180, width: 100, hasCover: true, coverX: 15 },  // Highest
                { x: 3950, y: -90, width: 160, hasCover: true, coverX: 45 },   // Descent
                { x: 4150, y: -50, width: 120, hasCover: true, coverX: 25 },   // Low entry
                { x: 4500, y: -70, width: 140, hasCover: true, coverX: 35 },   // Final cover
            ];

            stealthPlatforms.forEach((plat, i) => {
                // Add platform
                this.level.platforms.push({
                    x: plat.x,
                    y: floorY + plat.y,
                    width: plat.width,
                    height: 20,
                    isStealthPlatform: true
                });

                // Add cover on platform
                if (plat.hasCover) {
                    this.level.covers.push({
                        x: plat.x + plat.coverX,
                        y: floorY + plat.y - 55,  // On top of platform
                        width: 60,
                        height: 55,
                        id: i,
                        platformY: floorY + plat.y  // Reference for alignment
                    });
                }
            });

            // Ground-level covers (fewer, for variety)
            const groundCovers = [
                { x: 2550, y: floorY - 55 },
                { x: 3100, y: floorY - 55 },
                { x: 4400, y: floorY - 55 },
            ];
            groundCovers.forEach((cover, i) => {
                this.level.covers.push({
                    x: cover.x,
                    y: cover.y,
                    width: 60,
                    height: 55,
                    id: 100 + i  // Different ID range
                });
            });

            // Cat position (end of level)
            this.level.cat.x = 4900;
            this.level.cat.y = floorY - 150;

            // Goal - The Cat's neck area
            this.level.goal = { x: 4850, y: floorY - 100, width: 80, height: 100 };
        }
        else if (type === 'stealth') {
            // Standalone stealth (if needed for retry)
            this.level.width = 2500;
            this.level.stealthZoneStart = 0;
            this.level.phase = 'stealth';

            // Ground segments with gaps
            this.level.platforms.push({ x: 0, y: floorY, width: 300, height: 100 });
            this.level.platforms.push({ x: 500, y: floorY, width: 250, height: 100 });
            this.level.platforms.push({ x: 1000, y: floorY, width: 300, height: 100 });
            this.level.platforms.push({ x: 1600, y: floorY, width: 400, height: 100 });
            this.level.platforms.push({ x: 2200, y: floorY, width: 300, height: 100 });

            // Elevated platforms with covers
            const stealthPlatforms = [
                { x: 250, y: -70, width: 140, hasCover: true, coverX: 40 },
                { x: 450, y: -130, width: 120, hasCover: true, coverX: 30 },
                { x: 700, y: -80, width: 160, hasCover: true, coverX: 50 },
                { x: 950, y: -150, width: 100, hasCover: true, coverX: 20 },
                { x: 1250, y: -60, width: 180, hasCover: true, coverX: 60 },
                { x: 1500, y: -110, width: 130, hasCover: true, coverX: 35 },
                { x: 1800, y: -90, width: 150, hasCover: true, coverX: 45 },
                { x: 2100, y: -70, width: 120, hasCover: true, coverX: 30 },
            ];

            stealthPlatforms.forEach((plat, i) => {
                this.level.platforms.push({
                    x: plat.x,
                    y: floorY + plat.y,
                    width: plat.width,
                    height: 20,
                    isStealthPlatform: true
                });

                if (plat.hasCover) {
                    this.level.covers.push({
                        x: plat.x + plat.coverX,
                        y: floorY + plat.y - 55,
                        width: 60,
                        height: 55,
                        id: i
                    });
                }
            });

            // Ground-level covers
            this.level.covers.push({ x: 100, y: floorY - 55, width: 60, height: 55, id: 100 });
            this.level.covers.push({ x: 1100, y: floorY - 55, width: 60, height: 55, id: 101 });
            this.level.covers.push({ x: 1700, y: floorY - 55, width: 60, height: 55, id: 102 });

            this.level.cat.x = 2400;
            this.level.cat.y = floorY - 150;
            this.level.goal = { x: 2350, y: floorY - 100, width: 80, height: 100 };
        }
        else if (type === 'escape') {
            // ========================================
            // ESCAPE PHASE: Run and Hide from the Bell
            // ========================================
            this.level.width = 3500;
            this.level.phase = 'escape';

            // Ground with some gaps
            this.level.platforms.push({ x: 0, y: floorY, width: 800, height: 100 });
            this.level.platforms.push({ x: 900, y: floorY, width: 700, height: 100 });
            this.level.platforms.push({ x: 1700, y: floorY, width: 600, height: 100 });
            this.level.platforms.push({ x: 2400, y: floorY, width: 1100, height: 100 });

            // Elevated platforms for variety
            const escapePlatforms = [
                { x: 750, y: -60, width: 120 },
                { x: 1550, y: -80, width: 130 },
                { x: 2250, y: -70, width: 140 },
                { x: 2900, y: -60, width: 120 },
            ];
            escapePlatforms.forEach(plat => {
                this.level.platforms.push({
                    x: plat.x,
                    y: floorY + plat.y,
                    width: plat.width,
                    height: 20,
                    isStealthPlatform: true
                });
            });

            // Covers (boxes) - Hide behind these when bell is loud!
            const escapeCoverPositions = [
                { x: 200, y: floorY - 55 },
                { x: 500, y: floorY - 55 },
                { x: 780, y: floorY - 60 - 55 },  // On platform
                { x: 1000, y: floorY - 55 },
                { x: 1300, y: floorY - 55 },
                { x: 1580, y: floorY - 80 - 55 },  // On platform
                { x: 1850, y: floorY - 55 },
                { x: 2100, y: floorY - 55 },
                { x: 2280, y: floorY - 70 - 55 },  // On platform
                { x: 2550, y: floorY - 55 },
                { x: 2800, y: floorY - 55 },
                { x: 2930, y: floorY - 60 - 55 },  // On platform
                { x: 3150, y: floorY - 55 },
            ];
            escapeCoverPositions.forEach((cover, i) => {
                this.level.covers.push({
                    x: cover.x,
                    y: cover.y,
                    width: 60,
                    height: 55,
                    id: i
                });
            });

            // Goal - Exit point
            this.level.goal = { x: 3400, y: floorY - 150, width: 80, height: 150 };

            // Escape Specific Data
            this.level.escape = {
                wallX: -300, // Starts behind player
                wallSpeed: 2.0, // Slower, more manageable
                bellState: 'quiet', // 'quiet', 'warning', 'loud'
                bellTimer: 0,
                debris: []
            };
        }
        else if (type === 'climb') {
            // ========================================
            // PHASE 3: THE APPROACH (Horizontal)
            // ========================================
            const H = this.canvas.height;
            const fY = H - 100;

            this.level.width = 3000;
            this.level.height = H;
            this.level.phase = 'climb';

            // Start at left
            this.player.x = 50;
            this.player.y = fY - 50;
            this.level.cameraX = 0;
            this.level.cameraY = 0; // Reset vertical camera

            // --- FURNITURE LAYOUT (Horizontal) ---

            // 1. Floor (Hard Wood)
            this.level.platforms.push({ x: 0, y: fY, width: 600, height: 100, type: 'floor', surface: 'hard' });
            this.level.platforms.push({ x: 900, y: fY, width: 800, height: 100, type: 'floor', surface: 'hard' });
            this.level.platforms.push({ x: 2000, y: fY, width: 1000, height: 100, type: 'floor', surface: 'hard' });

            // 2. Sofa (Soft)
            this.level.platforms.push({ x: 400, y: fY - 60, width: 250, height: 60, type: 'sofa', surface: 'soft' });
            this.level.platforms.push({ x: 400, y: fY - 100, width: 250, height: 20, type: 'sofa_back', surface: 'soft' });

            // 3. Bookshelf Bridge (Hard)
            this.level.platforms.push({ x: 700, y: fY - 150, width: 150, height: 20, type: 'shelf', surface: 'hard' });
            this.level.platforms.push({ x: 900, y: fY - 200, width: 200, height: 20, type: 'shelf', surface: 'hard' });

            // 4. Curtains (Soft)
            this.level.platforms.push({ x: 1200, y: fY - 250, width: 120, height: 20, type: 'curtain', surface: 'soft' });
            this.level.platforms.push({ x: 1400, y: fY - 200, width: 120, height: 20, type: 'curtain', surface: 'soft' });

            // 5. Dining Table (Hard)
            this.level.platforms.push({ x: 1600, y: fY - 100, width: 400, height: 20, type: 'table', surface: 'hard' });

            // 6. Cat's Bed (Soft)
            this.level.platforms.push({ x: 2400, y: fY - 50, width: 300, height: 50, type: 'bed', surface: 'soft' });

            // Populate initial baseYs
            this.level.platforms.forEach(p => p.baseY = p.y);

            // Goal - Sleeping Cat
            this.level.goal = { x: 2600, y: fY - 150, width: 100, height: 100 };

            // Climb-specific data
            this.level.climb = {
                wakefulnessLevel: 0,
                noiseLevel: 0,
                catState: 'sleeping'
            };
        }
        else if (type === 'chase') {
            // ========================================
            // FINAL CHASE: Escaping the awakened Cat
            // ========================================
            this.level.width = 5000;
            this.level.phase = 'chase';

            this.player.x = 200;
            this.player.y = floorY - 50;

            // Ground
            this.level.platforms.push({ x: 0, y: floorY, width: this.level.width, height: 100 });

            // Goal
            this.level.goal = { x: 4800, y: floorY - 150, width: 100, height: 150 };

            this.level.chase = {
                scrollSpeed: 6,
                attackTimer: 0,
                attackType: null,
                attackWarning: false,
                attackActive: false,
                cameraX: 0
            };
        }
        else if (type === 'qte_kill') {
            // ========================================
            // QTE: Strangling the Cat
            // ========================================
            this.level.phase = 'qte';

            this.level.qte = {
                progress: 0,
                decay: 0.3,
                required: 100,
                mashCount: 0,
                timeLimit: 600,
                timer: 0
            };
        }
    }

    loop() {
        if (!this.isRunning) return;

        this.update();

        // Check again after update (failLevel/winLevel may have called stop())
        if (!this.isRunning) return;

        this.draw();
        this.animationFrameId = requestAnimationFrame(() => this.loop());
    }

    update() {
        // 0. Phase Transition Check (Journey → Stealth)
        if (this.level.phase === 'journey' && this.player.x >= this.level.stealthZoneStart) {
            this.enterStealthPhase();
        }

        // 1. Stealth Logic
        if (this.level.phase === 'stealth') {
            this.updateCatLogic();
            if (!this.isRunning) return; // Exit if game ended
        }

        // 1.5 Escape Logic
        if (this.level.phase === 'escape') {
            this.updateEscapeLogic();
            if (!this.isRunning) return;
        }

        // 1.6 Climb Logic
        if (this.level.phase === 'climb') {
            this.updateClimbLogic();
            if (!this.isRunning) return;
        }

        // 1.7 Chase Logic
        if (this.level.phase === 'chase') {
            this.updateChaseLogic();
            if (!this.isRunning) return;
        }

        // 1.8 QTE Logic
        if (this.level.phase === 'qte') {
            this.updateQTELogic();
            if (!this.isRunning) return;
        }

        // 2. Check if player is near a cover (can hide) - works in stealth AND escape
        this.player.canHide = false;
        this.player.nearCover = null;

        if (this.level.covers && (this.level.phase === 'stealth' || this.level.phase === 'escape')) {
            for (const cover of this.level.covers) {
                // Check if player is within hiding range of cover (slightly larger hitbox)
                const hideRange = 20;
                if (this.player.x + this.player.width > cover.x - hideRange &&
                    this.player.x < cover.x + cover.width + hideRange &&
                    this.player.isGrounded) {
                    this.player.canHide = true;
                    this.player.nearCover = cover;
                    break;
                }
            }
        }

        // 3. Horizontal Movement & Hiding
        this.player.isHiding = false;

        // Block movement during transition
        if (this.level.phase === 'stealth_transition') {
            this.player.vx = 0;
        }
        // Can only hide if near a cover, grounded, and pressing DOWN (stealth & escape)
        else if (this.keys.down && this.player.isGrounded && this.player.canHide) {
            this.player.isHiding = true;
            this.player.vx = 0; // Stop moving while hiding
        } else {
            // In escape phase during loud bell, only allow slow movement if not hiding
            const escapeSlowdown = (this.level.phase === 'escape' &&
                this.level.escape?.bellState === 'loud') ? 0.3 : 1.0;
            if (this.keys.left) this.player.vx = -this.MOVE_SPEED * escapeSlowdown;
            if (this.keys.right) this.player.vx = this.MOVE_SPEED * escapeSlowdown;
        }

        // Friction when no key pressed
        if (!this.keys.left && !this.keys.right) {
            this.player.vx *= this.FRICTION;
        }

        // 4. Jump (Cannot jump while hiding)
        if (this.keys.up && this.player.isGrounded && !this.player.isHiding) {
            this.player.vy = -this.JUMP_FORCE;
            this.player.isGrounded = false;
        }

        // 5. Gravity
        this.player.vy += this.GRAVITY;

        // 6. Apply Velocity
        this.player.x += this.player.vx;
        this.player.y += this.player.vy;

        // Prevent moving backwards in stealth zone
        if (this.level.phase === 'stealth' && this.player.x < this.level.stealthZoneStart + 100) {
            this.player.x = this.level.stealthZoneStart + 100;
        }

        // 7. Collision Detection
        this.player.isGrounded = false;

        for (const plat of this.level.platforms) {
            if (this.checkCollision(this.player, plat)) {
                if (this.player.vy > 0 && this.player.y + this.player.height - this.player.vy <= plat.y) {
                    this.player.y = plat.y - this.player.height;
                    this.player.vy = 0;
                    this.player.isGrounded = true;
                }
            }
        }

        // 8. Camera Follow (smooth in stealth phase)
        this.updateCamera();

        // 9. Goal Check (not for climb/chase/qte - they handle it themselves)
        if (this.level.phase !== 'climb' && this.level.phase !== 'chase' && this.level.phase !== 'qte') {
            if (this.checkCollision(this.player, this.level.goal)) {
                this.winLevel();
                return;
            }
        }

        // 10. Fall Check (Death) - not for climb/chase/qte (different coordinate systems)
        if (this.level.phase !== 'climb' && this.level.phase !== 'chase' && this.level.phase !== 'qte') {
            if (this.player.y > this.canvas.height) {
                this.failLevel();
                return;
            }
        }
    }

    updateEscapeLogic() {
        const esc = this.level.escape;

        // 1. Wall Chase (slower when bell is loud to give player a chance)
        const wallSpeedModifier = esc.bellState === 'loud' ? 0.3 : 1.0;
        esc.wallX += esc.wallSpeed * wallSpeedModifier;

        if (this.player.x < esc.wallX + 50) {
            console.log("Crushed by Wall");
            this.failLevel();
            return;
        }

        // 2. Bell Rhythm
        // Quiet (Run!) -> Warning (Find cover!) -> Loud (Hide or die!)
        esc.bellTimer++;

        // Adjusted timing - more forgiving
        const T_QUIET = 180;   // ~3 seconds to run
        const T_WARNING = 45;  // ~0.75 seconds warning
        const T_LOUD = 70;     // ~1.2 seconds to hide (shorter!)

        if (esc.bellState === 'quiet') {
            if (esc.bellTimer > T_QUIET) {
                esc.bellState = 'warning';
                esc.bellTimer = 0;
            }
        } else if (esc.bellState === 'warning') {
            if (esc.bellTimer > T_WARNING) {
                esc.bellState = 'loud';
                esc.bellTimer = 0;
            }
        } else if (esc.bellState === 'loud') {
            // DANGER CHECK - Must be hiding behind cover!
            // Same mechanic as stealth phase for consistency
            let isSafe = false;

            if (this.player.isHiding && this.player.nearCover) {
                isSafe = true;
            }

            if (!isSafe) {
                console.log("Not hiding during Loud Bell -> Death");
                this.failLevel();
                return;
            }

            if (esc.bellTimer > T_LOUD) {
                esc.bellState = 'quiet';
                esc.bellTimer = 0;
            }
        }

        // 3. Falling Debris (less frequent)
        if (Math.random() < 0.02) {
            esc.debris.push({
                x: this.player.x + (Math.random() * 400 - 200),
                y: -50,
                vy: 3 + Math.random() * 3,
                width: 15 + Math.random() * 20,
                height: 15 + Math.random() * 20
            });
        }

        // Update Debris
        for (let i = esc.debris.length - 1; i >= 0; i--) {
            const d = esc.debris[i];
            d.y += d.vy;
            // Collision with player
            if (this.checkCollision(this.player, d)) {
                console.log("Hit by debris");
                this.failLevel();
            }
            // Remove if off screen
            if (d.y > this.canvas.height) {
                esc.debris.splice(i, 1);
            }
        }
    }

    updateClimbLogic() {
        const climb = this.level.climb;
        climb.noiseLevel = 0;

        // 1. Noise Logic (Running on Hard Surfaces)
        if (this.player.isGrounded && this.player.stoodPlatform) {
            const plat = this.player.stoodPlatform;

            if (plat.surface === 'hard') {
                // If moving fast (> 1) and NOT crawling (down key), make noise
                if (Math.abs(this.player.vx) > 1.0 && !this.keys.down) {
                    climb.noiseLevel = 1;
                    climb.wakefulnessLevel += 0.3;
                }
            }
        }

        // 2. Decay wakefulness
        climb.wakefulnessLevel = Math.max(0, climb.wakefulnessLevel - 0.05);

        // 3. Game over check
        if (climb.wakefulnessLevel >= 100) {
            console.log("Cat woke up from NOISE!");
            this.failLevel();
            return;
        }

        // 4. Horizontal Camera Follow (Standard)
        const centerScreen = this.canvas.width / 2;
        let targetCameraX = this.player.x - centerScreen;

        // Clamp camera
        if (targetCameraX < 0) targetCameraX = 0;
        if (targetCameraX > this.level.width - this.canvas.width) {
            targetCameraX = this.level.width - this.canvas.width;
        }

        // Smooth lerp
        this.level.cameraX += (targetCameraX - this.level.cameraX) * 0.1;

        // 5. Goal check
        if (this.checkCollision(this.player, this.level.goal)) {
            this.winLevel();
            return;
        }
    }

    updateChaseLogic() {
        const chase = this.level.chase;

        // 1. Auto-scroll
        chase.cameraX += chase.scrollSpeed;
        this.player.x += chase.scrollSpeed * 0.8; // Player moves slightly slower than camera

        // Player can speed up or slow down slightly
        if (this.keys.right) this.player.x += 2;
        if (this.keys.left) this.player.x -= 1;

        // Keep player on screen
        if (this.player.x < chase.cameraX + 50) {
            this.player.x = chase.cameraX + 50;
        }
        if (this.player.x > chase.cameraX + this.canvas.width - 100) {
            this.player.x = chase.cameraX + this.canvas.width - 100;
        }

        this.level.cameraX = chase.cameraX;

        // 2. Attack patterns
        chase.attackTimer++;

        if (!chase.attackWarning && !chase.attackActive) {
            // Start new attack warning every 1.5-2.5 seconds
            if (chase.attackTimer > 90 + Math.random() * 60) {
                chase.attackWarning = true;
                chase.attackType = Math.random() < 0.5 ? 'high' : 'low';
                chase.attackTimer = 0;
            }
        } else if (chase.attackWarning) {
            // Warning lasts ~0.7 seconds
            if (chase.attackTimer > 40) {
                chase.attackWarning = false;
                chase.attackActive = true;
                chase.attackTimer = 0;
            }
        } else if (chase.attackActive) {
            // Check if player dodged correctly
            const playerDucking = this.keys.down;
            const playerJumping = !this.player.isGrounded;

            if (chase.attackType === 'high' && !playerDucking) {
                // High attack - player should duck
                console.log("Hit by high attack!");
                this.failLevel();
                return;
            } else if (chase.attackType === 'low' && !playerJumping) {
                // Low attack - player should jump
                console.log("Hit by low attack!");
                this.failLevel();
                return;
            }

            // Attack lasts ~0.3 seconds
            if (chase.attackTimer > 20) {
                chase.attackActive = false;
                chase.attackTimer = 0;
            }
        }

        // 3. Win condition
        if (this.player.x >= this.level.goal.x) {
            this.winLevel();
            return;
        }
    }

    updateQTELogic() {
        const qte = this.level.qte;

        qte.timer++;

        // Progress decays over time
        qte.progress = Math.max(0, qte.progress - qte.decay);

        // Check for space key press (handled in handleKey with a flag)
        // We'll use a different approach - check if space was just pressed

        // Win condition
        if (qte.progress >= qte.required) {
            this.winLevel();
            return;
        }

        // Time limit
        if (qte.timer >= qte.timeLimit) {
            console.log("Failed to strangle the cat in time!");
            this.failLevel();
            return;
        }
    }

    // Special key handler for QTE
    handleQTEMash() {
        if (this.level.phase === 'qte' && this.level.qte) {
            this.level.qte.progress += 3;
            this.level.qte.mashCount++;
        }
    }

    enterStealthPhase() {
        if (this.level.phase === 'stealth_transition' || this.level.phase === 'stealth') return;

        console.log("Entering Stealth Phase (Transition)...");
        this.level.phase = 'stealth_transition';

        // Stop player
        this.player.vx = 0;
        this.keys = { left: false, right: false, up: false, down: false };

        // Trigger Director Event
        this.director.triggerEvent('stealth_intro_start');
    }

    completeStealthTransition() {
        console.log("Stealth Transition Complete -> Active Stealth");
        this.level.phase = 'stealth';
        // Reset cat timer
        this.level.cat.timer = 0;
        this.level.cat.state = 'sleeping';

        // Ensure player controls are reset (Director handles UI hiding)
        this.state = 'running';
    }

    updateCamera() {
        // Climb phase uses vertical camera (handled in updateClimbLogic)
        if (this.level.phase === 'climb') return;

        // Chase phase camera is handled in updateChaseLogic
        if (this.level.phase === 'chase') return;

        // QTE doesn't need camera
        if (this.level.phase === 'qte') return;

        const centerScreen = this.canvas.width / 2;

        if (this.level.phase === 'stealth_transition') {
            // Pan to Cat
            let targetCameraX = this.level.cat.x - centerScreen; // Center on cat
            // Smooth pan
            this.level.cameraX += (targetCameraX - this.level.cameraX) * 0.05;
            return;
        }

        let targetCameraX = this.player.x - centerScreen;

        // Smooth camera transition
        if (this.level.phase === 'stealth') {
            // Slower, more tense camera movement
            this.level.cameraX += (targetCameraX - this.level.cameraX) * 0.05;
        } else {
            // Normal follow
            if (this.player.x > centerScreen) {
                this.level.cameraX = targetCameraX;
            }
        }

        // Clamp camera
        if (this.level.cameraX < 0) this.level.cameraX = 0;
        if (this.level.cameraX > this.level.width - this.canvas.width) {
            this.level.cameraX = this.level.width - this.canvas.width;
        }
    }

    updateCatLogic() {
        const cat = this.level.cat;
        cat.timer++;

        // State timing - sleeping longer, watching shorter
        const sleepDuration = 180 + Math.random() * 60; // 3-4 seconds
        const watchDuration = 90 + Math.random() * 30;   // 1.5-2 seconds

        if (cat.state === 'sleeping' && cat.timer > sleepDuration) {
            cat.state = 'watching';
            cat.timer = 0;
            console.log("Cat is WATCHING!");
        } else if (cat.state === 'watching' && cat.timer > watchDuration) {
            cat.state = 'sleeping';
            cat.timer = 0;
            console.log("Cat is sleeping...");
        }

        // Detection during watching state
        if (cat.state === 'watching') {
            let isSafe = false;

            // Player is safe ONLY if hiding behind a cover
            if (this.player.isHiding && this.player.nearCover) {
                isSafe = true;
            }

            if (!isSafe) {
                // Caught!
                console.log("Caught by Cat!");
                this.failLevel();
            }
        }
    }

    checkCollision(rect1, rect2) {
        return (
            rect1.x < rect2.x + rect2.width &&
            rect1.x + rect1.width > rect2.x &&
            rect1.y < rect2.y + rect2.height &&
            rect1.y + rect1.height > rect2.y
        );
    }

    draw() {
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

        // Special renders for specific phases
        if (this.level.phase === 'climb') {
            this.drawClimb();
            return;
        }
        if (this.level.phase === 'chase') {
            this.drawChase();
            return;
        }
        if (this.level.phase === 'qte') {
            this.drawQTE();
            return;
        }

        // Background gradient based on phase
        if (this.level.phase === 'stealth' || this.level.phase === 'stealth_transition') {
            const gradient = this.ctx.createLinearGradient(0, 0, 0, this.canvas.height);
            gradient.addColorStop(0, '#1a0a0a');
            gradient.addColorStop(1, '#0a0505');
            this.ctx.fillStyle = gradient;
            this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
        } else if (this.level.phase === 'escape') {
            // Red tint for danger
            const gradient = this.ctx.createLinearGradient(0, 0, 0, this.canvas.height);
            gradient.addColorStop(0, '#331111');
            gradient.addColorStop(1, '#110505');
            this.ctx.fillStyle = gradient;
            this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
        }

        this.ctx.save();

        // SCREEN SHAKE for Escape Loud
        let shakeX = 0;
        let shakeY = 0;
        if (this.level.phase === 'escape' && this.level.escape.bellState === 'loud') {
            shakeX = (Math.random() - 0.5) * 10;
            shakeY = (Math.random() - 0.5) * 10;
        }
        this.ctx.translate(-this.level.cameraX + shakeX, 0 + shakeY);

        // Draw transition zone indicator
        if (this.level.stealthZoneStart > 0 && this.level.phase !== 'escape') {
            // Dark overlay for stealth zone
            this.ctx.fillStyle = 'rgba(50, 0, 0, 0.3)';
            this.ctx.fillRect(this.level.stealthZoneStart, 0, this.level.width - this.level.stealthZoneStart, this.canvas.height);
        }

        // ESCAPE: Draw Wall
        if (this.level.phase === 'escape') {
            // The Wall
            this.ctx.fillStyle = '#000';
            this.ctx.fillRect(this.level.escape.wallX - 5000, 0, 5000 + 50, this.canvas.height); // Huge black block

            // Visual Edge of wall
            this.ctx.fillStyle = '#ff0000';
            this.ctx.globalAlpha = 0.5 + Math.sin(Date.now() / 100) * 0.2;
            this.ctx.fillRect(this.level.escape.wallX, 0, 50, this.canvas.height);
            this.ctx.globalAlpha = 1.0;
        }

        // Draw Platforms
        for (const plat of this.level.platforms) {
            if (plat.isStealthPlatform) {
                // Elevated stealth platforms - darker with subtle highlight
                this.ctx.fillStyle = '#1a1a1a';
                this.ctx.fillRect(plat.x, plat.y, plat.width, plat.height);
                // Top edge highlight
                this.ctx.fillStyle = '#333';
                this.ctx.fillRect(plat.x, plat.y, plat.width, 3);
                // Side shadows for depth
                this.ctx.fillStyle = '#0a0a0a';
                this.ctx.fillRect(plat.x, plat.y + plat.height, plat.width, 8);
            } else {
                // Ground platforms
                this.ctx.fillStyle = this.level.phase === 'stealth' ? '#2a2a2a' : '#444';
                this.ctx.fillRect(plat.x, plat.y, plat.width, plat.height);
            }
        }

        // ESCAPE: Draw Debris
        if (this.level.phase === 'escape') {
            this.ctx.fillStyle = '#553333';
            for (const d of this.level.escape.debris) {
                this.ctx.fillRect(d.x, d.y, d.width, d.height);
            }
        }

        // Draw Covers (boxes) with highlight if player can hide
        if (this.level.covers) {
            for (const cover of this.level.covers) {
                // Highlight cover if player is near it
                if (this.player.nearCover === cover) {
                    this.ctx.fillStyle = this.player.isHiding ? '#4a7a4a' : '#5a5a3a';
                } else {
                    this.ctx.fillStyle = '#555';
                }
                this.ctx.fillRect(cover.x, cover.y, cover.width, cover.height);

                // Draw box detail (cross pattern)
                this.ctx.strokeStyle = '#333';
                this.ctx.lineWidth = 2;
                this.ctx.strokeRect(cover.x + 5, cover.y + 5, cover.width - 10, cover.height - 10);
            }
        }

        // Draw Cat silhouette (in stealth phase)
        if (this.level.phase === 'stealth' ||
            this.level.phase === 'stealth_transition' ||
            this.player.x > this.level.stealthZoneStart - 500) {
            this.drawCat();
        }

        // Draw Goal (subtle glow)
        this.ctx.fillStyle = this.level.phase === 'stealth' ? 'rgba(255, 200, 100, 0.3)' : '#ffff00';
        this.ctx.fillRect(this.level.goal.x, this.level.goal.y, this.level.goal.width, this.level.goal.height);

        // Draw Player
        let playerColor = '#fff';
        if (this.player.isHiding) {
            playerColor = '#6a6a6a';
        } else if (this.player.canHide) {
            playerColor = '#aaffaa'; // Green tint when can hide
        }
        this.ctx.fillStyle = playerColor;

        let pHeight = this.player.height;
        let pY = this.player.y;
        if (this.player.isHiding) {
            pHeight = this.player.height / 2;
            pY = this.player.y + pHeight;
        }
        this.ctx.fillRect(this.player.x, pY, this.player.width, pHeight);

        // Player eyes
        this.ctx.fillStyle = '#000';
        if (!this.player.isHiding) {
            this.ctx.fillRect(this.player.x + 8, this.player.y + 8, 4, 4);
            this.ctx.fillRect(this.player.x + 18, this.player.y + 8, 4, 4);
        }

        this.ctx.restore();

        // Draw HUD
        this.drawHUD();
    }

    drawClimb() {
        const climb = this.level.climb;

        // Background - Dark Room
        this.ctx.fillStyle = '#050505';
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

        this.ctx.save();
        this.ctx.translate(-this.level.cameraX, 0); // Horizontal scroll

        // Draw Platforms (Furniture)
        for (const plat of this.level.platforms) {
            // Fill
            if (plat.surface === 'soft') {
                this.ctx.fillStyle = '#4a2a2a'; // Reddish/Soft
            } else if (plat.surface === 'hard') {
                this.ctx.fillStyle = '#2a2a3a'; // Blueish/Hard
            } else {
                this.ctx.fillStyle = '#333';
            }
            this.ctx.fillRect(plat.x, plat.y, plat.width, plat.height);

            // Border/Detail
            this.ctx.strokeStyle = plat.surface === 'soft' ? '#885555' : '#555588';
            this.ctx.lineWidth = 2;
            this.ctx.strokeRect(plat.x, plat.y, plat.width, plat.height);

            // Text visual for furniture
            this.ctx.fillStyle = 'rgba(255,255,255,0.2)';
            this.ctx.font = '20px serif';
            this.ctx.fillText(plat.type, plat.x + 10, plat.y + 30);
        }

        // Goal (Cat Visual)
        const goal = this.level.goal;
        this.ctx.fillStyle = '#aa8833'; // Cat color
        this.ctx.beginPath();
        this.ctx.ellipse(goal.x + goal.width / 2, goal.y + goal.height / 2, 60, 40, 0, 0, Math.PI * 2);
        this.ctx.fill();
        this.ctx.fillStyle = '#fff';
        this.ctx.textAlign = 'center';
        this.ctx.font = '12px Courier New';
        this.ctx.fillText("ZZZ", goal.x + goal.width / 2, goal.y - 10);
        this.ctx.textAlign = 'left';


        // Player
        if (climb.noiseLevel > 0) {
            // Making noise! Flash red
            this.ctx.fillStyle = '#ff0000';
            // Draw noise ripples
            this.ctx.strokeStyle = '#ff0000';
            this.ctx.beginPath();
            this.ctx.arc(this.player.x + this.player.width / 2, this.player.y + this.player.height, 20 + Math.random() * 10, 0, Math.PI * 2);
            this.ctx.stroke();
        } else {
            this.ctx.fillStyle = '#fff';
        }

        // Crouch visual
        if (this.keys.down) {
            this.ctx.fillRect(this.player.x, this.player.y + 10, this.player.width, this.player.height - 10);
        } else {
            this.ctx.fillRect(this.player.x, this.player.y, this.player.width, this.player.height);
        }

        this.ctx.restore();

        // HUD - Wakefulness
        const meterWidth = 300;
        const meterX = this.canvas.width / 2 - meterWidth / 2;

        // Background
        this.ctx.fillStyle = '#220000';
        this.ctx.fillRect(meterX, 50, meterWidth, 25);

        // Bar
        const wakeP = Math.min(100, climb.wakefulnessLevel) / 100;
        this.ctx.fillStyle = wakeP > 0.8 ? '#ff0000' : '#ffaa00';
        this.ctx.fillRect(meterX, 50, meterWidth * wakeP, 25);

        // Border
        this.ctx.strokeStyle = '#fff';
        this.ctx.strokeRect(meterX, 50, meterWidth, 25);

        // Text
        this.ctx.fillStyle = '#fff';
        this.ctx.font = 'bold 16px Courier New';
        this.ctx.textAlign = 'center';
        this.ctx.fillText("CAT WAKEFULNESS", this.canvas.width / 2, 40);

        let hint = 'Air';
        if (this.player.stoodPlatform) {
            hint = this.player.stoodPlatform.surface === 'hard' ? 'Hard Surface (CRAWL!)' : 'Soft Surface (Run OK)';
        }
        this.ctx.font = '14px Courier New';
        this.ctx.fillText(hint, this.canvas.width / 2, 95);

        this.ctx.textAlign = 'left';
    }

    drawChase() {
        const chase = this.level.chase;

        // Background - rushing blur effect
        const gradient = this.ctx.createLinearGradient(0, 0, this.canvas.width, 0);
        gradient.addColorStop(0, '#1a0505');
        gradient.addColorStop(1, '#0a0a0a');
        this.ctx.fillStyle = gradient;
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

        // Motion lines
        this.ctx.strokeStyle = 'rgba(255, 100, 100, 0.3)';
        this.ctx.lineWidth = 2;
        for (let i = 0; i < 10; i++) {
            const y = Math.random() * this.canvas.height;
            this.ctx.beginPath();
            this.ctx.moveTo(0, y);
            this.ctx.lineTo(100 + Math.random() * 100, y);
            this.ctx.stroke();
        }

        this.ctx.save();
        this.ctx.translate(-chase.cameraX, 0);

        // Draw ground
        const floorY = this.canvas.height - 100;
        this.ctx.fillStyle = '#2a2a2a';
        this.ctx.fillRect(0, floorY, this.level.width, 100);

        // Draw player
        let pHeight = this.player.height;
        let pY = this.player.y;
        if (this.keys.down && this.player.isGrounded) {
            // Ducking
            pHeight = this.player.height / 2;
            pY = this.player.y + pHeight;
        }
        this.ctx.fillStyle = '#fff';
        this.ctx.fillRect(this.player.x, pY, this.player.width, pHeight);

        this.ctx.restore();

        // Attack warning/indicator
        if (chase.attackWarning || chase.attackActive) {
            const attackY = chase.attackType === 'high' ? 100 : this.canvas.height - 150;
            const attackHeight = 80;

            if (chase.attackWarning) {
                // Warning - flashing
                this.ctx.fillStyle = `rgba(255, 255, 0, ${0.3 + Math.sin(Date.now() * 0.02) * 0.2})`;
            } else {
                // Active attack - red
                this.ctx.fillStyle = 'rgba(255, 0, 0, 0.6)';
            }

            this.ctx.fillRect(0, attackY, this.canvas.width, attackHeight);

            // Attack indicator text
            this.ctx.fillStyle = '#fff';
            this.ctx.font = 'bold 24px Courier New';
            this.ctx.textAlign = 'center';
            if (chase.attackType === 'high') {
                this.ctx.fillText(chase.attackActive ? "DUCK!" : "HIGH ATTACK!", this.canvas.width / 2, attackY + 50);
            } else {
                this.ctx.fillText(chase.attackActive ? "JUMP!" : "LOW ATTACK!", this.canvas.width / 2, attackY + 50);
            }
        }

        // HUD
        this.ctx.fillStyle = '#fff';
        this.ctx.font = 'bold 20px Courier New';
        this.ctx.textAlign = 'center';
        this.ctx.fillText("ESCAPE! (↓ Duck, ↑ Jump)", this.canvas.width / 2, 40);
        this.ctx.textAlign = 'left';

        // Progress bar
        const progress = (this.player.x / this.level.goal.x) * 100;
        const barWidth = 300;
        const barX = this.canvas.width / 2 - barWidth / 2;
        this.ctx.fillStyle = '#333';
        this.ctx.fillRect(barX, 60, barWidth, 15);
        this.ctx.fillStyle = '#66ff66';
        this.ctx.fillRect(barX, 60, barWidth * (progress / 100), 15);
    }

    drawQTE() {
        const qte = this.level.qte;

        // Dark red background
        const gradient = this.ctx.createRadialGradient(
            this.canvas.width / 2, this.canvas.height / 2, 0,
            this.canvas.width / 2, this.canvas.height / 2, this.canvas.width / 2
        );
        gradient.addColorStop(0, '#2a0a0a');
        gradient.addColorStop(1, '#0a0505');
        this.ctx.fillStyle = gradient;
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

        // Cat's eye in background
        this.ctx.fillStyle = '#ffcc00';
        this.ctx.globalAlpha = 0.3 + (qte.progress / 100) * 0.3;
        this.ctx.beginPath();
        this.ctx.ellipse(this.canvas.width / 2, this.canvas.height / 2, 150, 200, 0, 0, Math.PI * 2);
        this.ctx.fill();

        // Pupil (shrinks as you strangle)
        this.ctx.fillStyle = '#000';
        const pupilWidth = 20 - (qte.progress / 100) * 15;
        this.ctx.beginPath();
        this.ctx.ellipse(this.canvas.width / 2, this.canvas.height / 2, pupilWidth, 180, 0, 0, Math.PI * 2);
        this.ctx.fill();
        this.ctx.globalAlpha = 1.0;

        // Progress bar
        const barWidth = 400;
        const barX = this.canvas.width / 2 - barWidth / 2;
        const barY = this.canvas.height - 150;

        this.ctx.fillStyle = '#333';
        this.ctx.fillRect(barX, barY, barWidth, 40);
        this.ctx.fillStyle = '#ff3333';
        this.ctx.fillRect(barX, barY, barWidth * (qte.progress / 100), 40);
        this.ctx.strokeStyle = '#fff';
        this.ctx.lineWidth = 2;
        this.ctx.strokeRect(barX, barY, barWidth, 40);

        // Text
        this.ctx.fillStyle = '#fff';
        this.ctx.font = 'bold 36px Courier New';
        this.ctx.textAlign = 'center';
        this.ctx.fillText("MASH SPACE!", this.canvas.width / 2, 100);

        // Mash count
        this.ctx.font = '24px Courier New';
        this.ctx.fillText(`Mashes: ${qte.mashCount}`, this.canvas.width / 2, 150);

        // Time remaining
        const timeLeft = Math.ceil((qte.timeLimit - qte.timer) / 60);
        this.ctx.fillStyle = timeLeft <= 3 ? '#ff3333' : '#fff';
        this.ctx.fillText(`Time: ${timeLeft}s`, this.canvas.width / 2, barY + 80);

        this.ctx.textAlign = 'left';
    }

    drawCat() {
        const cat = this.level.cat;

        // Cat body silhouette
        this.ctx.fillStyle = '#1a1a1a';
        this.ctx.beginPath();
        this.ctx.ellipse(cat.x, cat.y + 50, 120, 80, 0, 0, Math.PI * 2);
        this.ctx.fill();

        // Cat head
        this.ctx.beginPath();
        this.ctx.ellipse(cat.x - 80, cat.y, 60, 50, -0.3, 0, Math.PI * 2);
        this.ctx.fill();

        // Cat ears
        this.ctx.beginPath();
        this.ctx.moveTo(cat.x - 120, cat.y - 30);
        this.ctx.lineTo(cat.x - 140, cat.y - 80);
        this.ctx.lineTo(cat.x - 100, cat.y - 40);
        this.ctx.fill();

        this.ctx.beginPath();
        this.ctx.moveTo(cat.x - 60, cat.y - 40);
        this.ctx.lineTo(cat.x - 50, cat.y - 85);
        this.ctx.lineTo(cat.x - 30, cat.y - 35);
        this.ctx.fill();

        // Cat eye (THE EYE)
        if (cat.state === 'watching') {
            // Open eye - menacing yellow
            this.ctx.fillStyle = '#ffcc00';
            this.ctx.beginPath();
            this.ctx.ellipse(cat.x - 90, cat.y - 5, 15, 20, 0, 0, Math.PI * 2);
            this.ctx.fill();

            // Pupil - slit
            this.ctx.fillStyle = '#000';
            this.ctx.beginPath();
            this.ctx.ellipse(cat.x - 90, cat.y - 5, 3, 18, 0, 0, Math.PI * 2);
            this.ctx.fill();
        } else {
            // Closed eye - sleeping
            this.ctx.strokeStyle = '#333';
            this.ctx.lineWidth = 3;
            this.ctx.beginPath();
            this.ctx.moveTo(cat.x - 105, cat.y - 5);
            this.ctx.quadraticCurveTo(cat.x - 90, cat.y + 5, cat.x - 75, cat.y - 5);
            this.ctx.stroke();
        }
    }

    drawHUD() {
        this.ctx.fillStyle = '#fff';
        this.ctx.font = '16px Courier New';

        if (this.level.phase === 'journey') {
            this.ctx.fillText("→ Keep moving right", 20, 30);
        } else if (this.level.phase === 'escape') {
            const esc = this.level.escape;
            this.ctx.textAlign = 'center';
            const cx = this.canvas.width / 2;

            if (esc.bellState === 'quiet') {
                this.ctx.fillStyle = '#aaffaa';
                this.ctx.font = 'bold 20px Courier New';
                this.ctx.fillText("RUN! Find the next cover!", cx, 50);
            } else if (esc.bellState === 'warning') {
                this.ctx.fillStyle = '#ffaa00';
                this.ctx.font = 'bold 22px Courier New';
                this.ctx.fillText("!! FIND COVER NOW !!", cx, 50);
            } else {
                this.ctx.fillStyle = '#ff3333';
                this.ctx.font = 'bold 26px Courier New';
                this.ctx.fillText("!!! HIDE !!!", cx, 50);
            }
            this.ctx.textAlign = 'left';

            // Hide indicator (bottom left)
            this.ctx.font = '14px Courier New';
            if (this.player.canHide) {
                if (this.player.isHiding) {
                    this.ctx.fillStyle = '#66ff66';
                    this.ctx.fillText("✓ HIDDEN - Stay down!", 20, 30);
                } else {
                    this.ctx.fillStyle = '#aaffaa';
                    this.ctx.fillText("[DOWN] to hide behind box", 20, 30);
                }
            } else {
                this.ctx.fillStyle = '#ff9999';
                this.ctx.fillText("→ Run to next box!", 20, 30);
            }
        } else {
            // Stealth HUD
            const cat = this.level.cat;

            // Cat state indicator (top center)
            const eyeX = this.canvas.width / 2;
            const eyeY = 50;

            // Eye background
            this.ctx.fillStyle = cat.state === 'watching' ? '#ff3333' : '#333';
            this.ctx.beginPath();
            this.ctx.ellipse(eyeX, eyeY, 50, 30, 0, 0, Math.PI * 2);
            this.ctx.fill();

            // Eye inner
            if (cat.state === 'watching') {
                this.ctx.fillStyle = '#ffcc00';
                this.ctx.beginPath();
                this.ctx.ellipse(eyeX, eyeY, 40, 25, 0, 0, Math.PI * 2);
                this.ctx.fill();

                // Pupil
                this.ctx.fillStyle = '#000';
                this.ctx.beginPath();
                this.ctx.ellipse(eyeX, eyeY, 5, 22, 0, 0, Math.PI * 2);
                this.ctx.fill();
            }

            // Status text
            this.ctx.fillStyle = cat.state === 'watching' ? '#ff6666' : '#aaaaaa';
            this.ctx.font = 'bold 18px Courier New';
            this.ctx.textAlign = 'center';
            this.ctx.fillText(cat.state === 'watching' ? '!! HIDE !!' : 'Move carefully...', eyeX, eyeY + 55);
            this.ctx.textAlign = 'left';

            // Hide indicator
            if (this.player.canHide) {
                this.ctx.fillStyle = '#aaffaa';
                this.ctx.font = '14px Courier New';
                this.ctx.fillText("[DOWN] to hide", 20, 30);
            } else if (this.level.phase === 'stealth') {
                this.ctx.fillStyle = '#ff9999';
                this.ctx.font = '14px Courier New';
                this.ctx.fillText("Find cover!", 20, 30);
            }
        }
    }

    winLevel() {
        console.log("Level Complete!");
        this.stop();
        this.director.onMinigameComplete(true);
    }

    failLevel() {
        console.log("Level Failed!");
        this.stop();
        this.director.onMinigameComplete(false);
    }
}
