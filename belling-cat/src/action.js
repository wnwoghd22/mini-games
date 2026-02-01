export class ActionEngine {
    constructor(director) {
        this.director = director;
        this.canvas = document.getElementById('action-canvas');
        this.ctx = this.canvas.getContext('2d');
        this.isRunning = false;
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
        if (e.code === 'ArrowUp' || e.code === 'Space') this.keys.up = isDown;
        if (e.code === 'ArrowDown') this.keys.down = isDown;
    }

    start(levelType) {
        console.log(`Action Engine: Starting Level ${levelType}`);
        this.currentMinigame = levelType; // Track minigame type
        this.isRunning = true;
        this.loadLevel(levelType);
        this.loop();
    }

    stop() {
        this.isRunning = false;
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
            // Flat ground continues
            this.level.platforms.push({ x: 2400, y: floorY, width: 2600, height: 100 });

            // Covers (boxes) - strategic placement
            const coverPositions = [2600, 2900, 3200, 3600, 4000, 4400, 4700];
            coverPositions.forEach((xPos, i) => {
                this.level.covers.push({
                    x: xPos,
                    y: floorY - 60,
                    width: 70,
                    height: 60,
                    id: i
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

            this.level.platforms.push({ x: 0, y: floorY, width: this.level.width, height: 100 });

            const coverPositions = [200, 500, 800, 1200, 1600, 2000];
            coverPositions.forEach((xPos, i) => {
                this.level.covers.push({
                    x: xPos,
                    y: floorY - 60,
                    width: 70,
                    height: 60,
                    id: i
                });
            });

            this.level.cat.x = 2400;
            this.level.cat.y = floorY - 150;
            this.level.goal = { x: 2350, y: floorY - 100, width: 80, height: 100 };
        }
    }

    loop() {
        if (!this.isRunning) return;

        this.update();
        this.draw();
        requestAnimationFrame(() => this.loop());
    }

    update() {
        // 0. Phase Transition Check (Journey → Stealth)
        if (this.level.phase === 'journey' && this.player.x >= this.level.stealthZoneStart) {
            this.enterStealthPhase();
        }

        // 1. Stealth Logic (Cat State) - Only in stealth phase
        if (this.level.phase === 'stealth') {
            this.updateCatLogic();
        }

        // 2. Check if player is near a cover (can hide)
        this.player.canHide = false;
        this.player.nearCover = null;

        if (this.level.covers && this.level.phase === 'stealth') {
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

        // Can only hide if near a cover, grounded, and pressing DOWN
        if (this.keys.down && this.player.isGrounded && this.player.canHide) {
            this.player.isHiding = true;
            this.player.vx = 0; // Stop moving while hiding
        } else {
            if (this.keys.left) this.player.vx = -this.MOVE_SPEED;
            if (this.keys.right) this.player.vx = this.MOVE_SPEED;
        }

        // Friction when no key pressed
        if (!this.keys.left && !this.keys.right) {
            this.player.vx *= this.FRICTION;
        }

        // 4. Jump (Cannot jump while hiding, reduced in stealth phase)
        if (this.keys.up && this.player.isGrounded && !this.player.isHiding) {
            const jumpForce = this.level.phase === 'stealth' ? this.JUMP_FORCE * 0.5 : this.JUMP_FORCE;
            this.player.vy = -jumpForce;
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

        // 9. Goal Check
        if (this.checkCollision(this.player, this.level.goal)) {
            this.winLevel();
        }

        // 10. Fall Check (Death)
        if (this.player.y > this.canvas.height) {
            this.failLevel();
        }
    }

    enterStealthPhase() {
        console.log("Entering Stealth Phase...");
        this.level.phase = 'stealth';
        // Slow down player for dramatic effect
        this.player.vx *= 0.3;
        // Reset cat timer for fair start
        this.level.cat.timer = 0;
        this.level.cat.state = 'sleeping';
    }

    updateCamera() {
        const centerScreen = this.canvas.width / 2;
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

        // Background gradient based on phase
        if (this.level.phase === 'stealth') {
            const gradient = this.ctx.createLinearGradient(0, 0, 0, this.canvas.height);
            gradient.addColorStop(0, '#1a0a0a');
            gradient.addColorStop(1, '#0a0505');
            this.ctx.fillStyle = gradient;
            this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
        }

        this.ctx.save();
        this.ctx.translate(-this.level.cameraX, 0);

        // Draw transition zone indicator
        if (this.level.stealthZoneStart > 0) {
            // Dark overlay for stealth zone
            this.ctx.fillStyle = 'rgba(50, 0, 0, 0.3)';
            this.ctx.fillRect(this.level.stealthZoneStart, 0, this.level.width - this.level.stealthZoneStart, this.canvas.height);
        }

        // Draw Platforms
        this.ctx.fillStyle = this.level.phase === 'stealth' ? '#2a2a2a' : '#444';
        for (const plat of this.level.platforms) {
            this.ctx.fillRect(plat.x, plat.y, plat.width, plat.height);
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
        if (this.level.phase === 'stealth' || this.player.x > this.level.stealthZoneStart - 500) {
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
