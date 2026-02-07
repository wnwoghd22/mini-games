/**
 * UIManager.js
 * Handles showing/hiding UI panels and rendering Dialogue.
 */
import { DialogueSystem } from '../systems/DialogueSystem.js';
import { introScript } from '../data/intro_script.js';

export class UIManager {
    constructor(gameManager) {
        this.game = gameManager;
        this.uiLayer = document.getElementById('ui-layer');
        this.dialogueSystem = new DialogueSystem(this);

        // Placement State
        this.selectedCardIndex = null;

        this.setupListeners();
    }

    setupListeners() {
        window.addEventListener('game-state-changed', (e) => {
            this.onStateChanged(e.detail.state);
        });
        window.addEventListener('hand-updated', (e) => {
            this.renderHand(e.detail.hand);
        });
        window.addEventListener('waiting-room-entered', (e) => {
            this.renderWaitingRoom(e.detail);
        });
        window.addEventListener('waiting-room-updated', (e) => {
            this.updateWaitingRoom(e.detail);
        });
        window.addEventListener('dungeon-updated', (e) => {
            this.renderDungeon(e.detail);
        });
        window.addEventListener('combat-updated', (e) => {
            this.renderCombat(e.detail);
        });

        // 마나 관련 이벤트
        window.addEventListener('gamestate-updated', (e) => {
            this.updateManaDisplay(e.detail);
        });
        window.addEventListener('mana-insufficient', (e) => {
            this.showManaWarning(e.detail);
        });
    }

    onStateChanged(state) {
        this.clearUI();
        this.showDebug(state);

        switch (state) {
            case 'DIALOGUE':
                this.dialogueSystem.startDialogue(introScript, () => {
                    console.log("Dialogue Complete");
                    this.game.changeState('PREPARATION');
                });
                break;
            case 'PREPARATION':
                // Waiting Room UI updates are handled by 'waiting-room-entered' event
                // but we can ensure clean UI state here if needed
                break;
            case 'PLACEMENT':
                // Hand is drawn by GameManager, UI just shows container
                // Dungeon rendering is triggered by 'dungeon-updated' event
                break;
            case 'RESULT':
                this.renderResult();
                break;
        }
    }

    showDebug(state) {
        const debugState = document.createElement('div');
        debugState.className = 'panel';
        debugState.style.position = 'absolute';
        debugState.style.top = '10px';
        debugState.style.left = '10px';
        debugState.innerText = `State: ${state}`;
        this.uiLayer.appendChild(debugState);
    }

    clearUI() {
        this.uiLayer.innerHTML = '';
        // Clear global click listeners if any?
    }

    // --- Dialogue Rendering ---

    renderDialogue(line) {
        // 1. Create structure if not exists
        let overlay = this.uiLayer.querySelector('.dialogue-overlay');
        if (!overlay) {
            overlay = this.createDialogueOverlay();
            this.uiLayer.appendChild(overlay);
        }

        // 2. Update Text
        const nameEl = overlay.querySelector('.dialogue-name');
        const textEl = overlay.querySelector('.dialogue-text');
        nameEl.innerText = line.character;
        textEl.innerText = line.text;

        // 3. Update Portraits
        const leftImg = overlay.querySelector('.portrait-left');
        const rightImg = overlay.querySelector('.portrait-right');

        // Reset classes
        leftImg.className = 'portrait portrait-left';
        rightImg.className = 'portrait portrait-right';

        // Logic: specific side is active, other is inactive (or hidden if not present?)
        // For simplicity: always show both if valid, dim the one not speaking.

        // Assume simple swap: Left is King, Right is Warlock usually.
        // We set src based on current line? 
        // Better: Set src dynamically.

        if (line.position === 'left') {
            leftImg.src = line.image;
            leftImg.classList.add('active');
            rightImg.classList.add('inactive');
            // If right image is not set yet, hide it?
            if (!rightImg.getAttribute('src')) rightImg.style.opacity = '0';
        } else {
            rightImg.src = line.image;
            rightImg.classList.add('active');
            leftImg.classList.add('inactive');
            if (!leftImg.getAttribute('src')) leftImg.style.opacity = '0';
        }

        // Ensure opacity is fixed if src exists
        if (leftImg.getAttribute('src')) leftImg.style.opacity = leftImg.classList.contains('active') ? '1' : '0.5';
        if (rightImg.getAttribute('src')) rightImg.style.opacity = rightImg.classList.contains('active') ? '1' : '0.5';
    }

    createDialogueOverlay() {
        const overlay = document.createElement('div');
        overlay.className = 'dialogue-overlay';

        // Portrait Container
        const portraits = document.createElement('div');
        portraits.className = 'portrait-container';

        const leftImg = document.createElement('img');
        leftImg.className = 'portrait portrait-left';

        const rightImg = document.createElement('img');
        rightImg.className = 'portrait portrait-right';

        portraits.appendChild(leftImg);
        portraits.appendChild(rightImg);

        // Text Box
        const box = document.createElement('div');
        box.className = 'dialogue-box';

        const name = document.createElement('div');
        name.className = 'dialogue-name';

        const text = document.createElement('div');
        text.className = 'dialogue-text';

        const hint = document.createElement('div');
        hint.className = 'dialogue-hint';
        hint.innerText = 'Click to continue...';

        box.append(name, text, hint);

        overlay.append(portraits, box);

        // Advance on click
        overlay.addEventListener('click', () => {
            this.dialogueSystem.advance();
        });

        return overlay;
    }

    clearDialogue() {
        const overlay = this.uiLayer.querySelector('.dialogue-overlay');
        if (overlay) {
            overlay.remove();
        }
    }
    // --- Waiting Room / Preparation ---

    renderWaitingRoom(data) {
        this.clearUI();

        let container = document.getElementById('waiting-room');
        if (!container) {
            container = document.createElement('div');
            container.id = 'waiting-room';
            container.className = 'panel waiting-room';
            this.uiLayer.appendChild(container); // Append wrapper to layer
        }

        container.innerHTML = `
            <h2>Mission Preparation - Level ${data.level || this.game.currentLevel}</h2>
            <div class="intel-box">
                <h3>Target Intel</h3>
                <p><strong>Name:</strong> ${data.enemyIntel.name}</p>
                <p><strong>Class:</strong> ${data.enemyIntel.class}</p>
                <p><strong>HP:</strong> ${data.enemyIntel.hp} | <strong>ATK:</strong> ${data.enemyIntel.atk} | <strong>DEF:</strong> ${data.enemyIntel.def}</p>
                <p class="weakness">Weakness: ${data.enemyIntel.weakness}</p>
            </div>
            
            <div class="deck-management">
                <div class="deck-column">
                    <h3>Active Deck (${data.deck.length})</h3>
                    <div class="card-list" id="active-deck-list">
                        ${this.renderCardList(data.deck, 'deck')}
                    </div>
                </div>
                <div class="deck-column">
                    <h3>Inventory (${data.library.length})</h3>
                    <div class="card-list" id="library-list">
                        ${this.renderCardList(data.library, 'library')}
                    </div>
                </div>
            </div>
            <button class="btn" id="btn-craft" style="margin-top:10px;">Dark Crafting (Coming Soon)</button>

            <button class="btn btn-start" id="btn-start-mission">START MISSION</button>
        `;

        const btnStart = container.querySelector('#btn-start-mission');
        if (btnStart) {
            btnStart.addEventListener('click', () => {
                this.game.waitingRoomSystem.startMission();
            });
        }

        // Add Swap Listeners
        container.querySelectorAll('.mini-card').forEach(el => {
            el.addEventListener('click', (e) => {
                const index = parseInt(e.target.dataset.index);
                const source = e.target.dataset.source;
                if (source === 'deck') {
                    this.game.waitingRoomSystem.moveToLibrary(index);
                } else {
                    this.game.waitingRoomSystem.moveToDeck(index);
                }
            });
        });
    }

    renderCardList(cards, source) {
        if (cards.length === 0) return '<div class="empty-state">Empty</div>';
        return cards.map((c, i) =>
            `<div class="mini-card" data-index="${i}" data-source="${source}">
                ${c.name} <span class="cost">(${c.cost})</span>
            </div>`
        ).join('');
    }

    updateWaitingRoom(data) {
        // Re-render whole room for simplicity, or just lists
        this.renderWaitingRoom({
            enemyIntel: {
                name: "Knight Commander",
                class: "Paladin",
                hp: 500,
                weakness: "Dark Magic"
            }, // Hack: In real app, store this state properly
            deck: data.deck,
            library: data.library
        });
    }

    // --- Hand / Card Rendering ---

    showHandContainer() {
        // 마나 표시 영역
        let manaBar = document.getElementById('mana-bar');
        if (!manaBar) {
            manaBar = document.createElement('div');
            manaBar.id = 'mana-bar';
            manaBar.className = 'mana-bar';
            this.uiLayer.appendChild(manaBar);
        }
        this.updateManaDisplay(this.game.state.getState());

        // 핸드 컨테이너
        const container = document.createElement('div');
        container.id = 'hand-container';
        container.className = 'hand-container';
        this.uiLayer.appendChild(container);
    }

    updateManaDisplay(stateData) {
        const manaBar = document.getElementById('mana-bar');
        if (!manaBar) return;

        const { mana, maxMana, gold } = stateData;

        // 마나 크리스탈 시각화
        let crystals = '';
        for (let i = 0; i < maxMana; i++) {
            crystals += i < mana ? '💎' : '◇';
        }

        manaBar.innerHTML = `
            <div class="mana-display">
                <span class="mana-crystals">${crystals}</span>
                <span class="mana-text">${mana}/${maxMana}</span>
            </div>
            <div class="gold-display">💰 ${gold}</div>
        `;
    }

    showManaWarning(detail) {
        // 마나 부족 경고 표시
        const warning = document.createElement('div');
        warning.className = 'mana-warning';
        warning.innerText = `마나 부족! (필요: ${detail.required}, 보유: ${detail.current})`;
        this.uiLayer.appendChild(warning);

        // 마나바 흔들림 효과
        const manaBar = document.getElementById('mana-bar');
        if (manaBar) {
            manaBar.classList.add('shake');
            setTimeout(() => manaBar.classList.remove('shake'), 500);
        }

        // 1.5초 후 경고 제거
        setTimeout(() => warning.remove(), 1500);
    }

    renderHand(hand) {
        let container = document.getElementById('hand-container');
        if (!container) {
            this.showHandContainer();
            container = document.getElementById('hand-container');
        }

        container.innerHTML = ''; // Clear current hand

        const currentMana = this.game.state.mana;

        hand.forEach((card, index) => {
            const cardEl = document.createElement('div');
            cardEl.className = 'card';
            cardEl.dataset.index = index;

            // 마나 부족 시 비활성화 표시
            const canAfford = currentMana >= card.cost;
            if (!canAfford) {
                cardEl.classList.add('card-disabled');
            }

            // Card visual structure
            cardEl.innerHTML = `
                <div class="card-cost ${canAfford ? '' : 'cost-unaffordable'}">${card.cost}</div>
                <div class="card-title">${card.name}</div>
                <div class="card-type">${card.type}</div>
                <div class="card-desc">${card.description}</div>
            `;

            // Add card type class for styling
            cardEl.classList.add(`card-${card.type.toLowerCase()}`);

            // Drag support (마나 있을 때만)
            cardEl.draggable = canAfford;
            if (canAfford) {
                cardEl.addEventListener('dragstart', (e) => {
                    e.dataTransfer.setData('cardIndex', index.toString());
                    cardEl.classList.add('dragging');
                });
                cardEl.addEventListener('dragend', () => {
                    cardEl.classList.remove('dragging');
                });
            }

            cardEl.addEventListener('click', () => {
                this.selectCard(index);
            });

            container.appendChild(cardEl);
        });
    }
    // --- Dungeon Rendering ---

    renderDungeon(data) {
        this.clearUI();

        let container = document.getElementById('dungeon-view');
        if (!container) {
            container = document.createElement('div');
            container.id = 'dungeon-view';
            container.className = 'panel dungeon-view';
            this.uiLayer.appendChild(container);
        }

        container.innerHTML = `<h2>Dungeon Level ${this.game.currentLevel} - Placement Phase</h2>`;

        const mapContainer = document.createElement('div');
        mapContainer.className = 'dungeon-map';

        data.rooms.forEach((room, index) => {
            // Room Node
            const roomEl = document.createElement('div');
            roomEl.className = `room-node ${room.type.toLowerCase()}`;
            roomEl.dataset.index = index;

            // Room label
            let label = room.type === 'NORMAL' ? index.toString() : room.type;

            // Show occupants
            const occupantCount = room.summons.length + (room.trap ? 1 : 0);
            if (occupantCount > 0) {
                roomEl.classList.add('occupied');
                if (room.trap) {
                    label = '⚠️';
                } else {
                    label = `👾×${room.summons.length}`;
                }
            }

            roomEl.innerText = label;

            // Show Knight position
            const knightPos = this.game.dungeonSystem.currentKnightPosition;
            if (index === knightPos) {
                roomEl.classList.add('knight-here');
                roomEl.innerHTML = `<div class="knight-marker">⚔️</div>` + roomEl.innerHTML;
            }

            // Drag-drop target
            roomEl.addEventListener('dragover', (e) => {
                e.preventDefault();
                roomEl.classList.add('drop-target');
            });
            roomEl.addEventListener('dragleave', () => {
                roomEl.classList.remove('drop-target');
            });
            roomEl.addEventListener('drop', (e) => {
                e.preventDefault();
                roomEl.classList.remove('drop-target');
                const cardIndex = parseInt(e.dataTransfer.getData('cardIndex'));
                this.handleCardDrop(index, cardIndex);
            });

            // Path Line (between rooms)
            if (index > 0) {
                const pathEl = document.createElement('div');
                pathEl.className = 'room-path';
                mapContainer.appendChild(pathEl);
            }

            // Click to Place
            roomEl.addEventListener('click', () => {
                this.handleRoomClick(index);
            });

            mapContainer.appendChild(roomEl);
        });

        container.appendChild(mapContainer);

        // End Turn Button
        const endTurnBtn = document.createElement('button');
        endTurnBtn.className = 'btn btn-end-turn';
        endTurnBtn.innerText = 'END TURN';
        endTurnBtn.addEventListener('click', () => {
            this.handleEndTurn();
        });
        container.appendChild(endTurnBtn);

        // Also show hand for placement
        this.showHandContainer();
        this.renderHand(this.game.cardSystem.hand);
    }

    handleEndTurn() {
        console.log("Turn Ended - Knight Moving...");

        // Disable button during animation
        const btn = document.querySelector('.btn-end-turn');
        if (btn) {
            btn.disabled = true;
            btn.innerText = 'MOVING...';
        }

        // Show movement animation
        this.animateKnightMovement(() => {
            const result = this.game.dungeonSystem.moveKnight();

            // Re-render to show new position
            window.dispatchEvent(new CustomEvent('dungeon-updated', {
                detail: { rooms: this.game.dungeonSystem.rooms }
            }));

            if (result.encounter || result.reachedEnd) {
                // Show "ENCOUNTER!" message briefly before combat
                this.showEncounterMessage(() => {
                    this.game.changeState('COMBAT');
                });
            }
        });
    }

    animateKnightMovement(callback) {
        const knightPos = this.game.dungeonSystem.currentKnightPosition;
        const currentRoomEl = document.querySelector(`.room-node[data-index="${knightPos}"]`);
        const nextRoomEl = document.querySelector(`.room-node[data-index="${knightPos + 1}"]`);

        if (currentRoomEl) {
            currentRoomEl.classList.add('knight-leaving');
        }
        if (nextRoomEl) {
            nextRoomEl.classList.add('knight-incoming');
        }

        // Wait for animation, then callback
        setTimeout(() => {
            if (currentRoomEl) currentRoomEl.classList.remove('knight-leaving');
            if (nextRoomEl) nextRoomEl.classList.remove('knight-incoming');
            callback();
        }, 800);
    }

    showEncounterMessage(callback) {
        const overlay = document.createElement('div');
        overlay.className = 'encounter-overlay';
        overlay.innerHTML = '<div class="encounter-text">⚔️ ENCOUNTER! ⚔️</div>';
        this.uiLayer.appendChild(overlay);

        setTimeout(() => {
            overlay.classList.add('fade-out');
            setTimeout(() => {
                overlay.remove();
                callback();
            }, 500);
        }, 1000);
    }

    handleRoomClick(roomIndex) {
        console.log("Clicked Room:", roomIndex);

        // If no card selected, ignore
        if (this.selectedCardIndex === null) {
            console.log("No card selected!");
            return;
        }

        const card = this.game.cardSystem.hand[this.selectedCardIndex];
        if (!card) return;

        // Only allow Summon and Trap types to be placed
        if (card.type !== 'SUMMON' && card.type !== 'TRAP') {
            console.log("Cannot place this card type!");
            return;
        }

        // Try to place in dungeon
        const success = this.game.dungeonSystem.placeUnit(roomIndex, card);

        if (success) {
            // Remove card from hand
            this.game.cardSystem.playCard(this.selectedCardIndex);
            this.selectedCardIndex = null;
            // UI will update via events
        }
    }

    handleCardDrop(roomIndex, cardIndex) {
        const card = this.game.cardSystem.hand[cardIndex];
        if (!card) return;

        // Only allow Summon and Trap types
        if (card.type !== 'SUMMON' && card.type !== 'TRAP') {
            console.log("Cannot place this card type!");
            return;
        }

        const success = this.game.dungeonSystem.placeUnit(roomIndex, card);

        if (success) {
            this.game.cardSystem.playCard(cardIndex);
            this.selectedCardIndex = null;
        }
    }

    selectCard(index) {
        // Toggle selection
        if (this.selectedCardIndex === index) {
            this.selectedCardIndex = null;
            console.log("Deselected card");
        } else {
            this.selectedCardIndex = index;
            console.log(`Selected card: ${this.game.cardSystem.hand[index].name}`);
        }

        // Update visual selection
        this.updateCardSelection();
    }

    updateCardSelection() {
        const container = document.getElementById('hand-container');
        if (!container) return;

        const cards = container.querySelectorAll('.card');
        cards.forEach((cardEl, i) => {
            if (i === this.selectedCardIndex) {
                cardEl.classList.add('selected');
            } else {
                cardEl.classList.remove('selected');
            }
        });
    }

    // --- Combat Rendering ---

    renderCombat(data) {
        this.clearUI();

        const container = document.createElement('div');
        container.id = 'combat-view';
        container.className = 'panel combat-view';
        this.uiLayer.appendChild(container);

        // Header
        container.innerHTML = `<h2>⚔️ COMBAT - Turn ${data.turn}</h2>`;

        // Knight HP Bar
        const knightSection = document.createElement('div');
        knightSection.className = 'combat-unit knight-unit';
        const hpPercent = Math.max(0, (data.knight.hp / data.knight.maxHp) * 100);
        knightSection.innerHTML = `
            <div class="unit-name">${data.knight.name}</div>
            <div class="hp-bar">
                <div class="hp-fill knight-hp" style="width: ${hpPercent}%"></div>
            </div>
            <div class="hp-text">${data.knight.hp}/${data.knight.maxHp} HP</div>
        `;
        container.appendChild(knightSection);

        // VS Divider
        const vsDiv = document.createElement('div');
        vsDiv.className = 'vs-divider';
        vsDiv.innerText = 'VS';
        container.appendChild(vsDiv);

        // Enemy List
        const enemySection = document.createElement('div');
        enemySection.className = 'enemy-list';
        if (data.enemies.length === 0) {
            enemySection.innerHTML = '<div class="no-enemies">All enemies defeated!</div>';
        } else {
            data.enemies.forEach(enemy => {
                const enemyEl = document.createElement('div');
                enemyEl.className = 'combat-unit enemy-unit';
                const eHpPercent = Math.max(0, (enemy.hp / enemy.maxHp) * 100);
                enemyEl.innerHTML = `
                    <div class="unit-name">👾 ${enemy.name}</div>
                    <div class="hp-bar">
                        <div class="hp-fill enemy-hp" style="width: ${eHpPercent}%"></div>
                    </div>
                    <div class="hp-text">${enemy.hp}/${enemy.maxHp} HP</div>
                `;
                enemySection.appendChild(enemyEl);
            });
        }
        container.appendChild(enemySection);

        // Combat Log
        const logSection = document.createElement('div');
        logSection.className = 'combat-log';
        logSection.innerHTML = '<h3>Combat Log</h3>';
        const logList = document.createElement('div');
        logList.className = 'log-entries';
        data.log.slice(-8).forEach(entry => {
            const logEntry = document.createElement('div');
            logEntry.className = 'log-entry';
            logEntry.innerText = entry;
            logList.appendChild(logEntry);
        });
        logSection.appendChild(logList);
        container.appendChild(logSection);

        // Action Buttons
        const actionBar = document.createElement('div');
        actionBar.className = 'combat-actions';

        if (data.isActive) {
            const nextTurnBtn = document.createElement('button');
            nextTurnBtn.className = 'btn btn-combat';
            nextTurnBtn.innerText = 'AUTO BATTLE';
            nextTurnBtn.addEventListener('click', () => {
                this.autoBattle();
            });
            actionBar.appendChild(nextTurnBtn);
        } else {
            // Combat ended
            const continueBtn = document.createElement('button');
            continueBtn.className = 'btn btn-combat';
            continueBtn.innerText = data.knight.hp <= 0 ? 'VICTORY!' : 'CONTINUE';
            continueBtn.addEventListener('click', () => {
                this.handleCombatEnd(data.knight.hp <= 0);
            });
            actionBar.appendChild(continueBtn);
        }

        container.appendChild(actionBar);
    }

    autoBattle() {
        // Run combat turns automatically with delay
        const runTurn = () => {
            const result = this.game.combatSystem.executeTurn();
            if (result.combatActive) {
                setTimeout(runTurn, 800);
            }
        };
        runTurn();
    }

    handleCombatEnd(playerWon) {
        if (playerWon) {
            // Player wins! Show result
            this.game.changeState('RESULT');
        } else {
            // Knight survived - back to placement for next room
            this.game.changeState('PLACEMENT');
        }
    }

    // --- Result Screen ---

    renderResult() {
        const container = document.createElement('div');
        container.id = 'result-view';
        container.className = 'panel result-view';
        this.uiLayer.appendChild(container);

        const knightDead = this.game.combatSystem.knightParty.hp <= 0;
        // Boss defeated = Knight is at boss room AND survived the combat (enemies cleared)
        const atBossRoom = this.game.dungeonSystem.currentKnightPosition >= this.game.dungeonSystem.rooms.length - 1;
        const bossDefeated = atBossRoom && !knightDead;

        if (knightDead) {
            // Player wins! Knight Commander is dead
            container.innerHTML = `
                <div class="result-icon">🎉</div>
                <h1 class="result-title victory">VICTORY!</h1>
                <p class="result-text">The Knight Commander has fallen!</p>
                <p class="result-text">The Warlock's domain is safe... for now.</p>
                <button class="btn btn-result" id="btn-next-level">NEXT LEVEL</button>
            `;

            document.getElementById('btn-next-level').addEventListener('click', () => {
                this.game.nextLevel();
            });
        } else if (bossDefeated) {
            // Knight defeated the boss - player loses
            container.innerHTML = `
                <div class="result-icon">💀</div>
                <h1 class="result-title defeat">GAME OVER</h1>
                <p class="result-text">The Knight Commander has defeated your forces!</p>
                <p class="result-text">Your reign of terror ends here.</p>
                <button class="btn btn-result" id="btn-restart">RESTART</button>
            `;

            document.getElementById('btn-restart').addEventListener('click', () => {
                this.game.restart();
            });
        }
    }
}
