# Implementation Plan - Killing Commendatore

## Goal Description
Build a "Reverse Dungeon Crawler" game where the player, a female Warlock, summons monsters and traps to assassinate the Knight Commander. The game combines **Deck Building**, **Tower Defense (Placement)**, and **Turn-Based RPG** elements with a strong narrative focus.

## Tech Stack
-   **Core**: Vanilla JavaScript (ES Modules, loaded via `<script type="module">` or standard scripts)
-   **Styling**: Vanilla CSS (CSS Variables for theming).
-   **State Management**: Simple Global State Object or Custom Event System.
-   **No Build Tools**: Pure HTML/CSS/JS architecture.

## User Review Required
> [!IMPORTANT]
> **Art Style**: The game requires a "Gloomy/Noir" visual style. I will use CSS effects and generating placeholder assets.
> **Combat Balance**: The balance between "Auto-Battle" and "Player Intervention" needs tuning. I plan to start with a simple "Card Play" intervention system.

## Proposed Changes

### 1. Project Structure
```text
killing-the-knight-commander/
├── index.html
├── src/
│   ├── main.js           # Entry point
│   ├── game/
│   │   ├── GameManager.js    # Phase control (Placement -> Battle -> Result)
│   │   ├── GameState.js      # Global state (Resources, HP, Deck)
│   │   ├── Loop.js           # Main game loop
│   ├── systems/
│   │   ├── DialogueSystem.js # Story engine
│   │   ├── CardSystem.js     # Deck, Hand, Shop
│   │   ├── BattleSystem.js   # Turn logic, AI, Damage calc
│   │   ├── GridSystem.js     # Dungeon layout & positioning
│   ├── entities/
│   │   ├── Unit.js           # Base class for Monsters/Knight
│   │   ├── Card.js           # Base class for Spell/Summon cards
│   ├── ui/
│   │   ├── UIManager.js      # HUD, Windows, Overlays
│   │   ├── components/       # Reusable UI elements
│   ├── assets/               # Images, Sounds
│   └── data/                 # JSON configs for Cards, Enemies, Story
└── style.css
```

### 2. Core Systems Detail

#### Dialogue System
-   Simple script format (JSON or Text-based parsing).
-   Overlay UI with character portraits and text box.
-   Triggers: Start of run, entering specific floors, encountering the Boss.

#### Card & Shop System
-   **Resources**: Mana (Combat), Gold (Shop).
-   **Types**:
    -   `Summon`: Places a unit on the grid during Placement Phase.
    -   `Spell`: Direct effect during Battle Phase (Heal, Damage, Buff).
    -   `Trap`: Hidden unit triggered by enemy movement.

#### Waiting Room (Preparation Phase)
-   **Goal**: Strategic preparation based on intelligence.
-   **Features**:
    1.  **Enemy Intel**: Show the Knight's class, stats, and accompanying party members.
    2.  **Deck Lab**:
        -   *Edit*: Swap cards between "Library" (Collection) and "Active Deck".
        -   *Craft*: Combine 2 weak cards to make a stronger one.
    3.  **Start Mission**: Button to commit to the loadout and enter the Dungeon.

#### Dungeon Path System (Darkest Dungeon Style)
-   **Structure**: A series of **Rooms** connected by **Corridors** (Paths).
-   **Visuals**: Side-scrolling or Map View? *Decision: Linear Node Map (Left to Right)*.
-   **Flow**:
    1.  **Warlock Phase (Placement)**: Player views the empty dungeon path. Plays generic "Summon" or "Trap" cards into specific *Rooms* or *Corridors*.
    2.  **Knight Phase (Movement)**: Knight party advances room by room.
    3.  **Encounter**: When Knight enters a room with a Summon, Combat begins.

#### Combat System
-   **Auto-Battler**: Units fight automatically based on stats.
-   **Intervention**: Player can use Spell cards during combat.

### 3. Verification Plan
-   **Automated**: Unit tests for Card logic (Draw, Shuffle) and Battle logic (Damage calculation).
-   **Manual**: Playtest the "Core Loop" iteratively.
    1.  Can I trigger a dialogue?
    2.  Can I buy a card?
    3.  Can I place a unit?
    4.  Does the unit attack the Knight?

## Priorities
1.  **Skeleton**: Get the folder structure and Main Loop running.
2.  **Dialogue**: Implement the intro scene to set the mood.
3.  **Battle Prototype**: Implement a minimal battle with 1 Knight vs 1 Slime.
