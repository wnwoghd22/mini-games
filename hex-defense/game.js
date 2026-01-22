/**
 * Hex Defense
 * A Hexagonal Tower Defense Game
 */

const CONFIG = {
    hexSize: 30, // Slightly smaller than hex-connect to fit more map
    gridRadius: 8,
    colors: {
        turretRed: '#ef4444',    // Rapid
        turretGreen: '#22c55e',  // Slow
        turretBlue: '#3b82f6',   // Weaken
        bg: '#0b1121',
        hexBg: '#1e293b',
        path: '#334155'
    }
};

// --- Math & Geometry (Ported/Simplified from Hex Connect) ---
class Hex {
    constructor(q, r, s) {
        this.q = q;
        this.r = r;
        this.s = s;
    }

    static fromQR(q, r) {
        return new Hex(q, r, -q - r);
    }

    add(b) { return new Hex(this.q + b.q, this.r + b.r, this.s + b.s); }
    subtract(b) { return new Hex(this.q - b.q, this.r - b.r, this.s - b.s); }
    scale(k) { return new Hex(this.q * k, this.r * k, this.s * k); }

    neighbor(direction) {
        return this.add(Hex.directions[direction]);
    }

    static directions = [
        new Hex(1, 0, -1), new Hex(1, -1, 0), new Hex(0, -1, 1),
        new Hex(-1, 0, 1), new Hex(-1, 1, 0), new Hex(0, 1, -1)
    ];

    len() { return (Math.abs(this.q) + Math.abs(this.r) + Math.abs(this.s)) / 2; }
    distance(b) { return this.subtract(b).len(); }
    equals(b) { return this.q === b.q && this.r === b.r && this.s === b.s; }
    toString() { return `${this.q},${this.r},${this.s}`; }
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

        if (q_diff > r_diff && q_diff > s_diff) q = -r - s;
        else if (r_diff > s_diff) r = -q - s;
        else s = -q - r;
        return new Hex(q, r, s);
    }
}

// --- Entities ---

class Enemy {
    constructor(path, speed = 2, hp = 10) {
        this.path = path; // Array of Hexes
        this.pathIndex = 0;
        this.speed = speed; // Hexes per second
        this.hp = hp;
        this.maxHp = hp;
        this.alive = true;
        this.reachedEnd = false;

        // Position (Cube coordinates interpolated)
        // Store as q, r, s floats for smooth movement
        const start = this.path[0];
        this.q = start.q;
        this.r = start.r;
        this.s = start.s;
    }

    update(dt) {
        if (!this.alive || this.reachedEnd) return;

        // Target next hex
        if (this.pathIndex >= this.path.length - 1) {
            this.reachedEnd = true;
            return;
        }

        const current = { q: this.q, r: this.r, s: this.s };
        const target = this.path[this.pathIndex + 1];

        // Move towards target
        const dq = target.q - current.q;
        const dr = target.r - current.r;
        const ds = target.s - current.s;

        const dist = Math.sqrt(dq * dq + dr * dr + ds * ds); // Euclidean distance in Cube space

        // Move amount
        const move = this.speed * dt;

        if (dist <= move) {
            // Reached node
            this.q = target.q;
            this.r = target.r;
            this.s = target.s;
            this.pathIndex++;
        } else {
            // Interpolate
            const ratio = move / dist;
            this.q += dq * ratio;
            this.r += dr * ratio;
            this.s += ds * ratio;
        }
    }

    draw(ctx, layout) {
        // Convert current fractional hex to pixel
        // Reuse layout logic manually since hexToPixel expects a Hex object
        // but our layout.hexToPixel uses q and r properties, so passing {q, r} works.
        const center = layout.hexToPixel({ q: this.q, r: this.r });

        ctx.fillStyle = '#fff';
        ctx.beginPath();
        ctx.arc(center.x, center.y, layout.size * 0.4, 0, Math.PI * 2);
        ctx.fill();

        // HP Bar
        const hpPct = this.hp / this.maxHp;
        if (hpPct < 1) {
            ctx.fillStyle = 'red';
            ctx.fillRect(center.x - 10, center.y - 10, 20, 4);
            ctx.fillStyle = '#10b981';
            ctx.fillRect(center.x - 10, center.y - 10, 20 * hpPct, 4);
        }
    }
}

class TilePoly {
    constructor(shapeType, turrets) {
        this.shapeType = shapeType; // 'single', 'pair', 'tri', etc.
        this.turrets = turrets; // Array of {q, r, s, type} relative to center
        this.cost = 10 * turrets.length;
    }

    static generateRandom() {
        // Simple generation logic
        // 1. Pick size (1-3)
        // 2. Walk random directions to build shape
        const size = Math.floor(Math.random() * 3) + 1; // 1 to 3
        const turrets = [{ q: 0, r: 0, s: 0, type: TilePoly.randomTurretType() }];

        let current = new Hex(0, 0, 0);

        for (let i = 1; i < size; i++) {
            const dir = Math.floor(Math.random() * 6);
            const next = current.neighbor(dir);
            // Check if already occupied in this shape
            if (!turrets.some(t => t.q === next.q && t.r === next.r)) {
                turrets.push({ q: next.q, r: next.r, s: next.s, type: TilePoly.randomTurretType() });
                current = next;
            } else {
                i--; // Retry
            }
        }

        return new TilePoly('random', turrets);
    }

    static randomTurretType() {
        const types = ['red', 'green', 'blue'];
        return types[Math.floor(Math.random() * types.length)];
    }
}

class ShopSystem {
    constructor(game) {
        this.game = game;
        this.items = [];
        this.slots = document.getElementById('shop-items');
        this.rerollBtn = document.getElementById('reroll-btn');

        this.rerollBtn.onclick = () => this.reroll();
        this.rerollInternal();
    }

    reroll() {
        if (this.game.gold >= 10) {
            this.game.gold -= 10;
            this.game.updateUI();
            this.rerollInternal();
        }
    }

    rerollInternal() {
        this.items = [TilePoly.generateRandom(), TilePoly.generateRandom(), TilePoly.generateRandom()];
        this.render();
    }

    render() {
        this.slots.innerHTML = '';
        this.items.forEach((item, idx) => {
            const slot = document.createElement('div');
            slot.className = 'shop-slot';

            // Create mini canvas
            const canvas = document.createElement('canvas');
            canvas.width = 100;
            canvas.height = 100;
            slot.appendChild(canvas);

            this.drawItem(canvas, item);

            // Price tag
            const price = document.createElement('div');
            price.className = 'price-tag';
            price.innerText = `${item.cost}g`;
            slot.appendChild(price);

            // Click to Select (Drag start logic will go here)
            slot.onmousedown = (e) => this.game.handleShopItemStart(e, item);

            this.slots.appendChild(slot);
        });
    }

    drawItem(canvas, item) {
        const ctx = canvas.getContext('2d');
        const cx = canvas.width / 2;
        const cy = canvas.height / 2;
        const size = 15;

        item.turrets.forEach(t => {
            // Hex to Pixel logic for mini display
            const x = size * (Math.sqrt(3) * t.q + Math.sqrt(3) / 2 * t.r);
            const y = size * (3 / 2 * t.r);

            const px = cx + x;
            const py = cy + y;

            ctx.beginPath();
            for (let i = 0; i < 6; i++) {
                const angle_deg = 60 * i + 30;
                const angle_rad = Math.PI / 180 * angle_deg;
                const hx = px + (size - 2) * Math.cos(angle_rad);
                const hy = py + (size - 2) * Math.sin(angle_rad);
                if (i === 0) ctx.moveTo(hx, hy);
                else ctx.lineTo(hx, hy);
            }
            ctx.closePath();

            if (t.type === 'red') ctx.fillStyle = CONFIG.colors.turretRed;
            else if (t.type === 'green') ctx.fillStyle = CONFIG.colors.turretGreen;
            else if (t.type === 'blue') ctx.fillStyle = CONFIG.colors.turretBlue;

            ctx.fill();
            ctx.strokeStyle = '#fff';
            ctx.lineWidth = 1;
            ctx.stroke();
        });
    }
}

// --- Main Game Class ---

class Game {
    constructor() {
        this.canvas = document.getElementById('game-canvas');
        this.ctx = this.canvas.getContext('2d');

        this.map = new Map(); // Key: "q,r,s" -> HexData
        this.enemies = [];
        this.turrets = [];

        this.wave = 1;
        this.gold = 100;
        this.lives = 20;

        // Wave Logic
        this.waveState = 'preparing'; // 'preparing' | 'active'
        this.waveCountdown = 5.0; // seconds before wave starts
        this.prepareTime = 5.0; // default prepare time
        this.spawnTimer = 0;
        this.spawnInterval = 1.0;

        // Current wave stats (calculated at wave start)
        this.waveEnemyCount = 0;
        this.waveEnemiesSpawned = 0;
        this.waveEnemyHp = 0;
        this.waveEnemySpeed = 0;

        this.setupWave(this.wave);

        this.updateUI();

        this.shop = new ShopSystem(this);

        this.bindEvents();

        this.hoverHex = null;
        this.lastTime = performance.now();

        this.resize();
        window.addEventListener('resize', () => this.resize());

        this.initMap();
        this.loop();
    }

    bindEvents() {
        // Shop items handle their own mousedown
        // We handle canvas interactions here
        this.canvas.addEventListener('mousedown', (e) => this.handleInputStart(e));
        window.addEventListener('mousemove', (e) => this.handleInputMove(e)); // Global move
        window.addEventListener('mouseup', (e) => this.handleInputEnd(e));

        // Right-click long press to sell turrets
        this.canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    }

    handleInputStart(e) {
        if (this.draggingItem) return; // Shop dragging active

        const rect = this.canvas.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        const hex = this.layout.pixelToHex({ x, y });

        // Right-click: Start sell hold
        if (e.button === 2) {
            const turret = this.turrets.find(t => t.hex.equals(hex));
            if (turret) {
                this.sellingTurret = turret;
                this.sellStartTime = performance.now();
                this.sellDuration = 800; // ms to hold for sell
            }
            return;
        }

        // Left-click: Start chain
        const turret = this.turrets.find(t => t.hex.equals(hex));
        if (turret) {
            this.chainTurrets = [turret];
            this.chainType = turret.type;
        }
    }

    handleInputMove(e) {
        const rect = this.canvas.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        const hex = this.layout.pixelToHex({ x, y });

        // Track hover for turret info
        this.hoverTurret = this.turrets.find(t => t.hex.equals(hex)) || null;

        // Chain connect: add adjacent same-type turrets
        if (this.chainTurrets && this.chainTurrets.length > 0) {
            const turret = this.turrets.find(t => t.hex.equals(hex));
            if (turret && turret.type === this.chainType && !this.chainTurrets.includes(turret)) {
                // Check if adjacent to last turret in chain
                const lastTurret = this.chainTurrets[this.chainTurrets.length - 1];
                const dist = lastTurret.hex.distance(turret.hex);
                if (dist === 1) {
                    this.chainTurrets.push(turret);
                }
            }
        }

        // Cancel sell if mouse moves off turret
        if (this.sellingTurret) {
            const stillOnTurret = this.turrets.find(t => t.hex.equals(hex));
            if (stillOnTurret !== this.sellingTurret) {
                this.sellingTurret = null;
                this.sellStartTime = null;
            }
        }
    }

    handleInputEnd(e) {
        // Right-click release: cancel sell (if not completed in update)
        if (e.button === 2) {
            this.sellingTurret = null;
            this.sellStartTime = null;
            return;
        }

        // Left-click release: complete chain
        if (this.chainTurrets && this.chainTurrets.length >= 3) {
            this.mergeChain(this.chainTurrets);
        }

        // Cleanup
        this.chainTurrets = null;
        this.chainType = null;
    }

    getTurretSellPrice(turret) {
        // Base 5g + bonus for upgrades
        return 5 + Math.floor((turret.range - 4) * 2);
    }

    getTurretDamage(turret) {
        if (turret.type === 'red') return 2;
        if (turret.type === 'green') return 5;
        return 1; // blue
    }

    sellTurret(turret) {
        // Refund gold based on turret stats
        const refund = this.getTurretSellPrice(turret);
        this.gold += refund;
        this.updateUI();

        // Remove turret
        const idx = this.turrets.indexOf(turret);
        if (idx > -1) this.turrets.splice(idx, 1);

        // Clear map cell
        const key = turret.hex.toString();
        const cell = this.map.get(key);
        if (cell) cell.type = 'empty';

        // Recalculate path
        this.generatePath();
        for (const enemy of this.enemies) {
            this.updateEnemyPath(enemy);
        }
    }

    mergeChain(chain) {
        if (chain.length < 3) return;

        const target = chain[0];
        const bonusMultiplier = 1 + (chain.length - 2) * 0.5; // 3개: 1.5x, 4개: 2x, ...

        // Upgrade target based on chain length
        target.range += chain.length - 1;
        target.maxCooldown *= Math.pow(0.8, chain.length - 1);

        // Remove all others
        for (let i = 1; i < chain.length; i++) {
            const source = chain[i];
            const idx = this.turrets.indexOf(source);
            if (idx > -1) this.turrets.splice(idx, 1);

            const key = source.hex.toString();
            const cell = this.map.get(key);
            if (cell) cell.type = 'empty';
        }

        // Recalculate path
        this.generatePath();
        for (const enemy of this.enemies) {
            this.updateEnemyPath(enemy);
        }
    }

    updateUI() {
        document.getElementById('wave-val').innerText = this.wave;
        document.getElementById('gold-val').innerText = this.gold;
        document.getElementById('lives-val').innerText = this.lives;
    }

    resize() {
        this.canvas.width = window.innerWidth;
        this.canvas.height = window.innerHeight;
        this.layout = new Layout(CONFIG.hexSize, { x: this.canvas.width / 2, y: this.canvas.height / 2 });
    }

    // ... initMap and generatePath ...

    handleShopItemStart(e, item) {
        if (this.gold < item.cost) return;
        // Start dragging logic
        this.draggingItem = item;
        this.dragHtmlElement = e.currentTarget.cloneNode(true);
        this.dragHtmlElement.style.position = 'absolute';
        this.dragHtmlElement.style.opacity = '0.8';
        this.dragHtmlElement.style.pointerEvents = 'none';
        document.body.appendChild(this.dragHtmlElement);

        this.handleDragMove(e);

        const moveHandler = (ev) => this.handleDragMove(ev);
        const upHandler = (ev) => {
            this.handleDragEnd(ev);
            window.removeEventListener('mousemove', moveHandler);
            window.removeEventListener('mouseup', upHandler);
        };

        window.addEventListener('mousemove', moveHandler);
        window.addEventListener('mouseup', upHandler);
    }

    handleDragMove(e) {
        if (!this.dragHtmlElement) return;
        this.dragHtmlElement.style.left = (e.clientX - 60) + 'px';
        this.dragHtmlElement.style.top = (e.clientY - 60) + 'px';

        // Update hoverHex for preview
        const rect = this.canvas.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        this.hoverHex = this.layout.pixelToHex({ x, y });
        this.hoverValid = this.draggingItem ? this.canPlaceItem(this.draggingItem, this.hoverHex) : false;
    }

    handleDragEnd(e) {
        if (this.dragHtmlElement) {
            this.dragHtmlElement.remove();
            this.dragHtmlElement = null;
        }

        // Check drop
        const rect = this.canvas.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        const targetHex = this.layout.pixelToHex({ x, y });

        // Validate and Place
        if (this.canPlaceItem(this.draggingItem, targetHex)) {
            this.placeItem(this.draggingItem, targetHex);
        }

        this.draggingItem = null;
        this.hoverHex = null;
    }

    canPlaceItem(item, centerHex) {
        // Check bounds and overlapping
        const hexesToPlace = [];
        for (const t of item.turrets) {
            const h = centerHex.add(new Hex(t.q, t.r, t.s));
            const key = h.toString();
            const cell = this.map.get(key);

            // Must be free (empty or path, but not turret/wall)
            if (!cell || cell.type === 'turret' || cell.type === 'wall') return false;
            hexesToPlace.push(key);
        }

        // Check if path would still exist after placement (maze building validation)
        return this.hasValidPath(hexesToPlace);
    }

    hasValidPath(blockedKeys = []) {
        // BFS to check if path exists from start to end, treating blockedKeys as obstacles
        const frontier = [this.startHex];
        const visited = new Set();
        visited.add(this.startHex.toString());

        while (frontier.length > 0) {
            const current = frontier.shift();

            if (current.equals(this.endHex)) return true;

            for (let i = 0; i < 6; i++) {
                const next = current.neighbor(i);
                const key = next.toString();

                if (visited.has(key)) continue;
                if (!this.map.has(key)) continue;

                const cell = this.map.get(key);
                // Skip existing turrets/walls and simulated blocked cells
                if (cell.type === 'turret' || cell.type === 'wall') continue;
                if (blockedKeys.includes(key)) continue;

                visited.add(key);
                frontier.push(next);
            }
        }

        return false; // No path found
    }

    placeItem(item, centerHex) {
        this.gold -= item.cost;
        this.updateUI();

        for (const t of item.turrets) {
            const h = centerHex.add(new Hex(t.q, t.r, t.s));
            const key = h.toString();
            const cell = this.map.get(key);

            cell.type = 'turret';
            // Store turret data (make a Turret class later?)
            // For now simple object
            this.turrets.push({
                hex: h,
                type: t.type,
                // Add combat stats later
                range: 4,
                cooldown: 0,
                maxCooldown: t.type === 'red' ? 0.2 : 1.0
            });
        }

        // Recalculate path (maze building)
        this.generatePath();

        // Update existing enemies to use new path
        for (const enemy of this.enemies) {
            this.updateEnemyPath(enemy);
        }
    }

    updateEnemyPath(enemy) {
        // Find closest path node ahead of enemy's current position
        const enemyHex = new Hex(Math.round(enemy.q), Math.round(enemy.r), Math.round(enemy.s));

        let bestIndex = -1;
        let bestDist = Infinity;

        for (let i = 0; i < this.path.length; i++) {
            const dist = enemyHex.distance(this.path[i]);
            if (dist < bestDist) {
                bestDist = dist;
                bestIndex = i;
            }
        }

        if (bestIndex >= 0) {
            // Create new path starting from current position
            enemy.path = this.path.slice(bestIndex);
            enemy.pathIndex = 0;
        }
    }

    setupWave(waveNum) {
        // Calculate wave stats
        this.waveEnemyCount = 10 + waveNum * 2;
        this.waveEnemiesSpawned = 0;
        this.waveEnemyHp = 10 + (waveNum * 5);
        this.waveEnemySpeed = 2 + (waveNum * 0.1);
        this.spawnInterval = Math.max(0.2, 1.0 - waveNum * 0.05);
        this.spawnTimer = 0;

        // Reset to preparing state
        this.waveState = 'preparing';
        this.waveCountdown = this.prepareTime;
    }

    spawnEnemy() {
        if (!this.path || this.path.length === 0) return;
        this.enemies.push(new Enemy(this.path, this.waveEnemySpeed, this.waveEnemyHp));
        this.waveEnemiesSpawned++;
    }

    update(dt) {
        // Check sell progress
        if (this.sellingTurret && this.sellStartTime) {
            const elapsed = performance.now() - this.sellStartTime;
            if (elapsed >= this.sellDuration) {
                // Sell complete
                this.sellTurret(this.sellingTurret);
                this.sellingTurret = null;
                this.sellStartTime = null;
            }
        }

        // Wave State Machine
        if (this.waveState === 'preparing') {
            this.waveCountdown -= dt;
            if (this.waveCountdown <= 0) {
                this.waveState = 'active';
                this.waveCountdown = 0;
            }
        } else if (this.waveState === 'active') {
            // Spawning
            if (this.waveEnemiesSpawned < this.waveEnemyCount) {
                this.spawnTimer -= dt;
                if (this.spawnTimer <= 0) {
                    this.spawnEnemy();
                    this.spawnTimer = this.spawnInterval;
                }
            } else if (this.enemies.length === 0) {
                // Wave Clear - next wave
                this.wave++;
                this.updateUI();
                this.setupWave(this.wave);
            }
        }

        // Update Enemies
        for (let i = this.enemies.length - 1; i >= 0; i--) {
            const e = this.enemies[i];
            e.update(dt);

            if (e.reachedEnd) {
                this.lives--;
                this.updateUI();
                this.enemies.splice(i, 1);
                if (this.lives <= 0) {
                    alert('Game Over!');
                    location.reload();
                }
            } else if (!e.alive) {
                this.enemies.splice(i, 1);
                this.gold += 5;
                this.updateUI();
            }
        }

        // Turrets
        this.turrets.forEach(t => {
            if (t.cooldown > 0) t.cooldown -= dt;

            // Find target
            if (t.cooldown <= 0) {
                // Simple range check (in hex distance)
                // NOTE: Enemy pos is q,r,s floats. We can use distance formula.
                let target = null;
                let minDist = Infinity;

                for (const e of this.enemies) {
                    const dist = Math.sqrt(
                        (t.hex.q - e.q) ** 2 +
                        (t.hex.r - e.r) ** 2 +
                        (t.hex.s - e.s) ** 2
                    );

                    if (dist <= t.range && dist < minDist) {
                        minDist = dist;
                        target = e;
                    }
                }

                if (target) {
                    // Fire!
                    t.cooldown = t.maxCooldown;
                    // Damage
                    let dmg = 1;
                    if (t.type === 'red') dmg = 2; // Rapid/Strong
                    else if (t.type === 'green') dmg = 5; // Slow/Heavy

                    // Effect
                    if (t.type === 'blue') {
                        // Apply slow/weaken (TODO)
                        target.speed *= 0.8;
                    }

                    target.hp -= dmg;
                    if (target.hp <= 0) target.alive = false;

                    // Visual: Store laser line to draw
                    t.lastTarget = { x: target.q, y: target.r }; // just store hex coords roughly? No, need pixel.
                    // We'll calculate pixel in draw for simplicity or store here.
                    // Let's store a timer for drawing the laser
                    t.fireAnim = 0.1;
                }
            }

            if (t.fireAnim > 0) t.fireAnim -= dt;
        });
    }
    initMap() {
        // Generate Hex Grid
        const N = CONFIG.gridRadius;
        for (let q = -N; q <= N; q++) {
            let r1 = Math.max(-N, -q - N);
            let r2 = Math.min(N, -q + N);
            for (let r = r1; r <= r2; r++) {
                const hex = Hex.fromQR(q, r);
                this.map.set(hex.toString(), {
                    hex: hex,
                    type: 'empty', // 'empty', 'path', 'wall', 'turret'
                    content: null  // If turret, hold data here
                });
            }
        }

        // Define Start and End Points
        // Start: Top Left (approx) -> q=0, r=-N
        // End: Bottom Right (approx) -> q=0, r=N
        this.startHex = new Hex(0, -N, N);
        this.endHex = new Hex(0, N, -N);

        // Calculate Path (Simple BFS for now)
        this.generatePath();
    }

    generatePath() {
        const frontier = [this.startHex];
        const cameFrom = new Map();
        cameFrom.set(this.startHex.toString(), null);

        // Reset current path markings
        for (const cell of this.map.values()) {
            if (cell.type === 'path') cell.type = 'empty';
        }

        let current = null;
        while (frontier.length > 0) {
            current = frontier.shift();

            if (current.equals(this.endHex)) break;

            for (let i = 0; i < 6; i++) {
                const next = current.neighbor(i);
                const key = next.toString();

                if (this.map.has(key) && !cameFrom.has(key)) {
                    const cell = this.map.get(key);
                    // Skip turrets and walls (maze building)
                    if (cell.type === 'turret' || cell.type === 'wall') continue;

                    frontier.push(next);
                    cameFrom.set(key, current);
                }
            }
        }

        // Reconstruct path
        current = this.endHex;
        this.path = [];
        while (!current.equals(this.startHex)) {
            this.path.push(current);
            const key = current.toString();
            if (this.map.has(key)) {
                this.map.get(key).type = 'path';
            }
            current = cameFrom.get(key);
            if (!current) break; // Path not found
        }
        this.path.push(this.startHex);
        this.map.get(this.startHex.toString()).type = 'path';
        this.path.reverse();
    }

    draw() {
        this.ctx.fillStyle = CONFIG.colors.bg;
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

        // Draw Map
        for (const [key, cell] of this.map) {
            this.drawHex(cell);
        }

        // Draw Turrets
        for (const turret of this.turrets) {
            this.drawTurret(turret);
        }

        // Draw Start/End Markers
        this.drawMarker(this.startHex, '#10b981'); // Green Start
        this.drawMarker(this.endHex, '#ef4444');   // Red End

        // Draw Enemies
        for (const e of this.enemies) {
            e.draw(this.ctx, this.layout);
        }

        // Draw Projectiles / Lasers
        this.ctx.lineWidth = 2;
        this.turrets.forEach(t => {
            if (t.fireAnim > 0 && t.lastTarget) {
                const start = this.layout.hexToPixel(t.hex);
                // Target is stored as {x, y} which are hex coords (q, r)
                // Need to convert target hex to pixel
                const end = this.layout.hexToPixel({ q: t.lastTarget.x, r: t.lastTarget.y });

                this.ctx.beginPath();
                this.ctx.moveTo(start.x, start.y);
                this.ctx.lineTo(end.x, end.y);

                let color = CONFIG.colors.turretRed;
                if (t.type === 'green') color = CONFIG.colors.turretGreen;
                if (t.type === 'blue') color = CONFIG.colors.turretBlue;

                this.ctx.strokeStyle = color;
                this.ctx.globalAlpha = t.fireAnim * 10; // Fade out
                this.ctx.stroke();
                this.ctx.globalAlpha = 1.0;
            }
        });

        // Draw Placement Ghost
        if (this.draggingItem && this.hoverHex) {
            const centerHex = this.hoverHex;
            this.draggingItem.turrets.forEach(t => {
                const h = centerHex.add(new Hex(t.q, t.r, t.s));
                // Manually calculate pixel pos
                const center = this.layout.hexToPixel(h);
                const size = (this.layout.size - 2);

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

                this.ctx.fillStyle = this.hoverValid ? 'rgba(255, 255, 255, 0.5)' : 'rgba(239, 68, 68, 0.5)';
                this.ctx.fill();
                this.ctx.strokeStyle = '#fff';
                this.ctx.lineWidth = 2;
                this.ctx.stroke();
            });
        }

        // Draw Chain Connect visual
        if (this.chainTurrets && this.chainTurrets.length > 0) {
            // Draw lines connecting chain
            this.ctx.strokeStyle = '#fbbf24'; // Yellow/gold
            this.ctx.lineWidth = 4;
            this.ctx.beginPath();

            for (let i = 0; i < this.chainTurrets.length; i++) {
                const pos = this.layout.hexToPixel(this.chainTurrets[i].hex);
                if (i === 0) this.ctx.moveTo(pos.x, pos.y);
                else this.ctx.lineTo(pos.x, pos.y);
            }
            this.ctx.stroke();

            // Highlight chained turrets
            for (const turret of this.chainTurrets) {
                const center = this.layout.hexToPixel(turret.hex);
                this.ctx.beginPath();
                this.ctx.arc(center.x, center.y, this.layout.size * 0.6, 0, Math.PI * 2);
                this.ctx.strokeStyle = this.chainTurrets.length >= 3 ? '#22c55e' : '#fbbf24';
                this.ctx.lineWidth = 3;
                this.ctx.stroke();
            }

            // Show chain count
            if (this.chainTurrets.length >= 2) {
                const lastTurret = this.chainTurrets[this.chainTurrets.length - 1];
                const pos = this.layout.hexToPixel(lastTurret.hex);
                this.ctx.fillStyle = this.chainTurrets.length >= 3 ? '#22c55e' : '#fbbf24';
                this.ctx.font = 'bold 16px sans-serif';
                this.ctx.textAlign = 'center';
                this.ctx.textBaseline = 'middle';
                this.ctx.fillText(`x${this.chainTurrets.length}`, pos.x, pos.y - this.layout.size - 10);
            }
        }

        // Draw Sell Gauge (right-click hold)
        if (this.sellingTurret && this.sellStartTime) {
            const pos = this.layout.hexToPixel(this.sellingTurret.hex);
            const elapsed = performance.now() - this.sellStartTime;
            const progress = Math.min(elapsed / this.sellDuration, 1);
            const radius = this.layout.size + 8;

            // Background circle
            this.ctx.beginPath();
            this.ctx.arc(pos.x, pos.y, radius, 0, Math.PI * 2);
            this.ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
            this.ctx.lineWidth = 6;
            this.ctx.stroke();

            // Progress arc (clockwise from top)
            this.ctx.beginPath();
            this.ctx.arc(pos.x, pos.y, radius, -Math.PI / 2, -Math.PI / 2 + progress * Math.PI * 2);
            this.ctx.strokeStyle = progress >= 1 ? '#22c55e' : '#ef4444';
            this.ctx.lineWidth = 6;
            this.ctx.stroke();

            // Sell price text
            const sellPrice = this.getTurretSellPrice(this.sellingTurret);
            this.ctx.fillStyle = '#fbbf24';
            this.ctx.font = 'bold 18px sans-serif';
            this.ctx.textAlign = 'center';
            this.ctx.textBaseline = 'middle';
            this.ctx.fillText(`+${sellPrice}g`, pos.x, pos.y - radius - 15);
        }

        // Draw Turret Info (hover)
        if (this.hoverTurret && !this.sellingTurret && !this.chainTurrets) {
            const turret = this.hoverTurret;
            const pos = this.layout.hexToPixel(turret.hex);

            // Info panel background
            const panelX = pos.x + this.layout.size + 10;
            const panelY = pos.y - 40;
            const panelW = 90;
            const panelH = 65;

            this.ctx.fillStyle = 'rgba(0, 0, 0, 0.85)';
            this.ctx.fillRect(panelX, panelY, panelW, panelH);
            this.ctx.strokeStyle = '#475569';
            this.ctx.lineWidth = 1;
            this.ctx.strokeRect(panelX, panelY, panelW, panelH);

            // Info text
            this.ctx.font = '12px sans-serif';
            this.ctx.textAlign = 'left';
            this.ctx.textBaseline = 'top';

            const damage = this.getTurretDamage(turret);
            const dps = (damage / turret.maxCooldown).toFixed(1);

            this.ctx.fillStyle = '#ef4444';
            this.ctx.fillText(`DMG: ${damage}`, panelX + 8, panelY + 8);

            this.ctx.fillStyle = '#3b82f6';
            this.ctx.fillText(`RNG: ${turret.range}`, panelX + 8, panelY + 24);

            this.ctx.fillStyle = '#22c55e';
            this.ctx.fillText(`DPS: ${dps}`, panelX + 8, panelY + 40);
        }

        // Draw Wave Info Panel (top-left)
        this.drawWaveInfo();
    }

    drawWaveInfo() {
        const panelX = 20;
        const panelY = 80;
        const panelW = 160;
        const panelH = this.waveState === 'preparing' ? 100 : 80;

        // Panel background
        this.ctx.fillStyle = 'rgba(0, 0, 0, 0.8)';
        this.ctx.fillRect(panelX, panelY, panelW, panelH);
        this.ctx.strokeStyle = '#475569';
        this.ctx.lineWidth = 1;
        this.ctx.strokeRect(panelX, panelY, panelW, panelH);

        this.ctx.textAlign = 'left';
        this.ctx.textBaseline = 'top';

        if (this.waveState === 'preparing') {
            // Countdown display
            this.ctx.font = 'bold 14px sans-serif';
            this.ctx.fillStyle = '#fbbf24';
            this.ctx.fillText(`WAVE ${this.wave} INCOMING`, panelX + 10, panelY + 10);

            // Big countdown number
            this.ctx.font = 'bold 32px sans-serif';
            this.ctx.fillStyle = '#fff';
            this.ctx.textAlign = 'center';
            this.ctx.fillText(Math.ceil(this.waveCountdown).toString(), panelX + panelW / 2, panelY + 32);

            // Enemy preview
            this.ctx.font = '12px sans-serif';
            this.ctx.textAlign = 'left';
            this.ctx.fillStyle = '#94a3b8';
            this.ctx.fillText(`Enemies: ${this.waveEnemyCount}`, panelX + 10, panelY + 72);
            this.ctx.fillText(`HP: ${this.waveEnemyHp}`, panelX + 90, panelY + 72);
        } else {
            // Active wave info
            this.ctx.font = 'bold 14px sans-serif';
            this.ctx.fillStyle = '#ef4444';
            this.ctx.fillText(`WAVE ${this.wave}`, panelX + 10, panelY + 10);

            const remaining = this.waveEnemyCount - this.waveEnemiesSpawned + this.enemies.length;

            this.ctx.font = '12px sans-serif';
            this.ctx.fillStyle = '#fff';
            this.ctx.fillText(`Remaining: ${remaining}`, panelX + 10, panelY + 32);

            this.ctx.fillStyle = '#94a3b8';
            this.ctx.fillText(`HP: ${this.waveEnemyHp}`, panelX + 10, panelY + 50);
            this.ctx.fillText(`Speed: ${this.waveEnemySpeed.toFixed(1)}`, panelX + 80, panelY + 50);
        }

        // Draw countdown overlay in center when preparing
        if (this.waveState === 'preparing' && this.waveCountdown > 0) {
            const centerX = this.canvas.width / 2;
            const centerY = this.canvas.height / 2 - 100;

            // Semi-transparent background
            this.ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
            this.ctx.beginPath();
            this.ctx.arc(centerX, centerY, 60, 0, Math.PI * 2);
            this.ctx.fill();

            // Countdown arc
            const progress = 1 - (this.waveCountdown / this.prepareTime);
            this.ctx.beginPath();
            this.ctx.arc(centerX, centerY, 55, -Math.PI / 2, -Math.PI / 2 + progress * Math.PI * 2);
            this.ctx.strokeStyle = '#fbbf24';
            this.ctx.lineWidth = 6;
            this.ctx.stroke();

            // Countdown number
            this.ctx.font = 'bold 48px sans-serif';
            this.ctx.fillStyle = '#fff';
            this.ctx.textAlign = 'center';
            this.ctx.textBaseline = 'middle';
            this.ctx.fillText(Math.ceil(this.waveCountdown).toString(), centerX, centerY);
        }
    }

    drawMarker(hex, color) {
        const center = this.layout.hexToPixel(hex);
        this.ctx.fillStyle = color;
        this.ctx.beginPath();
        this.ctx.arc(center.x, center.y, 10, 0, Math.PI * 2);
        this.ctx.fill();
        this.ctx.strokeStyle = '#fff';
        this.ctx.lineWidth = 2;
        this.ctx.stroke();
    }

    drawHex(cell) {
        const center = this.layout.hexToPixel(cell.hex);
        const size = this.layout.size - 1; // Slight gap

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

        if (cell.type === 'path') {
            this.ctx.fillStyle = CONFIG.colors.path;
        } else {
            this.ctx.fillStyle = CONFIG.colors.hexBg;
        }

        this.ctx.fill();

        // Debug coords
        // this.ctx.fillStyle = '#64748b';
        // this.ctx.font = '10px sans-serif';
        // this.ctx.textAlign = 'center';
        // this.ctx.textBaseline = 'middle';
        // this.ctx.fillText(`${cell.hex.q},${cell.hex.r}`, center.x, center.y);
    }

    drawTurret(turret) {
        const center = this.layout.hexToPixel(turret.hex);
        const size = this.layout.size - 2;

        // Draw hex shape
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

        // Color based on type
        if (turret.type === 'red') this.ctx.fillStyle = CONFIG.colors.turretRed;
        else if (turret.type === 'green') this.ctx.fillStyle = CONFIG.colors.turretGreen;
        else if (turret.type === 'blue') this.ctx.fillStyle = CONFIG.colors.turretBlue;

        this.ctx.fill();
        this.ctx.strokeStyle = '#fff';
        this.ctx.lineWidth = 2;
        this.ctx.stroke();
    }

    loop() {
        const now = performance.now();
        const dt = (now - this.lastTime) / 1000;
        this.lastTime = now;

        this.update(dt);
        this.draw();

        requestAnimationFrame(() => this.loop());
    }
}

// Start Game
window.onload = () => {
    new Game();
};
