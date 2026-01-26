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
            ctx.fillStyle = this.colors[TILE.WALL]; // Use Wall color for base
            // Draw arc?
            // TILE.CORNER_TL: Top-Left Rounded. Means Top and Left sides are flat?
            // "non-adjacent side is quarter circle". 
            // Neighbors on TWO sides.
            // If TL (Top-Left) is the type.
            // Usually TL implies the "Corner" is at Top-Left. 
            // So Bottom and Right are the neighbors?
            // Let's assume standard nomenclature:
            // CORNER_TL means the "Top Left" of the solid block is missing (curved).
            // So Neighbors are Bottom and Right.
            // Curve is concave? No, convex wall corner.

            // Let's stick to the visual: 
            // If I am walking on Top surface, I reach the Right edge.
            // The Block there is a Rounded Corner.
            // If it rounds "Down", it's the Top-Left of that block that is rounded.
            // So Neighbors are Bottom and Right.

            // Draw logic:
            // Fill a square, then "Cut" the corner?
            // Or just fill the shape.

            ctx.beginPath();
            const cx = x + (tile === TILE.CORNER_TL || tile === TILE.CORNER_BL ? this.tileSize : 0);
            const cy = y + (tile === TILE.CORNER_TL || tile === TILE.CORNER_TR ? this.tileSize : 0);
            // Wait, if TL (Top Left is Removed). Pivot is Bottom-Right?
            // Yes.

            let pivotX = x, pivotY = y;
            let startAng = 0, endAng = 0;

            if (tile === TILE.CORNER_TL) { // Missing Top-Left. Pivot Bottom-Right.
                pivotX = x + this.tileSize;
                pivotY = y + this.tileSize;
                startAng = Math.PI; // 180
                endAng = Math.PI * 1.5; // 270
                // Draw arc from Left(180) to Top(270) relative to pivot?
                // Arc goes 180->270.
                // We want to fill the SECTOR.
                // ctx.moveTo(pivotX, pivotY); 
                // ctx.arc(...)
            } else if (tile === TILE.CORNER_TR) { // Missing Top-Right. Pivot Bottom-Left.
                pivotX = x;
                pivotY = y + this.tileSize;
                startAng = Math.PI * 1.5; // 270
                endAng = Math.PI * 2; // 360
            } else if (tile === TILE.CORNER_BR) { // Missing Bottom-Right. Pivot Top-Left.
                pivotX = x;
                pivotY = y;
                startAng = 0;
                endAng = Math.PI * 0.5; // 90
            } else if (tile === TILE.CORNER_BL) { // Missing Bottom-Left. Pivot Top-Right.
                pivotX = x + this.tileSize;
                pivotY = y;
                startAng = Math.PI * 0.5; // 90
                endAng = Math.PI; // 180
            }

            ctx.moveTo(pivotX, pivotY);
            ctx.arc(pivotX, pivotY, this.tileSize, startAng, endAng);
            ctx.closePath();
            ctx.fill();

            // Debug text removed for cleaner look
            ctx.strokeStyle = '#222';
            ctx.stroke();
        }
    }
}
