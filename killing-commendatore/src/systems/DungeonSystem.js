/**
 * DungeonSystem.js
 * Generates and manages the dungeon map (Rooms and Paths).
 * Darkest Dungeon style: Linear/Branched paths of nodes.
 */

export class DungeonSystem {
    constructor(gameManager) {
        this.game = gameManager;
        this.rooms = []; // Array of Room objects
        this.currentKnightPosition = 0; // Index of room Knight is in
    }

    generateDungeon(level = 1) {
        this.rooms = [];
        const length = 5 + level; // Simple scaling

        for (let i = 0; i < length; i++) {
            this.rooms.push({
                id: i,
                type: this.getRoomType(i, length),
                summons: [],    // Array of SUMMON cards (max 4)
                trap: null,     // Single TRAP card
                name: `Room ${i + 1}`
            });
        }

        console.log("Dungeon Generated:", this.rooms);

        window.dispatchEvent(new CustomEvent('dungeon-updated', {
            detail: { rooms: this.rooms }
        }));
    }

    getRoomType(index, totalLength) {
        if (index === 0) return 'START';
        if (index === totalLength - 1) return 'BOSS';
        return 'NORMAL'; // Could be TRAP, TREASURE, etc.
    }

    // Place a unit/card in a specific room
    placeUnit(roomIndex, card) {
        if (roomIndex < 0 || roomIndex >= this.rooms.length) return false;

        // Cannot place in the room where knight is
        if (roomIndex === this.currentKnightPosition) {
            console.warn("Cannot place units where the Knight is!");
            return false;
        }

        const room = this.rooms[roomIndex];

        // Rule: If trap exists, cannot add anything
        if (room.trap) {
            console.warn("Room has a trap - cannot add more units!");
            return false;
        }

        if (card.type === 'TRAP') {
            // Trap takes exclusive control of the room
            if (room.summons.length > 0) {
                console.warn("Cannot place trap - room has summons!");
                return false;
            }
            room.trap = card;
            console.log(`Placed trap ${card.name} in Room ${roomIndex}`);
        } else if (card.type === 'SUMMON') {
            // Max 4 summons per room
            if (room.summons.length >= 4) {
                console.warn("Room is full (max 4 summons)!");
                return false;
            }
            room.summons.push(card);
            console.log(`Placed summon ${card.name} in Room ${roomIndex} (${room.summons.length}/4)`);
        } else {
            console.warn("Cannot place SPELL cards in rooms!");
            return false;
        }

        // Notify UI
        window.dispatchEvent(new CustomEvent('dungeon-updated', {
            detail: { rooms: this.rooms }
        }));

        return true;
    }

    getDungeonState() {
        return {
            rooms: this.rooms,
            knightPos: this.currentKnightPosition
        };
    }

    // Knight Movement
    moveKnight() {
        // Move to next room
        this.currentKnightPosition++;

        console.log(`Knight moved to Room ${this.currentKnightPosition}`);

        // Check if reached end (BOSS room)
        if (this.currentKnightPosition >= this.rooms.length - 1) {
            console.log("Knight reached the BOSS room!");
            return { reachedEnd: true, encounter: true };
        }

        const currentRoom = this.rooms[this.currentKnightPosition];

        // Check for encounter
        const hasEncounter = currentRoom.summons.length > 0 || currentRoom.trap !== null;

        // Notify UI of movement
        window.dispatchEvent(new CustomEvent('knight-moved', {
            detail: {
                position: this.currentKnightPosition,
                room: currentRoom,
                hasEncounter
            }
        }));

        return { reachedEnd: false, encounter: hasEncounter, room: currentRoom };
    }
}
