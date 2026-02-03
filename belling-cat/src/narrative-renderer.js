export class NarrativeRenderer {
    constructor(canvasId) {
        console.log(`NarrativeRenderer initialized with ${canvasId}`);
        this.canvas = document.getElementById(canvasId);
        this.ctx = this.canvas.getContext('2d');

        // Ensure canvas size matches window or container
        this.resize();
        window.addEventListener('resize', () => this.resize());
    }

    resize() {
        if (!this.canvas) return;
        this.canvas.width = window.innerWidth;
        this.canvas.height = window.innerHeight;
    }

    clear() {
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    }

    render(visualId) {
        console.log(`NarrativeRenderer: render(${visualId})`);
        this.clear();
        if (!visualId) return;

        switch (visualId) {
            case 'council':
                this.drawCouncilScene();
                break;
            default:
                console.warn(`Unknown visual ID: ${visualId}`);
                break;
        }
    }

    drawCouncilScene() {
        const ctx = this.ctx;
        const w = this.canvas.width;
        const h = this.canvas.height;
        const centerX = w / 2;
        const centerY = h / 2;

        // Background (Dark room)
        ctx.fillStyle = '#1a1a1a';
        ctx.fillRect(0, 0, w, h);

        // Table (Brown Rectangle)
        const tableW = 400;
        const tableH = 200;
        ctx.fillStyle = '#5dade2'; // Stone/Ice looking table? Or wood. Let's go wood.
        ctx.fillStyle = '#8B4513';
        ctx.shadowBlur = 20;
        ctx.shadowColor = 'black';
        ctx.fillRect(centerX - tableW / 2, centerY - tableH / 2, tableW, tableH);
        ctx.shadowBlur = 0;

        // Table Grain/Details (Simple lines)
        ctx.strokeStyle = '#5D2906';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(centerX - tableW / 2 + 20, centerY);
        ctx.lineTo(centerX + tableW / 2 - 20, centerY);
        ctx.stroke();

        // Mice (Circles around the table)
        const elderColor = '#A9A9A9'; // Dark Grey
        const protagonistColor = '#FFFFFF'; // White
        const otherColor = '#808080'; // Grey

        // Positions
        const mice = [
            { x: centerX, y: centerY - 150, color: elderColor, label: "Elder", size: 25 }, // Top (Elder)
            { x: centerX, y: centerY + 150, color: protagonistColor, label: "You", size: 20 }, // Bottom (Player)
            { x: centerX - 250, y: centerY, color: otherColor, size: 18 }, // Left
            { x: centerX + 250, y: centerY, color: otherColor, size: 18 }, // Right
            { x: centerX - 220, y: centerY - 100, color: otherColor, size: 18 }, // Top-Left
            { x: centerX + 220, y: centerY - 100, color: otherColor, size: 18 }, // Top-Right
        ];

        mice.forEach(mouse => {
            // Body
            ctx.fillStyle = mouse.color;
            ctx.beginPath();
            ctx.arc(mouse.x, mouse.y, mouse.size, 0, Math.PI * 2);
            ctx.fill();

            // Ears
            ctx.beginPath();
            ctx.arc(mouse.x - mouse.size / 1.5, mouse.y - mouse.size / 1.5, mouse.size / 2, 0, Math.PI * 2);
            ctx.arc(mouse.x + mouse.size / 1.5, mouse.y - mouse.size / 1.5, mouse.size / 2, 0, Math.PI * 2);
            ctx.fill();

            // Eyes (Red for spookiness? Or just black dots)
            ctx.fillStyle = 'black';
            ctx.beginPath();
            ctx.arc(mouse.x - mouse.size / 3, mouse.y - mouse.size / 4, 2, 0, Math.PI * 2);
            ctx.arc(mouse.x + mouse.size / 3, mouse.y - mouse.size / 4, 2, 0, Math.PI * 2);
            ctx.fill();
        });

        // Spotlights or Mood Lighting (Radial Gradient)
        const gradient = ctx.createRadialGradient(centerX, centerY, 100, centerX, centerY, 500);
        gradient.addColorStop(0, 'rgba(0,0,0,0)');
        gradient.addColorStop(1, 'rgba(0,0,0,0.8)');
        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, w, h);
    }
}
