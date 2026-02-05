export class DialogueSystem {
    constructor(uiManager) {
        this.ui = uiManager;
        this.currentScript = [];
        this.currentIndex = 0;
        this.onComplete = null;
    }

    startDialogue(script, onCompleteCallback) {
        this.currentScript = script;
        this.currentIndex = 0;
        this.onComplete = onCompleteCallback;

        this.showCurrentLine();
    }

    showCurrentLine() {
        if (this.currentIndex >= this.currentScript.length) {
            this.endDialogue();
            return;
        }

        const line = this.currentScript[this.currentIndex];
        this.ui.renderDialogue(line);
    }

    advance() {
        this.currentIndex++;
        this.showCurrentLine();
    }

    endDialogue() {
        this.ui.clearDialogue();
        if (this.onComplete) {
            this.onComplete();
        }
    }
}
