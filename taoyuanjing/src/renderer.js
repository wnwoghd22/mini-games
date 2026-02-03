export class Renderer {
    constructor(ctx, width, height) {
        this.ctx = ctx;
        this.width = width;
        this.height = height;
    }

    drawBackground() {
        this.ctx.fillStyle = '#f4f1ea';
        this.ctx.fillRect(0, 0, this.width, this.height);

        // Optional: Add subtle noise or texture here for paper effect
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

        // Create a slight wobble for hand-drawn feel
        // (In a real implementation, we would use more points or bezier curves)
        this.ctx.stroke();
    }

    drawPlayer(player) {
        // Simple ink blob character for now
        this.ctx.fillStyle = '#1a1a1a';
        this.ctx.beginPath();
        this.ctx.arc(player.x, player.y, 15, 0, Math.PI * 2);
        this.ctx.fill();
    }

    drawRect(x, y, w, h, filled = false) {
        if (filled) {
            this.ctx.fillStyle = '#1a1a1a';
            this.ctx.fillRect(x, y, w, h);
        } else {
            this.ctx.strokeStyle = '#1a1a1a';
            this.ctx.lineWidth = 3;
            this.ctx.strokeRect(x, y, w, h);
        }
    }
}
