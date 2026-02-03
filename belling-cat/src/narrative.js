import { storyData } from './stories.js';

export class NarrativeEngine {
    constructor(director) {
        this.director = director;
        this.dialogueBox = document.getElementById('dialogue-box');
        this.speakerEl = document.getElementById('speaker-name');
        this.textEl = document.getElementById('dialogue-text');
        this.optionsEl = document.getElementById('options-container');

        this.currentScene = null;
        this.currentNodeIndex = 0;
        this.isTyping = false;
        this.fullText = "";
        this.typingSpeed = 30;

        // Advance dialogue on click
        // Note: Using arrow function to bind 'this' correctly
        // Advance dialogue on click anywhere in narrative mode
        window.addEventListener('click', (e) => this.advance(e));
        window.addEventListener('keydown', (e) => {
            if (e.code === 'Space' || e.code === 'Enter') this.advance(e);
        });
    }

    loadScene(sceneId) {
        if (!storyData[sceneId]) {
            console.error(`Scene ${sceneId} not found!`);
            return;
        }

        console.log(`Loading scene: ${sceneId}`);
        this.currentScene = storyData[sceneId];
        this.currentNodeIndex = 0;
        this.dialogueBox.classList.remove('hidden');
        this.showNode(this.currentScene[0]);
    }

    showNode(node) {
        if (!node) return;

        // Reset UI
        this.speakerEl.textContent = node.speaker;
        this.textEl.textContent = "";
        this.optionsEl.innerHTML = "";
        this.optionsEl.innerHTML = "";
        this.fullText = node.text;

        // Visual update
        if (node.visual) {
            this.director.setVisual(node.visual);
        }

        // Handle styling based on type (e.g., thought vs speech)
        if (node.type === 'thought') {
            this.textEl.style.fontStyle = 'italic';
            this.textEl.style.color = '#ff9999'; // Light red for thoughts
        } else {
            this.textEl.style.fontStyle = 'normal';
            this.textEl.style.color = 'inherit';
        }

        // Start typing
        this.isTyping = true;
        this.typewriter(0);
    }

    typewriter(index) {
        if (!this.isTyping) return;

        if (index < this.fullText.length) {
            this.textEl.textContent += this.fullText.charAt(index);
            setTimeout(() => this.typewriter(index + 1), this.typingSpeed);
        } else {
            this.isTyping = false;
            this.showChoicesIfAny();
        }
    }

    advance(e) {
        // Only allow advance if in narrative mode
        if (this.director.state.currentMode !== 'narrative') return;

        // Prevent advance if clicking an option button
        if (e && e.target && e.target.classList.contains('option-btn')) return;

        if (this.isTyping) {
            // Instant finish
            this.isTyping = false;
            this.textEl.textContent = this.fullText;
            this.showChoicesIfAny();
            return;
        }

        const currentNode = this.currentScene[this.currentNodeIndex];

        // If choices exist, don't advance on click, wait for choice
        if (currentNode.choices && currentNode.choices.length > 0) {
            return;
        }

        // Logic for 'next'
        if (typeof currentNode.next === 'string') {
            if (currentNode.next.startsWith('action:')) {
                const actionType = currentNode.next.split(':')[1];
                console.log(`Transitioning to Action: ${actionType}`);
                this.director.startAction(actionType);
            } else {
                // Jump to a new scene ID
                this.loadScene(currentNode.next);
            }
        } else if (typeof currentNode.next === 'number') {
            // Go to next node in valid array
            const nextNode = this.currentScene.find(n => n.id === currentNode.next);
            if (nextNode) {
                this.currentNodeIndex = this.currentScene.indexOf(nextNode);
                this.showNode(nextNode);
            } else {
                console.warn("Next node ID not found:", currentNode.next);
            }
        } else {
            // End of scene
            console.log("End of scene.");
            // Ideally trigger the director to switch modes or load next sequence
            // For now, just log it.
        }
    }

    showChoicesIfAny() {
        const currentNode = this.currentScene[this.currentNodeIndex];
        if (currentNode.choices) {
            this.showChoices(currentNode.choices);
        }
    }

    showChoices(choices) {
        this.optionsEl.innerHTML = '';
        choices.forEach(choice => {
            const btn = document.createElement('button');
            btn.className = 'option-btn';
            btn.textContent = choice.text;
            btn.onclick = (e) => {
                e.stopPropagation(); // Stop propagation to prevent immediate advance
                this.handleChoice(choice.nextId);
            };
            this.optionsEl.appendChild(btn);
        });
    }

    handleChoice(nextId) {
        console.log(`Choice selected: ${nextId}`);
        // If nextId is a number, it's a node in the current scene (unlikely for choices usually, but possible)
        // If it's a string, it's a new scene.
        // Based on stories.js structure, choices jump to new scene IDs.

        if (typeof nextId === 'string') {
            this.loadScene(nextId);
        }
    }
}
