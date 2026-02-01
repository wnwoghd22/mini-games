export class NarrativeEngine {
    constructor(director) {
        this.director = director;
        this.dialogueBox = document.getElementById('dialogue-box');
        this.speakerEl = document.getElementById('speaker-name');
        this.textEl = document.getElementById('dialogue-text');
        this.optionsEl = document.getElementById('options-container');
    }

    loadScene(sceneId) {
        this.dialogueBox.classList.remove('hidden');
        this.showText('System', `Loading scene: ${sceneId}... (Placeholder)`);

        // TODO: Implement actual scene finding and parsing logic
    }

    showText(speaker, text) {
        this.speakerEl.textContent = speaker;
        this.textEl.textContent = text;
        this.optionsEl.innerHTML = '';
    }

    showChoices(choices) {
        this.optionsEl.innerHTML = '';
        choices.forEach(choice => {
            const btn = document.createElement('button');
            btn.className = 'option-btn';
            btn.textContent = choice.text;
            btn.onclick = () => this.handleChoice(choice.nextId);
            this.optionsEl.appendChild(btn);
        });
    }

    handleChoice(nextId) {
        console.log(`Choice selected: Go to ${nextId}`);
        // this.loadScene(nextId);
    }
}
