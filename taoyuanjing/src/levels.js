export class LevelManager {
    constructor() {
        this.currentLevel = 0;
        this.player = {
            x: 100,
            y: 300,
            w: 30,
            h: 30,
            velocity: { x: 0, y: 0 },
            isGrounded: false
        };
        this.platforms = [
            { x: 0, y: 700, w: 1024, h: 68 }, // Ground floor
            { x: 200, y: 550, w: 200, h: 20 },  // Gallery Platform 1
            { x: 600, y: 400, w: 200, h: 20 }   // Gallery Platform 2
        ];

        // Define interactables (Paintings)
        this.interactables = [
            { id: 'painting_1', x: 250, y: 450, w: 100, h: 100, label: 'Winter River' },
            { id: 'painting_2', x: 650, y: 300, w: 100, h: 100, label: 'Twin Temples' }
        ];

        this.nearbyInteractable = null;
    }

    update(dt, input) {
        const speed = 300;
        const jumpForce = -600;
        const gravity = 1500;

        // Horizontal Movement
        if (input.isPressed('ArrowRight') || input.isPressed('KeyD')) {
            this.player.velocity.x = speed;
        } else if (input.isPressed('ArrowLeft') || input.isPressed('KeyA')) {
            this.player.velocity.x = -speed;
        } else {
            this.player.velocity.x = 0;
        }

        this.player.x += this.player.velocity.x * dt;

        // Jump
        if ((input.isPressed('ArrowUp') || input.isPressed('KeyW') || input.isPressed('Space')) && this.player.isGrounded) {
            this.player.velocity.y = jumpForce;
            this.player.isGrounded = false;
        }

        // Gravity
        this.player.velocity.y += gravity * dt;
        this.player.y += this.player.velocity.y * dt;

        // Collision Check
        this.player.isGrounded = false;

        // Floor check
        if (this.player.y > 670) { // Simple floor for now
            this.player.y = 670;
            this.player.velocity.y = 0;
            this.player.isGrounded = true;
        }

        // Platform collisions
        this.platforms.forEach(p => {
            if (this.player.y + this.player.h / 2 >= p.y &&
                this.player.y + this.player.h / 2 <= p.y + p.h + 20 && // Tolerance
                this.player.x >= p.x - 20 &&
                this.player.x <= p.x + p.w + 20 &&
                this.player.velocity.y >= 0) {

                this.player.y = p.y - this.player.h / 2;
                this.player.velocity.y = 0;
                this.player.isGrounded = true;
            }
        });

        // Interaction Check
        this.checkInteractions();
    }

    checkInteractions() {
        this.nearbyInteractable = null;
        let minDist = 100; // Interaction radius

        for (const item of this.interactables) {
            const dx = this.player.x - (item.x + item.w / 2);
            const dy = this.player.y - (item.y + item.h / 2);
            const dist = Math.sqrt(dx * dx + dy * dy);

            if (dist < minDist) {
                this.nearbyInteractable = item;
                minDist = dist;
            }
        }
    }

    render(renderer) {
        // Draw Obstacles (if any)
        this.obstacles.forEach(p => {
            renderer.drawRect(p.x, p.y, p.w, p.h, true);
        });

        // Draw Paintings
        this.interactables.forEach(item => {
            renderer.drawRect(item.x, item.y, item.w, item.h, false);
            // In a real version, we'd draw the painting content here
        });

        // Draw Player
        renderer.drawPlayer(this.player);
    }
}
