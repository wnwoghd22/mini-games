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

        // 2. Draw Environment Details (River, Cliff, etc.)
        this.drawEnvironment(scene);

        // 3. Draw North Wall
        this.ctx.fillStyle = '#e8e5de'; // Slightly darker paper
        this.ctx.fillRect(0, 0, this.width, this.wallHeight);

        // Wall Border (Floor/Wall separation)
        this.drawLine(0, this.floorY, this.width, this.floorY, 4);
    }

    drawEnvironment(scene) {
        // Visuals based on Scene ID
        if (scene.id.includes('RIVER')) {
            // Draw River Bed
            this.ctx.fillStyle = scene.id.includes('WINTER') ? '#e0f7fa' : '#81d4fa'; // Ice vs Water
            if (scene.id.includes('SPRING')) this.ctx.fillStyle = '#d7ccc8'; // Dry Bed

            // River Location (Central)
            this.ctx.fillRect(350, this.floorY, 300, this.height - this.floorY);

            // Banks
            this.drawLine(350, this.floorY, 350, this.height, 2);
            this.drawLine(650, this.floorY, 650, this.height, 2);
        }

        if (scene.id.includes('WATERFALL')) {
            // Draw Cliff Face
            this.ctx.fillStyle = '#bdbdbd';
            this.ctx.fillRect(600, this.floorY, 424, this.height - this.floorY);
            this.drawLine(600, this.floorY, 600, this.height, 3);

            // Waterfall (Visual)
            let waterColor = '#29b6f6';
            if (scene.id.includes('WINTER')) waterColor = '#e0f7fa'; // Ice
            if (scene.id.includes('SPRING')) waterColor = '#4fc3f7';

            this.ctx.fillStyle = waterColor;
            this.ctx.fillRect(700, this.floorY, 150, this.height - this.floorY);
        }

        if (scene.id.includes('FIELD')) {
            // Field Texture
            this.ctx.fillStyle = scene.id.includes('AUTUMN') ? '#fff9c4' : '#c8e6c9';
            this.ctx.fillRect(50, this.floorY + 50, this.width - 100, this.height - 200);
        }
    }

    drawSceneObjects(scene) {
        // Draw Obstacles (Debug/Visual Style)
        if (scene.obstacles) {
            scene.obstacles.forEach(obs => this.drawObstacle(obs, scene));
        }

        // Draw Portals (Paintings)
        scene.portals.forEach(p => {
            this.drawPainting(p);
        });

        // Draw Items
        scene.items.forEach(i => {
            this.drawItem(i);
        });
    }

    drawObstacle(obs, scene) {
        // Skip drawing the North Wall collision box (it's handled by drawRoom borders)
        if (obs.y === 0 && obs.w > 800) return;

        // Skip drawing large environment blockers if we handled them in drawEnvironment
        // But drawing a faint outline helps for collisions

        // Generic Obstacle Style
        this.ctx.fillStyle = 'rgba(0, 0, 0, 0.1)';
        this.ctx.fillRect(obs.x, obs.y, obs.w, obs.h);

        // Border
        this.ctx.strokeStyle = 'rgba(0, 0, 0, 0.2)';
        this.ctx.strokeRect(obs.x, obs.y, obs.w, obs.h);
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
