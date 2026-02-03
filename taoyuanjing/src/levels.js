export class LevelManager {
    constructor() {
        // Global Game State
        this.globalState = {
            inventory: ['SPRING'], // Start with SPRING to solve the first puzzle
            flags: {}
        };

        // --- CONSTANTS ---
        const W = 1024, H = 768;
        const WALL_THICK = 50;
        const BOUNDS = [
            { x: 0, y: 0, w: W, h: 50 },      // Top
            { x: 0, y: H - 50, w: W, h: 50 }, // Bottom
            { x: 0, y: 0, w: 50, h: H },      // Left
            { x: W - 50, y: 0, w: 50, h: H }  // Right
        ];

        // --- SCENE DEFINITIONS ---
        this.scenes = {
            'GALLERY_HUB': {
                id: 'GALLERY_HUB',
                playerStart: { x: 512, y: 400 },
                obstacles: [
                    { x: 0, y: 0, w: 1024, h: 160 }, // North Wall
                    ...BOUNDS
                ],
                portals: [
                    // Frames: River(Winter), Field(Empty), Waterfall(Empty), Bamboo(Empty)
                    { id: 'frame_river', x: 200, y: 40, w: 80, h: 100, label: 'River', season: 'WINTER', targetScene: 'RIVER_WINTER', targetX: 100, targetY: 400 },
                    { id: 'frame_field', x: 400, y: 40, w: 80, h: 100, label: 'Field', season: null, targetScene: null, targetX: 100, targetY: 400 },
                    { id: 'frame_waterfall', x: 600, y: 40, w: 80, h: 100, label: 'Waterfall', season: null, targetScene: null, targetX: 100, targetY: 400 },
                    { id: 'frame_bamboo', x: 800, y: 40, w: 80, h: 100, label: 'Bamboo', season: null, targetScene: null, targetX: 100, targetY: 400 }
                ],
                items: []
            },

            // --- RIVER SCENES ---
            // Winter: Frozen River (Walkable)
            'RIVER_WINTER': {
                id: 'RIVER_WINTER',
                obstacles: [...BOUNDS],
                portals: [{ id: 'ret', x: 0, y: 350, w: 40, h: 100, label: 'Gallery', targetScene: 'GALLERY_HUB', targetX: 250, targetY: 400 }],
                items: []
            },
            // Spring: Dry River (Walkable) -> Contains SUMMER TILE
            'RIVER_SPRING': {
                id: 'RIVER_SPRING',
                obstacles: [...BOUNDS,
                { x: 300, y: 200, w: 50, h: 50 } // Rock
                ],
                portals: [{ id: 'ret', x: 0, y: 350, w: 40, h: 100, label: 'Gallery', targetScene: 'GALLERY_HUB', targetX: 250, targetY: 400 }],
                items: [
                    { id: 'item_summer', x: 900, y: 384, w: 30, h: 30, label: 'Summer Tile', type: 'COLLECTIBLE', value: 'SUMMER' }
                ]
            },
            // Summer: Flooded (Blocked)
            'RIVER_SUMMER': {
                id: 'RIVER_SUMMER',
                obstacles: [...BOUNDS, { x: 350, y: 50, w: 300, h: 718 }], // The River
                portals: [{ id: 'ret', x: 0, y: 350, w: 40, h: 100, label: 'Gallery', targetScene: 'GALLERY_HUB', targetX: 250, targetY: 400 }],
                items: []
            },
            // Autumn: Flowing (Blocked)
            'RIVER_AUTUMN': {
                id: 'RIVER_AUTUMN',
                obstacles: [...BOUNDS, { x: 350, y: 50, w: 300, h: 718 }], // The River
                portals: [{ id: 'ret', x: 0, y: 350, w: 40, h: 100, label: 'Gallery', targetScene: 'GALLERY_HUB', targetX: 250, targetY: 400 }],
                items: []
            },

            // --- WATERFALL SCENES ---
            // Winter: Ice Ladder -> Leads to Cave
            'WATERFALL_WINTER': {
                id: 'WATERFALL_WINTER',
                obstacles: [...BOUNDS, { x: 600, y: 50, w: 424, h: 718 }], // Cliff Face
                portals: [
                    { id: 'ret', x: 0, y: 350, w: 40, h: 100, label: 'Gallery', targetScene: 'GALLERY_HUB', targetX: 650, targetY: 400 },
                    // Ladder overlaps cliff, accessible
                    { id: 'ice_ladder', x: 550, y: 300, w: 50, h: 200, label: 'Climb Ice', targetScene: 'SECRET_CAVE', targetX: 100, targetY: 400 }
                ],
                items: []
            },
            // Others: Just Cliff, no ladder
            'WATERFALL_SUMMER': { id: 'WATERFALL_SUMMER', obstacles: [...BOUNDS, { x: 600, y: 50, w: 424, h: 718 }], portals: [{ id: 'ret', x: 0, y: 350, w: 40, h: 100, label: 'Gallery', targetScene: 'GALLERY_HUB', targetX: 650, targetY: 400 }], items: [] },
            'WATERFALL_SPRING': { id: 'WATERFALL_SPRING', obstacles: [...BOUNDS, { x: 600, y: 50, w: 424, h: 718 }], portals: [{ id: 'ret', x: 0, y: 350, w: 40, h: 100, label: 'Gallery', targetScene: 'GALLERY_HUB', targetX: 650, targetY: 400 }], items: [] },
            'WATERFALL_AUTUMN': { id: 'WATERFALL_AUTUMN', obstacles: [...BOUNDS, { x: 600, y: 50, w: 424, h: 718 }], portals: [{ id: 'ret', x: 0, y: 350, w: 40, h: 100, label: 'Gallery', targetScene: 'GALLERY_HUB', targetX: 650, targetY: 400 }], items: [] },

            // --- SECRET CAVE ---
            // Contains AUTUMN TILE
            'SECRET_CAVE': {
                id: 'SECRET_CAVE',
                obstacles: [...BOUNDS],
                portals: [{ id: 'down', x: 0, y: 350, w: 40, h: 100, label: 'Slide Down', targetScene: 'WATERFALL_WINTER', targetX: 500, targetY: 400 }],
                items: [
                    { id: 'item_autumn', x: 500, y: 384, w: 30, h: 30, label: 'Autumn Tile', type: 'COLLECTIBLE', value: 'AUTUMN' }
                ]
            },

            // --- FIELD SCENES ---
            // Autumn: Harvest -> PEACH SEED
            'FIELD_AUTUMN': {
                id: 'FIELD_AUTUMN',
                obstacles: [...BOUNDS],
                portals: [{ id: 'ret', x: 0, y: 350, w: 40, h: 100, label: 'Gallery', targetScene: 'GALLERY_HUB', targetX: 450, targetY: 400 }],
                items: [
                    { id: 'item_seed', x: 800, y: 384, w: 30, h: 30, label: 'Peach Seed', type: 'COLLECTIBLE', value: 'PEACH_SEED' }
                ]
            },
            'FIELD_SPRING': { id: 'FIELD_SPRING', obstacles: [...BOUNDS], portals: [{ id: 'ret', x: 0, y: 350, w: 40, h: 100, label: 'Gallery', targetScene: 'GALLERY_HUB', targetX: 450, targetY: 400 }], items: [] },
            // Summer: Bushes
            'FIELD_SUMMER': {
                id: 'FIELD_SUMMER',
                obstacles: [...BOUNDS,
                { x: 200, y: 200, w: 100, h: 100 }, { x: 500, y: 500, w: 100, h: 100 }, // Bushes
                ],
                portals: [{ id: 'ret', x: 0, y: 350, w: 40, h: 100, label: 'Gallery', targetScene: 'GALLERY_HUB', targetX: 450, targetY: 400 }], items: []
            },
            'FIELD_WINTER': { id: 'FIELD_WINTER', obstacles: [...BOUNDS], portals: [{ id: 'ret', x: 0, y: 350, w: 40, h: 100, label: 'Gallery', targetScene: 'GALLERY_HUB', targetX: 450, targetY: 400 }], items: [] },

            // --- BAMBOO SCENES (Filler for now) ---
            'BAMBOO_SPRING': { id: 'BAMBOO_SPRING', obstacles: [...BOUNDS], portals: [{ id: 'ret', x: 0, y: 350, w: 40, h: 100, label: 'Gallery', targetScene: 'GALLERY_HUB', targetX: 850, targetY: 400 }], items: [] },
            'BAMBOO_SUMMER': { id: 'BAMBOO_SUMMER', obstacles: [...BOUNDS], portals: [{ id: 'ret', x: 0, y: 350, w: 40, h: 100, label: 'Gallery', targetScene: 'GALLERY_HUB', targetX: 850, targetY: 400 }], items: [] },
            'BAMBOO_AUTUMN': { id: 'BAMBOO_AUTUMN', obstacles: [...BOUNDS], portals: [{ id: 'ret', x: 0, y: 350, w: 40, h: 100, label: 'Gallery', targetScene: 'GALLERY_HUB', targetX: 850, targetY: 400 }], items: [] },
            'BAMBOO_WINTER': { id: 'BAMBOO_WINTER', obstacles: [...BOUNDS], portals: [{ id: 'ret', x: 0, y: 350, w: 40, h: 100, label: 'Gallery', targetScene: 'GALLERY_HUB', targetX: 850, targetY: 400 }], items: [] }
        };

        this.loadScene('GALLERY_HUB', 512, 400);
        this.nearbyInteractable = null;
    }

    update(dt, input) {
        const speed = 250;
        this.player.velocity.x = 0;
        this.player.velocity.y = 0;

        if (input.isPressed('ArrowRight') || input.isPressed('KeyD')) this.player.velocity.x = speed;
        if (input.isPressed('ArrowLeft') || input.isPressed('KeyA')) this.player.velocity.x = -speed;
        if (input.isPressed('ArrowUp') || input.isPressed('KeyW')) this.player.velocity.y = -speed;
        if (input.isPressed('ArrowDown') || input.isPressed('KeyS')) this.player.velocity.y = speed;

        this.moveAndSlide(dt);
        this.checkInteractions();

        if (this.nearbyInteractable && input.isJustPressed('KeyE')) {
            this.triggerInteraction(this.nearbyInteractable);
        }
    }

    moveAndSlide(dt) {
        let expectedX = this.player.x + this.player.velocity.x * dt;
        let expectedY = this.player.y + this.player.velocity.y * dt;

        for (const obs of this.scene.obstacles) {
            if (this.checkRectOverlap(expectedX, this.player.y, this.player.w, this.player.h, obs)) {
                this.player.velocity.x = 0;
                expectedX = this.player.x;
            }
            if (this.checkRectOverlap(this.player.x, expectedY, this.player.w, this.player.h, obs)) {
                this.player.velocity.y = 0;
                expectedY = this.player.y;
            }
        }
        for (const obs of this.scene.obstacles) {
            if (this.checkRectOverlap(expectedX, expectedY, this.player.w, this.player.h, obs)) {
                expectedX = this.player.x;
                expectedY = this.player.y;
            }
        }
        this.player.x = expectedX;
        this.player.y = expectedY;
    }

    checkRectOverlap(x, y, w, h, rect) {
        return (x < rect.x + rect.w && x + w > rect.x && y < rect.y + rect.h && y + h > rect.y);
    }

    checkInteractions() {
        this.nearbyInteractable = null;
        let minDist = 80;
        for (const portal of this.scene.portals) {
            const dist = this.getDist(portal);
            if (dist < minDist) {
                this.nearbyInteractable = { ...portal, type: 'PORTAL' };
                return;
            }
        }
        for (const item of this.scene.items) {
            const dist = this.getDist(item);
            if (dist < minDist) {
                this.nearbyInteractable = { ...item, type: 'ITEM' };
                return;
            }
        }
    }

    getDist(target) {
        const dx = this.player.x - (target.x + target.w / 2);
        const dy = this.player.y - (target.y + target.h / 2);
        return Math.sqrt(dx * dx + dy * dy);
    }

    triggerInteraction(interactable) {
        if (interactable.type === 'PORTAL') {
            if (interactable.id.startsWith('frame')) {
                this.openSwapUI(interactable);
            } else {
                this.enterPortal(interactable);
            }
        } else if (interactable.type === 'ITEM') {
            console.log(`Collected ${interactable.label}`);
            this.globalState.inventory.push(interactable.value);
            const idx = this.scene.items.findIndex(i => i.id === interactable.id);
            if (idx > -1) this.scene.items.splice(idx, 1);
            this.updateInventoryUI();
        }
    }

    openSwapUI(portalData) {
        const portal = this.scene.portals.find(p => p.id === portalData.id);
        if (!portal) return;

        const modal = document.getElementById('swap-modal');
        const frameSlot = document.getElementById('frame-slot');
        const invList = document.getElementById('player-inventory-list');
        const closeBtn = document.getElementById('close-modal');
        const enterBtn = document.createElement('button');

        modal.classList.remove('hidden');

        this.renderFrameSlot(frameSlot, portal);
        this.renderSwapInventory(invList, portal);

        closeBtn.onclick = () => {
            modal.classList.add('hidden');
            const oldEnter = document.getElementById('dynamic-enter-btn');
            if (oldEnter) oldEnter.remove();
        };

        let oldEnter = document.getElementById('dynamic-enter-btn');
        if (oldEnter) oldEnter.remove();

        enterBtn.id = 'dynamic-enter-btn';
        enterBtn.innerText = 'Enter Painting';
        enterBtn.style.marginLeft = '10px';
        enterBtn.onclick = () => {
            if (portal.season) {
                modal.classList.add('hidden');
                document.getElementById('dynamic-enter-btn').remove();
                this.enterPortal(portal);
            } else {
                alert("The frame is empty. You cannot enter.");
            }
        };
        document.querySelector('.modal-content').appendChild(enterBtn);
    }

    renderFrameSlot(el, portal) {
        el.className = 'slot';
        if (portal.season) {
            el.classList.add('filled');
            el.innerText = portal.season;
            el.onclick = () => {
                this.globalState.inventory.push(portal.season);
                portal.season = null;
                portal.targetScene = null;
                this.updateInventoryUI();
                this.renderFrameSlot(el, portal);
                this.renderSwapInventory(document.getElementById('player-inventory-list'), portal);
            };
        } else {
            el.classList.add('empty');
            el.innerText = 'Empty';
            el.onclick = null;
        }
    }

    renderSwapInventory(el, portal) {
        el.innerHTML = '';
        this.globalState.inventory.forEach((item, index) => {
            const div = document.createElement('div');
            div.className = 'fragment-slot';
            div.innerText = item[0];
            div.title = item;
            div.onclick = () => {
                if (portal.season) {
                    this.globalState.inventory.push(portal.season);
                }

                portal.season = item;
                this.globalState.inventory.splice(index, 1);

                let baseName = 'RIVER';
                if (portal.id.includes('frame_field')) baseName = 'FIELD';
                if (portal.id.includes('frame_waterfall')) baseName = 'WATERFALL';
                if (portal.id.includes('frame_bamboo')) baseName = 'BAMBOO';

                portal.targetScene = `${baseName}_${item}`;

                this.updateInventoryUI();
                this.renderFrameSlot(document.getElementById('frame-slot'), portal);
                this.renderSwapInventory(el, portal);
            };
            el.appendChild(div);
        });
    }

    enterPortal(portal) {
        if (this.scenes[portal.targetScene]) {
            console.log(`Entering ${portal.targetScene}`);
            this.loadScene(portal.targetScene, 100, 384);
        } else {
            console.warn(`Scene ${portal.targetScene} not implemented yet.`);
            alert(`Entering ${portal.season} world... (Scene not built)`);
        }
    }

    updateInventoryUI() {
        const bar = document.getElementById('inventory-bar');
        if (!bar) return;
        bar.innerHTML = '';
        this.globalState.inventory.forEach(item => {
            const el = document.createElement('div');
            el.className = 'fragment-slot';
            el.innerText = item[0];
            el.title = item;
            bar.appendChild(el);
        });
    }

    loadScene(sceneId, startX, startY) {
        this.scene = this.scenes[sceneId];
        this.player = { x: startX, y: startY, w: 30, h: 30, velocity: { x: 0, y: 0 } };
    }

    render(renderer) {
        renderer.drawPlayer(this.player);
    }
}
