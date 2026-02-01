export class ActionEngine {
    constructor(director) {
        this.director = director;
        this.canvas = document.getElementById('action-canvas');
        this.ctx = this.canvas.getContext('2d');
        this.isRunning = false;

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
            isGrounded: false
        };

        this.level = {
            platforms: [],
            goal: { x: 0, y: 0, width: 0, height: 0 },
            width: 2000, // Total level width
            cameraX: 0
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
        // Placeholder level generation
        // In the future, this should load from a JSON or distinct file

        const floorY = this.canvas.height - 100;

        this.player.x = 50;
        this.player.y = floorY - 50;
        this.player.vx = 0;
        this.player.vy = 0;

        this.level.platforms = [];
        this.level.cameraX = 0;

        if (type === 'journey' || type === 'stealth') {
            // Ground
            this.level.platforms.push({ x: 0, y: floorY, width: 3000, height: 100 });

            // Random Platforms
            for (let i = 0; i < 10; i++) {
                this.level.platforms.push({
                    x: 300 + (i * 200),
                    y: floorY - 50 - (Math.random() * 100),
                    width: 100,
                    height: 20
                });
            }

            // Goal
            this.level.goal = { x: 2800, y: floorY - 100, width: 50, height: 100 };
            this.level.width = 3000;
        }
    }

    loop() {
        if (!this.isRunning) return;

        this.update();
        this.draw();
        requestAnimationFrame(() => this.loop());
    }

    update() {
        // 1. Horizontal Movement
        if (this.keys.left) this.player.vx = -this.MOVE_SPEED;
        if (this.keys.right) this.player.vx = this.MOVE_SPEED;

        // Friction when no key pressed
        if (!this.keys.left && !this.keys.right) {
            this.player.vx *= this.FRICTION;
        }

        // 2. Jump
        if (this.keys.up && this.player.isGrounded) {
            this.player.vy = -this.JUMP_FORCE;
            this.player.isGrounded = false;
        }

        // 3. Gravity
        this.player.vy += this.GRAVITY;

        // 4. Apply Velocity
        this.player.x += this.player.vx;
        this.player.y += this.player.vy;

        // 5. Collision Detection
        this.player.isGrounded = false;

        // Floor/Platform Collision
        for (const plat of this.level.platforms) {
            if (this.checkCollision(this.player, plat)) {
                // Landed on top
                if (this.player.vy > 0 && this.player.y + this.player.height - this.player.vy <= plat.y) {
                    this.player.y = plat.y - this.player.height;
                    this.player.vy = 0;
                    this.player.isGrounded = true;
                }
                // Hit head? (Optional for now)
            }
        }

        // 6. Camera Follow
        const centerScreen = this.canvas.width / 2;
        if (this.player.x > centerScreen) {
            this.level.cameraX = this.player.x - centerScreen;
        }
        // Clamp camera
        if (this.level.cameraX < 0) this.level.cameraX = 0;
        if (this.level.cameraX > this.level.width - this.canvas.width) {
            this.level.cameraX = this.level.width - this.canvas.width;
        }

        // 7. Goal Check
        if (this.checkCollision(this.player, this.level.goal)) {
            this.winLevel();
        }

        // 8. Fall Check (Death)
        if (this.player.y > this.canvas.height) {
            this.failLevel();
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
        this.ctx.save();
        this.ctx.translate(-this.level.cameraX, 0);

        // Draw Platforms
        this.ctx.fillStyle = '#444'; // Dark stone color
        for (const plat of this.level.platforms) {
            this.ctx.fillRect(plat.x, plat.y, plat.width, plat.height);
        }

        // Draw Goal
        this.ctx.fillStyle = '#ffff00'; // Light at the end
        this.ctx.fillRect(this.level.goal.x, this.level.goal.y, this.level.goal.width, this.level.goal.height);

        // Draw Player
        this.ctx.fillStyle = '#fff';
        this.ctx.fillRect(this.player.x, this.player.y, this.player.width, this.player.height);

        this.ctx.restore();

        // Draw HUD
        this.ctx.fillStyle = '#fff';
        this.ctx.font = '20px Courier New';
        this.ctx.fillText("Controls: Arrows to Move/Jump", 20, 30);
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
