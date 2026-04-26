/**
 * Hex Conveyor
 * A hexagonal conveyor belt puzzle game
 */

const CONFIG = {
    gridRadius: 4,
    hexSize: 35,
    colors: [
        '#ef4444',
        '#3b82f6',
        '#22c55e',
    ],
    extraColors: [
        { color: '#eab308', unlockScore: 500 },
        { color: '#a855f7', unlockScore: 1500 },
        { color: '#f97316', unlockScore: 3000 },
    ],
    holeColors: [
        '#ef4444',
        '#3b82f6',
        '#22c55e',
        '#eab308',
        '#a855f7',
        '#f97316',
    ],
    bg: '#0f172a',
    hexBg: '#1e293b',
    hexBorder: '#334155',
    arrowColor: '#64748b',
    arrowColorActive: '#94a3b8',
};

// --- Math & Geometry (reused from hex-connect / hex-defense) ---

class Hex {
    constructor(q, r, s) {
        this.q = q;
        this.r = r;
        this.s = s;
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

// --- Game ---

class Game {
    constructor() {
        this.canvas = document.getElementById('game-canvas');
        this.ctx = this.canvas.getContext('2d');
        this.fitCanvas();

        this.grid = new Map();
        this.layout = new Layout(CONFIG.hexSize, { x: this.canvas.width / 2, y: this.canvas.height / 2 });

        this.score = 0;
        this.combo = 1;
        this.scoreElement = document.getElementById('score-val');
        this.comboElement = document.getElementById('combo-val');
        this.playBtn = document.getElementById('play-btn');
        this.undoBtn = document.getElementById('undo-btn');
        this.resetBtn = document.getElementById('reset-btn');

        this.history = [];
        this.isSimulating = false;
        this.isGameOver = false;

        this.hoverHex = null;
        this.hoverChain = [];
        this.hoverChainHole = null;
        this.loopCells = new Set();

        this.holeCounts = {};
        CONFIG.holeColors.forEach(c => { this.holeCounts[c] = 0; });

        this.animatingTiles = [];

        this.updateColorPool();
        this.initGrid();
        this.bindEvents();
        this.detectLoops();
        this.draw();
    }

    fitCanvas() {
        this.canvas.width = window.innerWidth;
        this.canvas.height = window.innerHeight;
        if (this.layout) {
            this.layout.origin = { x: this.canvas.width / 2, y: this.canvas.height / 2 };
        }
    }

    updateColorPool() {
        const unlocked = CONFIG.extraColors
            .filter(ec => this.score >= ec.unlockScore)
            .map(ec => ec.color);
        this.activeColors = [...CONFIG.colors, ...unlocked];
    }

    randomColor() {
        const pool = this.activeColors && this.activeColors.length ? this.activeColors : CONFIG.colors;
        return pool[Math.floor(Math.random() * pool.length)];
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
                    direction: Math.floor(Math.random() * 6),
                    tileColor: this.randomColor(),
                    scale: 1,
                    prevTileColor: null,
                    animFrom: null,
                    animTo: null,
                    animProgress: 1,
                });
            }
        }
    }

    getHoleColor(hex) {
        const N = CONFIG.gridRadius;
        if (hex.r === -N && hex.q >= 0) return CONFIG.holeColors[0];
        if (hex.q + hex.r === N && hex.r < 0) return CONFIG.holeColors[1];
        if (hex.q === N && hex.r >= 0) return CONFIG.holeColors[2];
        if (hex.r === N && hex.q <= 0) return CONFIG.holeColors[3];
        if (hex.q + hex.r === -N && hex.r > 0) return CONFIG.holeColors[4];
        if (hex.q === -N && hex.r <= 0) return CONFIG.holeColors[5];
        return null;
    }

    getExitDirection(hex) {
        const N = CONFIG.gridRadius;
        if (hex.r === -N && hex.q >= 0) return 0;
        if (hex.q + hex.r === N && hex.r < 0) return 1;
        if (hex.q === N && hex.r >= 0) return 2;
        if (hex.r === N && hex.q <= 0) return 3;
        if (hex.q + hex.r === -N && hex.r > 0) return 4;
        if (hex.q === -N && hex.r <= 0) return 5;
        return null;
    }

    isEdgeHex(hex) {
        return this.getExitDirection(hex) !== null;
    }

    bindEvents() {
        window.addEventListener('resize', () => {
            this.fitCanvas();
            this.draw();
        });

        this.canvas.addEventListener('mousedown', (e) => this.handleClick(e));
        this.canvas.addEventListener('mousemove', (e) => this.handleHover(e));
        this.canvas.addEventListener('contextmenu', (e) => {
            e.preventDefault();
            this.handleClick(e, true);
        });

        this.canvas.addEventListener('touchstart', (e) => {
            e.preventDefault();
            this.handleClick(e.touches[0]);
        }, { passive: false });

        this.playBtn.addEventListener('click', () => this.simulate());
        this.undoBtn.addEventListener('click', () => this.undo());
        this.resetBtn.addEventListener('click', () => this.reset());
    }

    getHexAt(x, y) {
        const rect = this.canvas.getBoundingClientRect();
        const px = x - rect.left;
        const py = y - rect.top;
        const h = this.layout.pixelToHex({ x: px, y: py });
        const key = h.toString();
        if (this.grid.has(key)) {
            return this.grid.get(key);
        }
        return null;
    }

    handleClick(e, counterClockwise = false) {
        if (this.isSimulating || this.isGameOver) return;

        const cell = this.getHexAt(e.clientX, e.clientY);
        if (!cell) return;

        const oldDir = cell.direction;
        if (counterClockwise) {
            cell.direction = (cell.direction + 5) % 6;
        } else {
            cell.direction = (cell.direction + 1) % 6;
        }

        this.history.push({ key: cell.hex.toString(), oldDir, newDir: cell.direction });
        this.detectLoops();
        this.draw();
    }

    handleHover(e) {
        if (this.isSimulating) return;

        const cell = this.getHexAt(e.clientX, e.clientY);
        if (!cell) {
            this.hoverHex = null;
            this.hoverChain = [];
            this.hoverChainHole = null;
            this.draw();
            return;
        }

        this.hoverHex = cell;
        this.hoverChain = this.traceChain(cell.hex);
        this.hoverChainHole = this.getChainHole(this.hoverChain);
        this.draw();
    }

    traceChain(startHex) {
        const chain = [];
        const visited = new Set();
        let current = startHex;

        while (current && !visited.has(current.toString())) {
            visited.add(current.toString());
            chain.push(current);

            const cell = this.grid.get(current.toString());
            if (!cell) break;

            const next = current.neighbor(cell.direction);
            if (!this.grid.has(next.toString())) {
                break;
            }
            current = next;
        }

        return chain;
    }

    getChainHole(chain) {
        if (chain.length === 0) return null;
        const last = chain[chain.length - 1];
        if (this.isEdgeHex(last)) {
            return this.getHoleColor(last);
        }
        return null;
    }

    detectLoops() {
        this.loopCells = new Set();

        for (const [key, cell] of this.grid) {
            const visited = new Set();
            let current = cell.hex;

            while (current && !visited.has(current.toString())) {
                visited.add(current.toString());
                const c = this.grid.get(current.toString());
                if (!c) break;
                const next = current.neighbor(c.direction);
                if (!this.grid.has(next.toString())) break;
                current = next;
            }

            if (current && visited.has(current.toString())) {
                visited.forEach(k => this.loopCells.add(k));
            }
        }
    }

    simulate() {
        if (this.isSimulating || this.isGameOver) return;
        this.isSimulating = true;
        this.playBtn.disabled = true;

        const moves = [];
        const exiting = [];
        const rejected = [];

        for (const [key, cell] of this.grid) {
            if (!cell.tileColor) continue;

            const next = cell.hex.neighbor(cell.direction);
            if (!this.grid.has(next.toString())) {
                const holeColor = this.getHoleColor(cell.hex);
                if (holeColor) {
                    if (holeColor === cell.tileColor) {
                        exiting.push({ key, color: cell.tileColor, holeColor });
                    } else {
                        rejected.push({ key, color: cell.tileColor, holeColor });
                    }
                }
            } else {
                moves.push({ from: key, to: next.toString(), color: cell.tileColor });
            }
        }

        let totalScore = 0;
        const colorCounts = {};
        exiting.forEach(e => {
            colorCounts[e.color] = (colorCounts[e.color] || 0) + 1;
        });

        exiting.forEach(e => {
            const count = colorCounts[e.color];
            const multiplier = count > 1 ? count : 1;
            totalScore += 10 * multiplier;
            this.holeCounts[e.holeColor] = (this.holeCounts[e.holeColor] || 0) + 1;
        });

        rejected.forEach(r => {
            totalScore -= 5;
        });

        if (exiting.length > 0) {
            this.combo = Math.max(this.combo, Math.max(...Object.values(colorCounts)));
        }

        this.score = Math.max(0, this.score + totalScore);
        this.scoreElement.innerText = this.score.toLocaleString();
        this.comboElement.innerText = `x${this.combo}`;
        this.updateColorPool();

        const exitKeys = new Set(exiting.map(e => e.key));
        const rejectKeys = new Set(rejected.map(r => r.key));

        const newGrid = new Map();
        for (const [key, cell] of this.grid) {
            const newCell = { ...cell, animFrom: null, animTo: null, animProgress: 1 };
            newGrid.set(key, newCell);
        }

        for (const move of moves) {
            if (exitKeys.has(move.to) || rejectKeys.has(move.to)) continue;
            const target = newGrid.get(move.to);
            if (target) {
                target.tileColor = move.color;
                target.animFrom = this.layout.hexToPixel(Hex.fromQR(...move.from.split(',').map(Number)));
                target.animTo = this.layout.hexToPixel(target.hex);
                target.animProgress = 0;
            }
        }

        for (const key of exitKeys) {
            const cell = newGrid.get(key);
            if (cell) {
                cell.tileColor = null;
                cell.scale = 1;
                cell.animFrom = this.layout.hexToPixel(cell.hex);
                const exitDir = this.getExitDirection(cell.hex);
                const exitPixel = {
                    x: cell.animFrom.x + Hex.directions[exitDir].q * 60,
                    y: cell.animFrom.y + Hex.directions[exitDir].r * 60,
                };
                cell.animTo = exitPixel;
                cell.animProgress = 0;
            }
        }

        for (const key of rejectKeys) {
            const cell = newGrid.get(key);
            if (cell) {
                cell.tileColor = null;
                cell.scale = 1;
                cell.animFrom = this.layout.hexToPixel(cell.hex);
                cell.animTo = { x: cell.animFrom.x, y: cell.animFrom.y - 30 };
                cell.animProgress = 0;
                cell.isReject = true;
            }
        }

        this.grid = newGrid;
        this.animatingTiles = [...exitKeys, ...rejectKeys, ...moves.map(m => m.to)];

        const animStart = performance.now();
        const animDuration = 300;

        const animate = (now) => {
            const elapsed = now - animStart;
            const progress = Math.min(elapsed / animDuration, 1);
            const eased = 1 - Math.pow(1 - progress, 3);

            for (const key of this.animatingTiles) {
                const cell = this.grid.get(key);
                if (!cell || cell.animFrom === null) continue;
                cell.animProgress = eased;
            }

            this.draw();

            if (progress < 1) {
                requestAnimationFrame(animate);
            } else {
                for (const key of this.animatingTiles) {
                    const cell = this.grid.get(key);
                    if (cell) {
                        cell.animFrom = null;
                        cell.animTo = null;
                        cell.animProgress = 1;
                        cell.isReject = false;
                    }
                }
                this.animatingTiles = [];
                this.isSimulating = false;
                this.playBtn.disabled = false;
                this.detectLoops();
                this.checkRefill();
                this.draw();
            }
        };

        requestAnimationFrame(animate);
    }

    checkRefill() {
        let canExit = false;
        for (const [key, cell] of this.grid) {
            if (!cell.tileColor) continue;
            const chain = this.traceChain(cell.hex);
            const hole = this.getChainHole(chain);
            if (hole && hole === cell.tileColor) {
                canExit = true;
                break;
            }
        }

        if (!canExit) {
            const emptyCells = [];
            for (const [key, cell] of this.grid) {
                if (!cell.tileColor) {
                    emptyCells.push(key);
                }
            }

            if (emptyCells.length > 0) {
                const now = Date.now();
                emptyCells.forEach(key => {
                    const cell = this.grid.get(key);
                    cell.tileColor = this.randomColor();
                    cell.scale = 0;
                    cell.anim = {
                        type: 'grow',
                        start: now,
                        duration: 300,
                        startScale: 0,
                        endScale: 1,
                    };
                });
            } else {
                this.isGameOver = true;
                this.draw();
            }
        }
    }

    undo() {
        if (this.history.length === 0 || this.isSimulating) return;
        const last = this.history.pop();
        const cell = this.grid.get(last.key);
        if (cell) {
            cell.direction = last.oldDir;
            this.detectLoops();
            this.draw();
        }
    }

    reset() {
        this.grid.clear();
        this.history = [];
        this.score = 0;
        this.combo = 1;
        this.isGameOver = false;
        this.scoreElement.innerText = '0';
        this.comboElement.innerText = 'x1';
        this.holeCounts = {};
        CONFIG.holeColors.forEach(c => { this.holeCounts[c] = 0; });
        this.updateColorPool();
        this.initGrid();
        this.detectLoops();
        this.draw();
    }

    draw() {
        this.ctx.fillStyle = CONFIG.bg;
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

        this.drawHoles();

        const hoverChainSet = new Set(this.hoverChain.map(h => h.toString()));

        for (const [key, cell] of this.grid) {
            this.drawHex(cell, hoverChainSet.has(key));
        }

        for (const [key, cell] of this.grid) {
            if (cell.tileColor) {
                this.drawTile(cell);
            }
        }

        if (this.isGameOver) {
            this.drawGameOver();
        }
    }

    drawHoles() {
        const N = CONFIG.gridRadius;
        const holePositions = [];

        const edgeHexes = [];
        for (const [key, cell] of this.grid) {
            if (this.isEdgeHex(cell.hex)) {
                edgeHexes.push(cell.hex);
            }
        }

        const dirGroups = {};
        edgeHexes.forEach(h => {
            const dir = this.getExitDirection(h);
            if (!dirGroups[dir]) dirGroups[dir] = [];
            dirGroups[dir].push(h);
        });

        for (let dir = 0; dir < 6; dir++) {
            if (!dirGroups[dir]) continue;
            const group = dirGroups[dir];

            let sumQ = 0, sumR = 0;
            group.forEach(h => { sumQ += h.q; sumR += h.r; });
            const centerHex = Hex.fromQR(Math.round(sumQ / group.length), Math.round(sumR / group.length));

            const centerPixel = this.layout.hexToPixel(centerHex);
            const offset = Hex.directions[dir];
            const holePixel = {
                x: centerPixel.x + offset.q * (CONFIG.hexSize * 1.3),
                y: centerPixel.y + offset.r * (CONFIG.hexSize * 1.3),
            };

            const color = CONFIG.holeColors[dir];
            const count = this.holeCounts[color] || 0;

            this.ctx.beginPath();
            this.ctx.arc(holePixel.x, holePixel.y, CONFIG.hexSize * 0.6, 0, Math.PI * 2);
            this.ctx.fillStyle = color;
            this.ctx.globalAlpha = 0.3;
            this.ctx.fill();
            this.ctx.globalAlpha = 1;
            this.ctx.strokeStyle = color;
            this.ctx.lineWidth = 3;
            this.ctx.stroke();

            if (count > 0) {
                this.ctx.fillStyle = '#fff';
                this.ctx.font = 'bold 14px Inter, sans-serif';
                this.ctx.textAlign = 'center';
                this.ctx.textBaseline = 'middle';
                this.ctx.fillText(count.toString(), holePixel.x, holePixel.y);
            }
        }
    }

    drawHex(cell, isHighlighted) {
        const center = this.layout.hexToPixel(cell.hex);
        const size = CONFIG.hexSize - 2;

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

        if (isHighlighted) {
            this.ctx.fillStyle = '#2d3a4f';
        } else {
            this.ctx.fillStyle = CONFIG.hexBg;
        }
        this.ctx.fill();
        this.ctx.strokeStyle = CONFIG.hexBorder;
        this.ctx.lineWidth = 1;
        this.ctx.stroke();

        if (this.loopCells.has(cell.hex.toString())) {
            this.ctx.beginPath();
            for (let i = 0; i < 6; i++) {
                const angle_deg = 60 * i + 30;
                const angle_rad = Math.PI / 180 * angle_deg;
                const px = center.x + (size - 4) * Math.cos(angle_rad);
                const py = center.y + (size - 4) * Math.sin(angle_rad);
                if (i === 0) this.ctx.moveTo(px, py);
                else this.ctx.lineTo(px, py);
            }
            this.ctx.closePath();
            this.ctx.strokeStyle = 'rgba(168, 85, 247, 0.4)';
            this.ctx.lineWidth = 2;
            this.ctx.stroke();
        }

        this.drawArrow(cell, center, isHighlighted);
    }

    drawArrow(cell, center, isHighlighted) {
        const dir = cell.direction;
        const angle = (60 * dir + 90) * Math.PI / 180;
        const len = CONFIG.hexSize * 0.5;

        const tipX = center.x + Math.cos(angle) * len;
        const tipY = center.y + Math.sin(angle) * len;

        const baseAngle = angle + Math.PI;
        const baseX = center.x + Math.cos(baseAngle) * len * 0.3;
        const baseY = center.y + Math.sin(baseAngle) * len * 0.3;

        const perpAngle = angle + Math.PI / 2;
        const wingLen = len * 0.35;

        const wing1X = baseX + Math.cos(perpAngle) * wingLen;
        const wing1Y = baseY + Math.sin(perpAngle) * wingLen;
        const wing2X = baseX - Math.cos(perpAngle) * wingLen;
        const wing2Y = baseY - Math.sin(perpAngle) * wingLen;

        this.ctx.beginPath();
        this.ctx.moveTo(tipX, tipY);
        this.ctx.lineTo(wing1X, wing1Y);
        this.ctx.lineTo(wing2X, wing2Y);
        this.ctx.closePath();

        this.ctx.fillStyle = isHighlighted ? CONFIG.arrowColorActive : CONFIG.arrowColor;
        this.ctx.fill();
    }

    drawTile(cell) {
        let progress = cell.animProgress ?? 1;
        let scale = cell.scale ?? 1;

        if (cell.anim && cell.anim.type === 'grow') {
            const now = Date.now();
            const p = Math.min((now - cell.anim.start) / cell.anim.duration, 1);
            const c1 = 1.70158;
            const c3 = c1 + 1;
            const x = p - 1;
            const ease = 1 + c3 * Math.pow(x, 3) + c1 * Math.pow(x, 2);
            scale = cell.anim.startScale + (cell.anim.endScale - cell.anim.startScale) * ease;
            if (p >= 1) {
                cell.scale = 1;
                delete cell.anim;
            }
        }

        if (cell.animFrom && cell.animTo) {
            const from = cell.animFrom;
            const to = cell.animTo;
            const cx = from.x + (to.x - from.x) * progress;
            const cy = from.y + (to.y - from.y) * progress;
            this.drawTileShape(cx, cy, cell.tileColor, scale, cell.isReject);
        } else {
            const center = this.layout.hexToPixel(cell.hex);
            this.drawTileShape(center.x, center.y, cell.tileColor, scale, false);
        }
    }

    drawTileShape(x, y, color, scale, isReject) {
        const size = CONFIG.hexSize * 0.45 * scale;

        if (isReject) {
            this.ctx.save();
            this.ctx.globalAlpha = 0.5;
        }

        this.ctx.beginPath();
        this.ctx.arc(x, y, size, 0, Math.PI * 2);
        this.ctx.fillStyle = color;
        this.ctx.fill();
        this.ctx.strokeStyle = 'rgba(255,255,255,0.3)';
        this.ctx.lineWidth = 2;
        this.ctx.stroke();

        if (isReject) {
            this.ctx.restore();
        }
    }

    drawGameOver() {
        this.ctx.fillStyle = 'rgba(15, 23, 42, 0.8)';
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

        this.ctx.fillStyle = '#fff';
        this.ctx.textAlign = 'center';
        this.ctx.textBaseline = 'middle';
        this.ctx.font = 'bold 48px Inter, sans-serif';
        this.ctx.fillText('Game Over', this.canvas.width / 2, this.canvas.height / 2 - 20);

        this.ctx.font = '24px Inter, sans-serif';
        this.ctx.fillStyle = '#94a3b8';
        this.ctx.fillText(`Final Score: ${this.score}`, this.canvas.width / 2, this.canvas.height / 2 + 30);

        this.ctx.font = '18px Inter, sans-serif';
        this.ctx.fillText('Click Reset to play again', this.canvas.width / 2, this.canvas.height / 2 + 70);
    }
}

window.onload = () => {
    new Game();
};
