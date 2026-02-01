export class ActionEngine {
    constructor(director) {
        this.director = director;
        this.canvas = document.getElementById('action-canvas');
        this.ctx = this.canvas.getContext('2d');
        this.isRunning = false;

        this.currentMinigame = null; // 'stealth', 'escape', 'balance', 'qte'
        this.gameData = {}; // Store minigame-specific data

        this.resize();
        window.addEventListener('resize', () => this.resize());

        // Input handling
        window.addEventListener('keydown', (e) => this.handleInput(e));
        this.canvas.addEventListener('touchstart', (e) => this.handleTouch(e));
    }

    resize() {
        this.canvas.width = window.innerWidth;
        this.canvas.height = window.innerHeight;
    }

    start(minigameType) {
        console.log(`Action Engine: Starting ${minigameType}`);
        this.isRunning = true;
        this.currentMinigame = minigameType;
        this.initMinigame(minigameType);
        this.loop();
    }

    stop() {
        this.isRunning = false;
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    }

    initMinigame(type) {
        // Reset data for the specific minigame
        if (type === 'stealth') {
            this.gameData = {
                playerPos: 0,
                goal: 100,
                catState: 'sleeping', // sleeping, waking, watching
                catTimer: 0,
                alertLevel: 0
            };
        } else if (type === 'escape') {
            this.gameData = {
                playerX: this.canvas.width / 2,
                playerY: this.canvas.height / 2,
                dangerDir: 'left', // Sound source
                score: 0
            };
        }
    }

    loop() {
        if (!this.isRunning) return;

        this.update();
        this.draw();
        requestAnimationFrame(() => this.loop());
    }

    update() {
        if (this.currentMinigame === 'stealth') {
            this.updateStealth();
        } else if (this.currentMinigame === 'escape') {
            this.updateEscape();
        }
    }

    draw() {
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

        if (this.currentMinigame === 'stealth') {
            this.drawStealth();
        } else if (this.currentMinigame === 'escape') {
            this.drawEscape();
        } else {
            this.ctx.fillStyle = '#800000';
            this.ctx.font = '20px Courier New';
            this.ctx.fillText('Action Mode: Unknown Minigame', 50, 50);
        }
    }

    // ==========================================
    // STEALTH MINIGAME (Red Light / Green Light)
    // ==========================================
    updateStealth() {
        // Placeholder logic
        this.gameData.catTimer++;
        if (this.gameData.catTimer > 200) {
            this.gameData.catState = this.gameData.catState === 'sleeping' ? 'watching' : 'sleeping';
            this.gameData.catTimer = 0;
        }
    }

    drawStealth() {
        const { playerPos, goal, catState } = this.gameData;

        // Cat Eye (Top center)
        this.ctx.fillStyle = catState === 'watching' ? '#ffff00' : '#444';
        this.ctx.beginPath();
        this.ctx.arc(this.canvas.width / 2, 100, 50, 0, Math.PI * 2);
        this.ctx.fill();
        this.ctx.fillStyle = '#000';
        this.ctx.fillText(catState.toUpperCase(), this.canvas.width / 2 - 40, 100);

        // Player (Bottom)
        const progress = playerPos / goal;
        const playerY = this.canvas.height - 50 - (progress * (this.canvas.height - 200));

        this.ctx.fillStyle = '#fff';
        this.ctx.beginPath();
        this.ctx.arc(this.canvas.width / 2, playerY, 20, 0, Math.PI * 2);
        this.ctx.fill();

        // Progress Bar
        this.ctx.fillStyle = '#222';
        this.ctx.fillRect(50, this.canvas.height / 2, 20, 200);
        this.ctx.fillStyle = '#0f0';
        this.ctx.fillRect(50, this.canvas.height / 2 + (200 * (1 - progress)), 20, 200 * progress);
    }

    // ==========================================
    // ESCAPE MINIGAME (Audio Cues)
    // ==========================================
    updateEscape() {
        // Placeholder
    }

    drawEscape() {
        this.ctx.fillStyle = '#000';
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

        this.ctx.fillStyle = '#fff';
        this.ctx.fillText("Escape Mode: RUN AWAY FROM SOUND", 100, 100);
    }

    // ==========================================
    // INPUT
    // ==========================================
    handleInput(e) {
        if (!this.isRunning) return;

        if (this.currentMinigame === 'stealth') {
            if (e.code === 'Space' || e.code === 'ArrowUp') {
                if (this.gameData.catState === 'sleeping') {
                    this.gameData.playerPos += 5;
                    if (this.gameData.playerPos >= this.gameData.goal) {
                        this.winMinigame();
                    }
                } else {
                    this.failMinigame();
                }
            }
        }
    }

    handleTouch(e) {
        // Simple touch to move for now
        this.handleInput({ code: 'Space' });
    }

    winMinigame() {
        console.log("Minigame Won!");
        this.stop();
        this.director.onMinigameComplete(true);
    }

    failMinigame() {
        console.log("Minigame Failed!");
        this.stop();
        this.director.onMinigameComplete(false);
    }
}
