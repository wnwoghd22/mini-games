/**
 * UIManager.js
 * Handles showing/hiding UI panels based on game state.
 */
export class UIManager {
    constructor(gameManager) {
        this.game = gameManager;
        this.uiLayer = document.getElementById('ui-layer');

        this.setupListeners();
    }

    setupListeners() {
        window.addEventListener('game-state-changed', (e) => {
            this.onStateChanged(e.detail.state);
        });
    }

    onStateChanged(state) {
        this.clearUI();

        // Simple text debug for now
        const debugState = document.createElement('div');
        debugState.className = 'panel';
        debugState.style.position = 'absolute';
        debugState.style.top = '10px';
        debugState.style.left = '10px';
        debugState.innerText = `Current State: ${state}`;
        this.uiLayer.appendChild(debugState);

        switch (state) {
            case 'DIALOGUE':
                this.showDialogueOverlay();
                break;
        }
    }

    clearUI() {
        this.uiLayer.innerHTML = '';
    }

    showDialogueOverlay() {
        const panel = document.createElement('div');
        panel.className = 'panel';
        panel.style.cssText = `
            position: absolute;
            bottom: 50px;
            left: 50%;
            transform: translateX(-50%);
            width: 80%;
            height: 150px;
            display: flex;
            align-items: center;
            justify-content: center;
        `;
        panel.innerHTML = `<p>...Intro Dialogue Placeholder...</p>`;
        this.uiLayer.appendChild(panel);
    }
}
