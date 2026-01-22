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
        this.spawnTimer = 0;
        this.enemiesToSpawn = 10;
        this.spawnInterval = 1.0;

        this.updateUI();

        this.shop = new ShopSystem(this);

        this.bindEvents();

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
    }

    handleInputStart(e) {
        if (this.draggingItem) return; // Shop dragging active

        const rect = this.canvas.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        const hex = this.layout.pixelToHex({ x, y });

        // Check Turret
        const turret = this.turrets.find(t => t.hex.equals(hex));
        if (turret) {
            this.draggingTurret = turret;
            this.draggingTurretOrigin = hex;

            // Create visual
            this.dragHtmlElement = document.createElement('div');
            this.dragHtmlElement.style.width = '40px';
            this.dragHtmlElement.style.height = '40px';
            this.dragHtmlElement.style.borderRadius = '50%';

            let color = CONFIG.colors.turretRed;
            if (turret.type === 'green') color = CONFIG.colors.turretGreen;
            if (turret.type === 'blue') color = CONFIG.colors.turretBlue;

            this.dragHtmlElement.style.backgroundColor = color;
            this.dragHtmlElement.style.position = 'absolute';
            this.dragHtmlElement.style.pointerEvents = 'none';
            this.dragHtmlElement.style.zIndex = '100';
            this.dragHtmlElement.style.transform = 'translate(-50%, -50%)';
            document.body.appendChild(this.dragHtmlElement);

            this.handleInputMove(e);
        }
    }

    handleInputMove(e) {
        // Helper for both shop drag and board drag
        if (this.dragHtmlElement) {
            this.dragHtmlElement.style.left = e.clientX + 'px';
            this.dragHtmlElement.style.top = e.clientY + 'px';
        }
    }

    handleInputEnd(e) {
        if (this.draggingTurret) {
            // End Board Drag
            const rect = this.canvas.getBoundingClientRect();
            const x = e.clientX - rect.left;
            const y = e.clientY - rect.top;
            const targetHex = this.layout.pixelToHex({ x, y });

            // Logic:
            // 1. If target is same as origin -> Click/Select (do nothing for now)
            // 2. If target has turret -> Check Merge
            // 3. If target empty -> Move (Allow for now)

            const targetTurret = this.turrets.find(t => t.hex.equals(targetHex));

            if (targetTurret && targetTurret !== this.draggingTurret) {
                // Merge Check
                if (targetTurret.type === this.draggingTurret.type) {
                    this.mergeTurrets(targetTurret, this.draggingTurret);
                }
            } else if (!targetTurret) {
                // Move Check: Must be empty and valid
                const cell = this.map.get(targetHex.toString());
                if (cell && cell.type === 'empty') {
                    // Move
                    // Update Map
                    const oldKey = this.draggingTurretOrigin.toString();
                    if (this.map.get(oldKey)) this.map.get(oldKey).type = 'empty';

                    cell.type = 'turret';
                    this.draggingTurret.hex = targetHex;
                }
            }

            // Cleanup
            if (this.dragHtmlElement) this.dragHtmlElement.remove();
            this.dragHtmlElement = null;
            this.draggingTurret = null;
            this.draggingTurretOrigin = null;
        }
    }

    mergeTurrets(target, source) {
        // Upgrade target
        target.range += 1;
        target.maxCooldown *= 0.8; // Faster

        // Remove source
        // 1. Remove from array
        const idx = this.turrets.indexOf(source);
        if (idx > -1) this.turrets.splice(idx, 1);

        // 2. Clear map cell
        const key = source.hex.toString();
        const cell = this.map.get(key);
        if (cell) cell.type = 'empty';

        // Visual Feedback (Flash?)
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

        // Highlight grid?
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
    }

    canPlaceItem(item, centerHex) {
        // Check bounds and overlapping
        for (const t of item.turrets) {
            const h = centerHex.add(new Hex(t.q, t.r, t.s));
            const key = h.toString();
            const cell = this.map.get(key);

            // Limit: Must be free, not path, not wall
            if (!cell || cell.type !== 'empty') return false;
        }
        return true;
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
    }

    spawnEnemy() {
        if (!this.path || this.path.length === 0) return;
        const speed = 2 + (this.wave * 0.1);
        const hp = 10 + (this.wave * 5);
        this.enemies.push(new Enemy(this.path, speed, hp));
    }

    update(dt) {
        // Spawning
        if (this.enemiesToSpawn > 0) {
            this.spawnTimer -= dt;
            if (this.spawnTimer <= 0) {
                this.spawnEnemy();
                this.enemiesToSpawn--;
                this.spawnTimer = this.spawnInterval;
            }
        } else if (this.enemies.length === 0) {
            // Wave Clear
            this.wave++;
            this.enemiesToSpawn = 10 + this.wave * 2;
            this.spawnInterval = Math.max(0.2, 1.0 - this.wave * 0.05);
            this.updateUI();
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
                    // Check if obstacle (future logic)
                    // if (this.map.get(key).type === 'wall') continue;

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
