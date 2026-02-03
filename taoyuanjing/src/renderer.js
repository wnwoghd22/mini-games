export class Renderer {
    constructor(ctx, width, height) {
        this.ctx = ctx;
        this.width = width;
        this.height = height;

        // Visual Constants
        this.wallHeight = 150; // The "North Wall" height
        this.floorY = 150;     // Where the floor starts (visual horizon)
    }

    drawBackground() {
        this.ctx.fillStyle = '#111'; // Void
        this.ctx.fillRect(0, 0, this.width, this.height);
    }

    drawRoom(scene) {
        // 1. Draw Floor
        this.ctx.fillStyle = '#f4f1ea'; // Rice Paper
        this.ctx.fillRect(0, this.floorY, this.width, this.height - this.floorY);

        // 2. Draw North Wall
        this.ctx.fillStyle = '#e8e5de'; // Slightly darker paper
        this.ctx.fillRect(0, 0, this.width, this.wallHeight);

        // Wall Border (Floor/Wall separation)
        this.drawLine(0, this.floorY, this.width, this.floorY, 4);
    }

    drawSceneObjects(scene) {
        // Draw Portals (Paintings)
        scene.portals.forEach(p => {
            this.drawPainting(p);
        });

        // Draw Items
        scene.items.forEach(i => {
            this.drawItem(i);
        });
    }

    drawPainting(portal) {
        // Frame
        this.ctx.fillStyle = '#333';
        this.ctx.fillRect(portal.x, portal.y, portal.w, portal.h);

        // Canvas content
        this.ctx.fillStyle = this.getSeasonColor(portal.season);
        this.ctx.fillRect(portal.x + 5, portal.y + 5, portal.w - 10, portal.h - 10);

        // Label
        this.ctx.fillStyle = '#fff';
        this.ctx.font = '12px Courier New';
        this.ctx.textAlign = 'center';
        this.ctx.fillText(portal.label || 'Painting', portal.x + portal.w / 2, portal.y - 10);
    }

    getSeasonColor(season) {
        switch (season) {
            case 'SPRING': return '#a8e6cf'; // Pastel Green
            case 'SUMMER': return '#ff8b94'; // Reddish/Warm
            case 'AUTUMN': return '#ffaaa5'; // Orange-ish
            case 'WINTER': return '#dcedc1'; // Pale/Icy
            default: return '#555'; // Empty/Grey
        }
    }

    drawItem(item) {
        this.ctx.fillStyle = '#d64541'; // Seal Red
        this.ctx.beginPath();
        this.ctx.arc(item.x + item.w / 2, item.y + item.h / 2, 10, 0, Math.PI * 2);
        this.ctx.fill();
    }

    // "Ink" style line drawing
    drawLine(x1, y1, x2, y2, thickness = 2) {
        this.ctx.beginPath();
        this.ctx.moveTo(x1, y1);
        this.ctx.lineTo(x2, y2);
        this.ctx.strokeStyle = '#1a1a1a';
        this.ctx.lineWidth = thickness;
        this.ctx.lineCap = 'round';
        this.ctx.lineJoin = 'round';
        this.ctx.stroke();
    }

    drawPlayer(player) {
        // Shadow
        this.ctx.fillStyle = 'rgba(0,0,0,0.2)';
        this.ctx.beginPath();
        this.ctx.ellipse(player.x, player.y + 15, 15, 5, 0, 0, Math.PI * 2);
        this.ctx.fill();

        // Character (Simple ink blot)
        this.ctx.fillStyle = '#1a1a1a';
        this.ctx.beginPath();
        this.ctx.arc(player.x, player.y, 15, 0, Math.PI * 2);
        this.ctx.fill();
    }

    drawRect(x, y, w, h, filled = false) {
        // Fallback
        if (filled) {
            this.ctx.fillStyle = '#1a1a1a';
            this.ctx.fillRect(x, y, w, h);
        } else {
            this.ctx.strokeStyle = '#1a1a1a';
            this.ctx.strokeRect(x, y, w, h);
        }
    }
}
