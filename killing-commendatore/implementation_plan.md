# Implementation Plan - Killing Commendatore

## Goal Description
Build a "Reverse Dungeon Crawler" game where the player, a female Warlock, summons monsters and traps to assassinate the Knight Commander. The game combines **Deck Building**, **Tower Defense (Placement)**, and **Turn-Based RPG** elements with a strong narrative focus.

## Tech Stack
-   **Core**: Vanilla JavaScript
-   **Styling**: CSS (Modern Variables, Flexbox/Grid) for a custom "Noir Fantasy" aesthetic.
-   **State Management**: Custom Event-driven State Store (Observer Pattern).

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

#### Battle System (The Logic Core)
-   **Grid-based**: 1D or 2D lane system? *Proposal: 3-Lane System or simple 2D Grid (e.g., 3x5)* to allow tactical placement.
-   **Phases**:
    1.  **Placement**: Player spends Mana to place units from Hand.
    2.  **Knight Action**: Knight moves/attacks/interacts.
    3.  **Monster Action**: Summoned units attack.
    4.  **Player Intervention**: Player casts Spell cards.

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
