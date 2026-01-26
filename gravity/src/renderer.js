import { TILE } from './levels.js';

export class Renderer {
    constructor(canvas) {
        this.ctx = canvas.getContext('2d');
        this.canvas = canvas;
        this.resize();
        window.addEventListener('resize', () => this.resize());

        // Visual constants
        this.tileSize = 40;
        this.colors = {
            [TILE.WALL]: '#444455',
            [TILE.START]: '#00ffcc', // Just helpful to see start pos
            [TILE.GEM]: '#ff00ff',
            PLAYER: '#ffffff',
            BG: '#0d0d12'
        };
    }

    resize() {
        this.canvas.width = window.innerWidth;
        this.canvas.height = window.innerHeight;
    }

    draw(gameState, level) {
        const { width, height } = this.canvas;
        const ctx = this.ctx;

        ctx.fillStyle = this.colors.BG;
        ctx.fillRect(0, 0, width, height);

        ctx.save();

        // Center the camera
        ctx.translate(width / 2, height / 2);

        // Apply Global Rotation ? NO.
        // User requested: "Map does not rotate". So we keep context as is.
        // Gravity Direction determines Player Rotation.

        // Draw Grid
        const gridW = level.width * this.tileSize;
        const gridH = level.height * this.tileSize;
        const offsetX = -gridW / 2;
        const offsetY = -gridH / 2;

        for (let y = 0; y < level.height; y++) {
            for (let x = 0; x < level.width; x++) {
                const tile = level.grid[y][x];
                if (tile !== TILE.EMPTY) {
                    this.drawTile(ctx, tile, offsetX + x * this.tileSize, offsetY + y * this.tileSize);
                }
            }
        }

        // Draw Player
        const px = offsetX + gameState.player.x * this.tileSize;
        const py = offsetY + gameState.player.y * this.tileSize;

        ctx.save();
        // Translate to Player Center for rotation
        ctx.translate(px + this.tileSize / 2, py + this.tileSize / 2);

        // Rotate Player to match Gravity
        // If Gravity is Down (0), Rot = 0.
        // If Gravity is Right (1), Rot = -90 (CCW) so feet point Right?
        // Wait, if G is Right, Down is Right.
        // Feet should point Right.
        // Standard Sprite Up is Up.
        // Rotate -90 -> Head Left, Feet Right. Correct.
        // So Rotate = -GravityRot.

        ctx.rotate(-gameState.rotation);

        ctx.fillStyle = this.colors.PLAYER;
        // Draw centered relative to translation
        ctx.fillRect(-this.tileSize / 2 + 5, -this.tileSize / 2 + 5, this.tileSize - 10, this.tileSize - 10);

        // Draw eyes to see direction
        ctx.fillStyle = '#000';
        ctx.fillRect(-5, -10, 4, 4);
        ctx.fillRect(5, -10, 4, 4);

        ctx.restore();

        ctx.restore(); // Main restore
    }

    drawTile(ctx, tile, x, y) {
        // Basic blocks
        if (tile === TILE.WALL) {
            ctx.fillStyle = this.colors[TILE.WALL];
            ctx.fillRect(x, y, this.tileSize, this.tileSize);
            ctx.strokeStyle = '#222';
            ctx.strokeRect(x, y, this.tileSize, this.tileSize);
        }
        else if (tile === TILE.GEM) {
            ctx.fillStyle = this.colors[TILE.GEM];
            ctx.beginPath();
            ctx.arc(x + this.tileSize / 2, y + this.tileSize / 2, this.tileSize / 4, 0, Math.PI * 2);
            ctx.fill();
        }
        else if (tile >= TILE.CORNER_TL && tile <= TILE.CORNER_BR) {
            ctx.fillStyle = this.colors[TILE.WALL];

            // Corner drawn around cell center with radius half tile
            const cx = x + this.tileSize / 2;
            const cy = y + this.tileSize / 2;
            const r = this.tileSize / 2;

            ctx.beginPath();
            if (tile === TILE.CORNER_TL) {
                ctx.moveTo(x, y + this.tileSize);
                ctx.lineTo(x, y + this.tileSize / 2);
                ctx.arc(cx, cy, r, Math.PI, Math.PI * 1.5, false);
                ctx.lineTo(x + this.tileSize, y);
                ctx.lineTo(x + this.tileSize, y + this.tileSize);
            } else if (tile === TILE.CORNER_TR) {
                ctx.moveTo(x + this.tileSize, y + this.tileSize);
                ctx.lineTo(x + this.tileSize, y + this.tileSize / 2);
                ctx.arc(cx, cy, r, -Math.PI * 0.5, 0, false);
                ctx.lineTo(x, y);
                ctx.lineTo(x, y + this.tileSize);
            } else if (tile === TILE.CORNER_BR) {
                ctx.moveTo(x + this.tileSize, y);
                ctx.lineTo(x + this.tileSize / 2, y);
                ctx.arc(cx, cy, r, 0, Math.PI * 0.5, false);
                ctx.lineTo(x, y + this.tileSize);
                ctx.lineTo(x + this.tileSize, y + this.tileSize);
            } else if (tile === TILE.CORNER_BL) {
                ctx.moveTo(x, y);
                ctx.lineTo(x, y + this.tileSize / 2);
                ctx.arc(cx, cy, r, Math.PI * 0.5, Math.PI, false);
                ctx.lineTo(x + this.tileSize, y + this.tileSize);
                ctx.lineTo(x + this.tileSize, y);
            }

            ctx.closePath();
            ctx.fill();
            ctx.strokeStyle = '#222';
            ctx.stroke();
        }
    }
}
