export class Renderer {
    constructor(ctx, width, height) {
        this.ctx = ctx;
        this.width = width;
        this.height = height;

        this.wallHeight = 150;
        this.floorY = 150;

        this.seed = 12345;
        this.currentSceneId = '';
    }

    // Improved Seeding for better distribution
    resetSeed(str) {
        if (!str) str = 'default';
        let h = 2166136261 >>> 0;
        for (let i = 0; i < str.length; i++) {
            h = Math.imul(h ^ str.charCodeAt(i), 16777619);
        }
        this.seed = h >>> 0;
    }

    random() {
        // Mulberry32 - Deterministic PRNG
        let t = this.seed += 0x6D2B79F5;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    }

    drawBackground() {
        this.ctx.fillStyle = '#f4f1ea'; // Rice Paper
        this.ctx.fillRect(0, 0, this.width, this.height);
    }

    drawRoom(scene) {
        // 1. Draw Floor
        this.ctx.fillStyle = '#f4f1ea';
        this.ctx.fillRect(0, this.floorY, this.width, this.height - this.floorY);

        // 2. Draw Environment (The Painting World)
        this.drawEnvironment(scene);

        // 3. Draw North Wall
        this.ctx.fillStyle = '#e8e5de';
        this.ctx.fillRect(0, 0, this.width, this.wallHeight);

        // Wall Border
        // Use a fixed seed for the room frame itself so it doesn't wobble
        let oldSeed = this.seed;
        this.resetSeed('ROOM_BORDER');
        this.drawInkStroke(0, this.floorY, this.width, this.floorY, 4);
        this.seed = oldSeed;
    }

    drawEnvironment(scene) {
        // Reset seed deterministically based on Scene ID
        // This ensures the scene draws exactly the same every frame
        this.resetSeed(scene.id);

        // --- RIVER SCENE ---
        if (scene.id.includes('RIVER')) {
            // Distant Mountains
            this.drawMountain(200, 100, '#d7ccc8');

            // The River
            const riverColor = this.getRiverColor(scene.id);
            this.ctx.fillStyle = riverColor;

            // Draw a flowing river path (Trapezoid for perspective)
            this.ctx.beginPath();
            this.ctx.moveTo(450, this.floorY); // Top Left
            this.ctx.lineTo(574, this.floorY); // Top Right
            this.ctx.lineTo(700, this.height); // Bottom Right
            this.ctx.lineTo(324, this.height); // Bottom Left
            this.ctx.fill();

            // River Banks (Ink Lines)
            this.drawInkStroke(450, this.floorY, 324, this.height, 3);
            this.drawInkStroke(574, this.floorY, 700, this.height, 3);

            // Trees on banks
            if (!scene.id.includes('WINTER')) {
                this.drawTree(200, 300, 60, scene.id);
                this.drawTree(150, 450, 80, scene.id);
                this.drawTree(850, 350, 70, scene.id);
            } else {
                // Dead trees in winter
                this.drawTree(200, 300, 60, 'WINTER');
            }
        }

        // --- WATERFALL SCENE ---
        if (scene.id.includes('WATERFALL')) {
            // Cliff Face
            this.ctx.fillStyle = '#cfd8dc';
            this.ctx.fillRect(600, this.floorY, 400, this.height);

            // Rough Ink Vertical Strokes for Cliff texture
            for (let i = 0; i < 10; i++) {
                let x = 600 + this.random() * 400;
                this.drawInkStroke(x, this.floorY, x, this.height, 1 + this.random() * 2);
            }

            // The Water
            const waterColor = scene.id.includes('WINTER') ? '#e1f5fe' : '#81d4fa';
            this.ctx.fillStyle = waterColor;
            this.ctx.fillRect(750, this.floorY, 100, this.height);

            // Waterfall Lines
            this.ctx.strokeStyle = '#fff';
            this.ctx.lineWidth = 2;
            this.ctx.beginPath();
            for (let i = 0; i < 5; i++) {
                this.ctx.moveTo(760 + i * 20, this.floorY);
                this.ctx.lineTo(760 + i * 20 + (this.random() * 10 - 5), this.height);
            }
            this.ctx.stroke();

            // Cave Entrance (Hidden or Open)
            if (!scene.id.includes('SUMMER')) {
                this.ctx.fillStyle = '#263238'; // Dark Hole
                this.ctx.beginPath();
                this.ctx.ellipse(800, 300, 30, 50, 0, 0, Math.PI * 2);
                this.ctx.fill();
            }
        }

        // --- FIELD SCENE ---
        if (scene.id.includes('FIELD')) {
            // Grass Texture
            const color = scene.id.includes('AUTUMN') ? '#fff59d' : '#c8e6c9';
            if (scene.id.includes('WINTER')) return; // Empty in winter

            this.ctx.strokeStyle = color;
            this.ctx.lineWidth = 2;

            // Draw many small grass blades
            for (let i = 0; i < 100; i++) {
                let x = 50 + this.random() * (this.width - 100);
                let y = this.floorY + this.random() * (this.height - this.floorY);
                this.ctx.beginPath();
                this.ctx.moveTo(x, y);
                this.ctx.lineTo(x + 5, y - 10);
                this.ctx.stroke();
            }
        }
    }

    getRiverColor(id) {
        if (id.includes('WINTER')) return '#e0f7fa'; // Ice
        if (id.includes('SPRING')) return '#efebe9'; // Dry/Mud
        if (id.includes('SUMMER')) return '#0288d1'; // Deep Blue
        return '#4fc3f7'; // Normal
    }

    drawSceneObjects(scene) {
        // We do typically NOT want randomness for obstacles/items each frame
        // But let's use the scene seed + unique ID to keep them stable

        let initialSeed = this.seed;

        // Draw Obstacles (Faint Ink Outline)
        if (scene.obstacles) {
            this.ctx.strokeStyle = 'rgba(0,0,0,0.1)';
            this.ctx.lineWidth = 1;
            scene.obstacles.forEach((obs, index) => {
                this.drawRect(obs.x, obs.y, obs.w, obs.h);
            });
        }

        // Draw Portals
        scene.portals.forEach(p => this.drawPainting(p));

        // Draw Items
        scene.items.forEach(i => this.drawItem(i));

        this.seed = initialSeed; // Restore main seed if needed
    }

    drawPainting(portal) {
        this.ctx.fillStyle = '#3e2723'; // Dark Wood Frame
        this.ctx.fillRect(portal.x, portal.y, portal.w, portal.h);

        this.ctx.fillStyle = this.getSeasonColor(portal.season);
        this.ctx.fillRect(portal.x + 4, portal.y + 4, portal.w - 8, portal.h - 8);

        // Label
        this.ctx.fillStyle = '#000';
        this.ctx.font = '10px serif';
        this.ctx.textAlign = 'center';
        this.ctx.fillText(portal.label || '', portal.x + portal.w / 2, portal.y - 15);
    }

    getSeasonColor(season) {
        if (!season) return '#d7ccc8'; // Empty Paper
        switch (season) {
            case 'WINTER': return '#cfd8dc';
            case 'SPRING': return '#f8bbd0'; // Pink wash
            case 'SUMMER': return '#c8e6c9'; // Green wash
            case 'AUTUMN': return '#ffe0b2'; // Orange wash
        }
        return '#fff';
    }

    drawItem(item) {
        this.ctx.fillStyle = '#b71c1c';
        this.ctx.beginPath();
        this.ctx.rect(item.x + 5, item.y + 5, 20, 20);
        this.ctx.fill();

        this.ctx.fillStyle = '#fff';
        this.ctx.font = 'bold 12px serif';
        this.ctx.fillText("Item", item.x + 15, item.y + 20);
    }

    // --- PROCEDURAL BRUSHES ---

    drawInkStroke(x1, y1, x2, y2, width) {
        this.ctx.strokeStyle = '#212121';
        this.ctx.lineWidth = width;
        this.ctx.lineCap = 'round';

        // Quadratic curve using deterministic random
        this.ctx.beginPath();
        this.ctx.moveTo(x1, y1);
        const cx = (x1 + x2) / 2 + (this.random() * 4 - 2);
        const cy = (y1 + y2) / 2 + (this.random() * 4 - 2);
        this.ctx.quadraticCurveTo(cx, cy, x2, y2);
        this.ctx.stroke();
    }

    drawMountain(x, y, color) {
        this.ctx.fillStyle = color;
        this.ctx.beginPath();
        this.ctx.moveTo(x, this.floorY);
        // Peak
        this.ctx.lineTo(x + 150, y);
        this.ctx.lineTo(x + 300, this.floorY);
        this.ctx.fill();
    }

    drawTree(x, y, size, season) {
        // Trunk
        this.drawInkStroke(x, y, x, y - size, size / 10);

        // Branches
        this.drawBranch(x, y - size, size * 0.7, -Math.PI / 4);
        this.drawBranch(x, y - size, size * 0.7, Math.PI / 4);

        // Foliage (Dots/Blobs)
        if (season === 'WINTER') return;

        let color = '#2e7d32'; // Summer Green
        if (season === 'SPRING') color = '#f48fb1'; // Pink
        if (season === 'AUTUMN') color = '#ff9800'; // Orange

        this.ctx.fillStyle = color;
        this.ctx.globalAlpha = 0.6;

        // Simple cluster of dots
        for (let i = 0; i < 10; i++) {
            this.ctx.beginPath();
            this.ctx.arc(x + (this.random() - 0.5) * size, y - size + (this.random() - 0.5) * size, 8, 0, Math.PI * 2);
            this.ctx.fill();
        }
        this.ctx.globalAlpha = 1.0;
    }

    drawBranch(x, y, len, angle) {
        if (len < 10) return;
        const x2 = x + Math.cos(angle) * len;
        const y2 = y + Math.sin(angle) * len;

        this.drawInkStroke(x, y, x2, y2, len / 10);

        // Recursive
        this.drawBranch(x2, y2, len * 0.7, angle - 0.3);
        this.drawBranch(x2, y2, len * 0.7, angle + 0.3);
    }

    drawPlayer(player) {
        // Ink Blot Character
        this.ctx.fillStyle = '#000';
        this.ctx.beginPath();
        this.ctx.arc(player.x, player.y, 12, 0, Math.PI * 2);
        this.ctx.fill();

        // Use fixed seed for player anim or it shakes too much?
        // Let's allow player to shake slightly for "alive" ink effect
        this.drawInkStroke(player.x, player.y + 10, player.x, player.y + 25, 4);
    }

    drawRect(x, y, w, h, filled = false) {
        if (filled) {
            this.ctx.fillStyle = '#1a1a1a';
            this.ctx.fillRect(x, y, w, h);
        } else {
            this.ctx.strokeStyle = '#1a1a1a';
            this.ctx.strokeRect(x, y, w, h);
        }
    }
}
