constructor(canvas) {
    this.keys = [];
    this.prevKeys = []; // Track previous frame's keys
    this.mouse = { x: 0, y: 0, clicked: false };

    window.addEventListener('keydown', e => {
        if (!this.keys.includes(e.code)) {
            this.keys.push(e.code);
        }
    });

    window.addEventListener('keyup', e => {
        const index = this.keys.indexOf(e.code);
        if (index > -1) {
            this.keys.splice(index, 1);
        }
    });

    // ... (mouse listeners same as before)
    canvas.addEventListener('mousemove', e => {
        const rect = canvas.getBoundingClientRect();
        this.mouse.x = e.clientX - rect.left;
        this.mouse.y = e.clientY - rect.top;
    });

    canvas.addEventListener('mousedown', () => {
        this.mouse.clicked = true;
    });

    canvas.addEventListener('mouseup', () => {
        this.mouse.clicked = false;
    });
}

update() {
    this.prevKeys = [...this.keys];
}

isPressed(key) {
    return this.keys.includes(key);
}

isJustPressed(key) {
    return this.keys.includes(key) && !this.prevKeys.includes(key);
}
}
