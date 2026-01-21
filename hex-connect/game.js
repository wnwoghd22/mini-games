/**
 * Hex Connect
 * A simple drag-to-connect puzzle game on a hexagonal grid.
 */

const CONFIG = {
    gridRadius: 4,     // Hex rings from center
    hexSize: 35,       // Pixel size of a hex
    colors: [          // Game piece colors
        '#ef4444', // Red
        '#3b82f6', // Blue
        '#22c55e', // Green
        '#eab308', // Yellow
        '#a855f7'  // Purple
    ],
    bg: '#0f172a',
    hexBg: '#1e293b',
    lineColor: '#ffffff',
    lineWidth: 8
};

// --- Math & Geometry ---

class Hex {
    constructor(q, r, s) {
        this.q = q;
        this.r = r;
        this.s = s;
        if (Math.round(q + r + s) !== 0) throw "q + r + s must be 0";
    }

    static fromQR(q, r) {
        return new Hex(q, r, -q - r);
    }

    add(b) {
        return new Hex(this.q + b.q, this.r + b.r, this.s + b.s);
    }

    subtract(b) {
        return new Hex(this.q - b.q, this.r - b.r, this.s - b.s);
    }

    scale(k) {
        return new Hex(this.q * k, this.r * k, this.s * k);
    }

    neighbor(direction) {
        return this.add(Hex.directions[direction]);
    }

    static directions = [
        new Hex(1, 0, -1), new Hex(1, -1, 0), new Hex(0, -1, 1),
        new Hex(-1, 0, 1), new Hex(-1, 1, 0), new Hex(0, 1, -1)
    ];

    len() {
        return (Math.abs(this.q) + Math.abs(this.r) + Math.abs(this.s)) / 2;
    }

    distance(b) {
        return this.subtract(b).len();
    }

    equals(b) {
        return this.q === b.q && this.r === b.r && this.s === b.s;
    }

    toString() {
        return `${this.q},${this.r},${this.s}`;
    }
}

class Layout {
    constructor(size, origin) {
        this.size = size;
        this.origin = origin;
    }

    // Pointy Topped Hex Layout
    hexToPixel(h) {
        const x = this.size * (Math.sqrt(3) * h.q + Math.sqrt(3) / 2 * h.r);
        const y = this.size * (3 / 2 * h.r);
        return { x: x + this.origin.x, y: y + this.origin.y };
    }

    pixelToHex(p) {
        const pt = { x: (p.x - this.origin.x) / this.size, y: (p.y - this.origin.y) / this.size };
        const q = (Math.sqrt(3) / 3 * pt.x - 1 / 3 * pt.y);
        const r = (2 / 3 * pt.y);
        return this.hexRound(q, r, -q - r);
    }

    hexRound(fracQ, fracR, fracS) {
        let q = Math.round(fracQ);
        let r = Math.round(fracR);
        let s = Math.round(fracS);
        const q_diff = Math.abs(q - fracQ);
        const r_diff = Math.abs(r - fracR);
        const s_diff = Math.abs(s - fracS);

        if (q_diff > r_diff && q_diff > s_diff) {
            q = -r - s;
        } else if (r_diff > s_diff) {
            r = -q - s;
        } else {
            s = -q - r;
        }
        return new Hex(q, r, s);
    }
}

// --- Game Logic ---

class HexGame {
    constructor(canvasId) {
        this.canvas = document.getElementById(canvasId);
        this.ctx = this.canvas.getContext('2d');
        this.fitCanvas();

        this.grid = new Map(); // Key: "q,r,s" -> Value: { hex, color, value }
        this.layout = new Layout(CONFIG.hexSize, { x: this.canvas.width / 2, y: this.canvas.height / 2 });

        this.selection = []; // Array of currently connected Hex objects
        this.isDragging = false;
        this.score = 0;
        this.scoreElement = document.getElementById('score-val');

        this.initGrid();
        this.bindEvents();
        this.loop();
    }

    fitCanvas() {
        this.canvas.width = window.innerWidth;
        this.canvas.height = window.innerHeight;
        if (this.layout) {
            this.layout.origin = { x: this.canvas.width / 2, y: this.canvas.height / 2 };
        }
    }

    initGrid() {
        const N = CONFIG.gridRadius;
        for (let q = -N; q <= N; q++) {
            let r1 = Math.max(-N, -q - N);
            let r2 = Math.min(N, -q + N);
            for (let r = r1; r <= r2; r++) {
                const hex = Hex.fromQR(q, r);
                this.grid.set(hex.toString(), {
                    hex: hex,
                    color: this.randomColor(),
                    scale: 1
                });
            }
        }
    }

    randomColor() {
        return CONFIG.colors[Math.floor(Math.random() * CONFIG.colors.length)];
    }

    bindEvents() {
        window.addEventListener('resize', () => {
            this.fitCanvas();
            this.draw();
        });

        // Mouse Events
        this.canvas.addEventListener('mousedown', (e) => this.handleInputStart(e));
        this.canvas.addEventListener('mousemove', (e) => this.handleInputMove(e));
        this.canvas.addEventListener('mouseup', (e) => this.handleInputEnd(e));

        // Touch Events
        this.canvas.addEventListener('touchstart', (e) => {
            e.preventDefault();
            this.handleInputStart(e.touches[0]);
        }, { passive: false });
        this.canvas.addEventListener('touchmove', (e) => {
            e.preventDefault();
            this.handleInputMove(e.touches[0]);
        }, { passive: false });
        this.canvas.addEventListener('touchend', (e) => this.handleInputEnd(e));
    }

    getHexAt(x, y) {
        const h = this.layout.pixelToHex({ x, y });
        const key = h.toString();
        if (this.grid.has(key)) {
            return this.grid.get(key);
        }
        return null;
    }

    handleInputStart(e) {
        const rect = this.canvas.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        const cell = this.getHexAt(x, y);

        if (cell) {
            this.isDragging = true;
            this.selection = [cell];
            this.draw();
        }
    }

    handleInputMove(e) {
        if (!this.isDragging) return;

        const rect = this.canvas.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        const cell = this.getHexAt(x, y);

        if (cell) {
            const last = this.selection[this.selection.length - 1];

            // Validate move
            if (cell.hex.equals(last.hex)) return; // Same tile

            // Backtrack
            if (this.selection.length > 1 && cell.hex.equals(this.selection[this.selection.length - 2].hex)) {
                this.selection.pop();
                this.draw();
                return;
            }

            // Validity Check
            const isAdjacent = last.hex.distance(cell.hex) === 1;
            const isSameColor = cell.color === last.color;
            const isNotSelected = !this.selection.some(s => s.hex.equals(cell.hex));

            if (isAdjacent && isSameColor && isNotSelected) {
                this.selection.push(cell);
                this.draw();
            }
        }
    }

    handleInputEnd(e) {
        if (!this.isDragging) return;
        this.isDragging = false;

        if (this.selection.length >= 2) {
            this.processMatch(this.selection);
        }

        this.selection = [];
        this.draw();
    }

    processMatch(matchChain) {
        const count = matchChain.length;
        this.score += count * 10 * count;
        this.scoreElement.innerText = this.score.toLocaleString();

        const removedKeys = new Set(matchChain.map(c => c.hex.toString()));
        removedKeys.forEach(key => this.grid.delete(key));

        this.applyGravity(removedKeys);
    }

    applyGravity(removedKeys) {
        // We need to process each column (q) affected.
        // For Pointy Top, columns are roughly 'q'.
        // Actually, in Pointy Top: x = f(q, r), y = f(r).
        // Since y depends ONLY on r, 'r' creates the horizontal rows.
        // But columns are diagonal.
        // This is tricky. In Pointy Top, usually gravity works along the vertical axis,
        // but the grid lines are diagonal.

        // HOWEVER, we can just treat it as: "For every empty spot, try to pull from properties above."
        // "Above" neighbors for (q, r):
        // Top-Left: (q, r-1)
        // Top-Right: (q+1, r-1)

        // Simpler Gravity: "Vertical Drop".
        // Since y = 1.5 * size * r.
        // Increasing r is down.
        // Decreasing r is up.
        // We want to fill (q, r) with (q, r-1)??
        // Wait, (q, r-1) is physically Top-Left.
        // There is no (q, r-1) directly above in X.
        // The "directly above" geometry is between (q, r-1) and (q+1, r-1).

        // Let's implement a simpler "Refill from Top" where new tiles just appear/fall 
        // into the empty spots, instead of complex sliding, to save complexity risk.
        // AND ensure they ACTUALLY appear.

        const now = Date.now();

        removedKeys.forEach(key => {
            const [q, r, s] = key.split(',').map(Number);
            const hex = new Hex(q, r, s);
            const pixel = this.layout.hexToPixel(hex);

            // Create new tile
            const cell = {
                hex: hex,
                color: this.randomColor(),
                scale: 1,
                anim: {
                    start: now,
                    duration: 600,
                    fromY: -500 // Relative offset from current position? No, absolute.
                }
            };

            // Logic for 'fromY':
            // If we want it to start at screen top (y=0) and go to 'pixel.y'.
            // The drawing logic uses: py = center.y + yOff.
            // If yOff is calculated, let's say we want:
            // Start: py = -50 (offscreen).
            // End: py = pixel.y.
            // yOff = (Start - End) * (1-ease).
            // So StartOffset = -50 - pixel.y.

            cell.anim.startOffset = -50 - pixel.y; // If pixel.y is 500, off is -550.

            this.grid.set(key, cell);
        });
    }

    drawHex(cell, isSelected) {
        const center = this.layout.hexToPixel(cell.hex);
        let yOff = 0;

        if (cell.anim) {
            const now = Date.now();
            const progress = (now - cell.anim.start) / cell.anim.duration;

            if (progress < 1) {
                const ease = 1 - Math.pow(1 - progress, 3);
                // We want: at prog=0, off=startOffset. At prog=1, off=0.
                yOff = cell.anim.startOffset * (1 - ease);
            } else {
                delete cell.anim;
            }
        }

        const size = (this.layout.size - 2) * (cell.scale || 1);

        this.ctx.beginPath();
        for (let i = 0; i < 6; i++) {
            const angle_deg = 60 * i + 30;
            const angle_rad = Math.PI / 180 * angle_deg;
            const px = center.x + size * Math.cos(angle_rad);
            const py = center.y + yOff + size * Math.sin(angle_rad);
            if (i === 0) this.ctx.moveTo(px, py);
            else this.ctx.lineTo(px, py);
        }
        this.ctx.closePath();

        this.ctx.fillStyle = isSelected ? shadeColor(cell.color, 20) : cell.color;
        this.ctx.fill();

        if (isSelected) {
            this.ctx.strokeStyle = '#fff';
            this.ctx.lineWidth = 3;
            this.ctx.stroke();
        }
    }

    draw() {
        this.ctx.fillStyle = CONFIG.bg;
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

        // Draw all hexes
        for (const [key, cell] of this.grid) {
            const isSelected = this.selection.some(s => s.hex.toString() === key);
            this.drawHex(cell, isSelected);  // removed explicit 'color' arg, passed entire cell
        }

        // Draw connector
        this.drawConnectionLine();

        // Request next frame for animation
        requestAnimationFrame(() => this.draw());
    }

    loop() {
        // this.draw() calls requestAnimationFrame, so we just kick it off once
        this.draw();
    }
}

// Utils
function shadeColor(color, percent) {
    // Simple placeholder for color lightening
    return color;
}

// Start
window.onload = () => {
    const game = new HexGame('game-canvas');
};
