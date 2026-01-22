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
    extraColors: [
        { color: '#f97316', unlockScore: 500 },   // Orange
        { color: '#ec4899', unlockScore: 1500 },  // Pink
        { color: '#06b6d4', unlockScore: 3000 }   // Cyan
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
        this.pendingRefill = null;
        this.isResolving = false;
        this.isGameOver = false;

        this.updateColorPool();
        this.initGrid();
        this.bindEvents();
        this.checkGameOver();
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
        const pool = this.activeColors && this.activeColors.length ? this.activeColors : CONFIG.colors;
        return pool[Math.floor(Math.random() * pool.length)];
    }

    updateColorPool() {
        const unlocked = CONFIG.extraColors
            .filter(ec => this.score >= ec.unlockScore)
            .map(ec => ec.color);
        this.activeColors = [...CONFIG.colors, ...unlocked];
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
        if (this.isResolving || this.isGameOver) return;

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
        if (!this.isDragging || this.isResolving || this.isGameOver) return;

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
        if (!this.isDragging || this.isGameOver) return;
        this.isDragging = false;

        if (this.selection.length >= 3) {
            this.processMatch(this.selection);
        }

        this.selection = [];
        this.draw();
    }

    processMatch(matchChain) {
        const count = matchChain.length;
        this.score += count * 10 * count;
        this.scoreElement.innerText = this.score.toLocaleString();
        this.updateColorPool();

        const removedKeys = new Set(matchChain.map(c => c.hex.toString()));
        const now = Date.now();

        // Shrink matched tiles, then queue refill once the shrink finishes
        removedKeys.forEach(key => {
            const cell = this.grid.get(key);
            if (!cell) return;
            cell.anim = {
                type: 'shrink',
                start: now,
                duration: 220,
                startScale: cell.scale ?? 1,
                endScale: 0
            };
        });

        this.pendingRefill = {
            keys: removedKeys,
            start: now,
            duration: 220
        };
        this.isResolving = true;
    }

    refillGrid(removedKeys) {
        const now = Date.now();

        removedKeys.forEach(key => {
            const [q, r, s] = key.split(',').map(Number);
            const hex = new Hex(q, r, s);

            // Create new tile with scale 0
            const cell = {
                hex: hex,
                color: this.randomColor(),
                scale: 0,
                anim: {
                    type: 'grow',
                    start: now,
                    duration: 400,
                    startScale: 0,
                    endScale: 1
                }
            };

            this.grid.set(key, cell);
        });
    }

    drawHex(cell, isSelected) {
        // Handle Animation
        if (cell.anim) {
            const now = Date.now();
            const progress = (now - cell.anim.start) / cell.anim.duration;

            if (progress < 1) {
                // Elastic/BackOut easing for "pop" effect
                // c3 = 2.70158
                // 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2);
                // Let's use simple easeOutBack
                const c1 = 1.70158;
                const c3 = c1 + 1;
                const x = progress - 1;
                const ease = 1 + c3 * Math.pow(x, 3) + c1 * Math.pow(x, 2);

                cell.scale = cell.anim.startScale + (cell.anim.endScale - cell.anim.startScale) * ease;
            } else {
                cell.scale = cell.anim.endScale;
                delete cell.anim;
            }
        }

        const center = this.layout.hexToPixel(cell.hex);
        const size = (this.layout.size - 2) * (cell.scale);

        if (size <= 0) return;

        this.ctx.beginPath();
        for (let i = 0; i < 6; i++) {
            const angle_deg = 60 * i + 30;
            const angle_rad = Math.PI / 180 * angle_deg;
            const px = center.x + size * Math.cos(angle_rad);
            const py = center.y + size * Math.sin(angle_rad);
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

    updatePendingRefill() {
        if (!this.pendingRefill) return;

        const elapsed = Date.now() - this.pendingRefill.start;
        if (elapsed < this.pendingRefill.duration) return;

        this.pendingRefill.keys.forEach(key => this.grid.delete(key));
        this.refillGrid(this.pendingRefill.keys);

        this.pendingRefill = null;
        this.isResolving = false;
        this.checkGameOver();
    }

    drawConnectionLine() {
        if (this.selection.length < 2) return;

        this.ctx.strokeStyle = CONFIG.lineColor;
        this.ctx.lineWidth = CONFIG.lineWidth;
        this.ctx.lineJoin = 'round';
        this.ctx.lineCap = 'round';

        this.ctx.beginPath();
        this.selection.forEach((cell, idx) => {
            const { x, y } = this.layout.hexToPixel(cell.hex);
            if (idx === 0) {
                this.ctx.moveTo(x, y);
            } else {
                this.ctx.lineTo(x, y);
            }
        });
        this.ctx.stroke();
    }

    checkGameOver() {
        // If any same-color connected component has size >= 3, game continues
        const visited = new Set();
        for (const [key, cell] of this.grid) {
            if (visited.has(key)) continue;

            const color = cell.color;
            const stack = [cell.hex];
            let componentSize = 0;
            const localVisited = new Set();

            while (stack.length) {
                const h = stack.pop();
                const hKey = h.toString();
                if (localVisited.has(hKey)) continue;
                localVisited.add(hKey);
                componentSize += 1;

                for (let dir = 0; dir < 6; dir++) {
                    const nHex = h.neighbor(dir);
                    const nKey = nHex.toString();
                    if (localVisited.has(nKey)) continue;
                    const neighbor = this.grid.get(nKey);
                    if (neighbor && neighbor.color === color) {
                        stack.push(neighbor.hex);
                    }
                }
            }

            localVisited.forEach(k => visited.add(k));
            if (componentSize >= 3) {
                this.isGameOver = false;
                return false;
            }
        }

        this.isGameOver = true;
        return true;
    }

    drawGameOverOverlay() {
        this.ctx.fillStyle = 'rgba(15, 23, 42, 0.72)';
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

        this.ctx.fillStyle = '#fff';
        this.ctx.textAlign = 'center';
        this.ctx.textBaseline = 'middle';
        this.ctx.font = 'bold 48px Inter, sans-serif';
        this.ctx.fillText('No moves left', this.canvas.width / 2, this.canvas.height / 2 - 10);
        this.ctx.font = '24px Inter, sans-serif';
        this.ctx.fillText('Refresh to restart', this.canvas.width / 2, this.canvas.height / 2 + 32);
    }

    draw() {
        this.updatePendingRefill();

        this.ctx.fillStyle = CONFIG.bg;
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

        // Draw all hexes
        for (const [key, cell] of this.grid) {
            const isSelected = this.selection.some(s => s.hex.toString() === key);
            this.drawHex(cell, isSelected);  // removed explicit 'color' arg, passed entire cell
        }

        // Draw connector
        this.drawConnectionLine();

        if (this.isGameOver) {
            this.drawGameOverOverlay();
        }

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
