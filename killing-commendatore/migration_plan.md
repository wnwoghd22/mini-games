# Unity Migration Plan: Killing Commendatore

## Goal
Migrate the existing vanilla JS web prototype of "Killing Commendatore" to Unity to leverage a robust engine for easier scaling, visual effects, and performance.
**Core Philosophy:** "Bright Exterior, Dark Interior." The game should look cheerful and inviting, creating an ironic contrast with the dark narrative and plot twists.

## 1. Technical Stack & Setup
- **Engine Version**: Unity 6 (Latest LTS recommended for stability).
- **Render Pipeline**: Universal Render Pipeline (URP) 2D. 
    - *Why*: Good performance, support for 2D lighting (optional but good for atmosphere), and post-processing (essential for the "dreamy/bright" look).
- **Language**: C#
- **Version Control**: Git (with `.gitignore` for Unity).

## 2. Project Structure (Unity Best Practices)
```text
Assets/
├── _Game/              # Own assets to separate from plugins
│   ├── Art/
│   │   ├── Sprites/
│   │   └── Animations/
│   ├── Audio/
│   ├── Prefabs/
│   ├── ScriptableObjects/ # Data containers (Cards, Enemies, Dialogue)
│   ├── Scripts/
│   │   ├── Systems/    # Managers (GameManager, CombatManager)
│   │   ├── UI/
│   │   └── Data/       # Data classes
│   └── Scenes/
└── Plugins/            # 3rd party assets
```

## 3. Core Mechanics Porting Strategy

### A. Data Management (JSON -> ScriptableObjects)
Existing JS data (`data/*.js`) will be converted to Unity **ScriptableObjects**. This allows easy editing in the Inspector without code changes.
- **Cards**: Create `CardData` ScriptableObject (Name, Cost, Effect, Description, Sprite).
- **Enemies**: Create `EnemyData` ScriptableObject (Stats, Sprite, Behavior Patterns).
- **Dialogue**: Create `DialogueData` or use a simple node-based structure for conversations.

### B. Systems Migration
| JS System | Unity Equivalent | Implementation Notes |
| :--- | :--- | :--- |
| `GameManager` | `GameManager` (Singleton) | Manages global state (Exploration vs Combat), Scene loading. |
| `CardSystem` | `CardManager` + UI Layout Groups | Use Horizontal Layout Group for hand. Drag-and-drop using `IDragHandler`. |
| `CombatSystem` | `TurnBasedBattleSystem` | State machine (PlayerTurn -> EnemyTurn -> Win/Loss). Coroutines for timing. |
| `DungeonSystem` | Tilemap / Grid System | Use Unity's Tilemap for levels. Procedural generation script if needed, or hand-crafted Prefabs. |
| `DialogueSystem` | Canvas Overlay + DOTween | Simple UI panel. Typewriter effect for text. |
| `WaitingRoom` | WaitingRoom Scene | A safe hub scene with interaction points (Menu buttons/World Space Canvas). |

### C. Input Handling
- Use the **New Input System** package. 
- Map Mouse/Touch for card interaction.
- Map Keyboard/Gamepad for navigation if applicable (Dungeon movement).

## 4. Visuals & Atmosphere ("Bright & Ironic")

### A. Art Style
- **Protagonist**: Use the provided `protagonist.png`. Note that the design may evolve (e.g., black outfit).
    - *Action*: Import `protagonist.png`, set Texture Type to Sprite (2D and UI).
- **Environment**: High contrast. Dark colors are allowed but should serve to highlight bright, cheerful elements.
- **Lighting**: versatile. Can be dark with bright point lights, or globally bright. The goal is "Atmosphere," not just "Brightness."

### B. Effects
- **Bloom**: Mild bloom to make everything feel slightly dreamlike/ethereal.
- **Particles**: Sparkles, petals, or light motes instead of dust/blood. 
- **Irony**: When a dark event happens (e.g., text describes a gruesome murder), the visuals remain disturbingly cheerful (e.g., confetti instead of blood splatters).

## 5. UI/UX
- **Framework**: Unity UI (UGUI) or UI Toolkit. UGUI is easier for world-space interaction (cards).
- **Font**: Rounded, friendly typeface (e.g., Varela Round, M Plus Rounded).
- **Colors**: White, Cyan, Pink, Yellow. Avoid Red/Black for UI elements unless it's a specific "glitch" effect for the horror elements.

## 6. Migration Steps
1.  **Project Init**: Create Unity project, setup folders.
2.  **Asset Import**: Import `protagonist.png`, create placeholders for other graphics.
3.  **Data Port**: Create ScriptableObject definitions (`Card`, `Enemy`).
4.  **Core Loop**: Implement `GameManager` and simple Scene switching.
5.  **Combat Prototype**: Implement Card drawing + Enemy placeholder + Turn logic.
6.  **Dungeon Prototype**: Implement Tilemap movement.
7.  **Integration**: Link Dungeon -> Combat encounter.
8.  **Polish**: Apply "Bright" post-processing and UI styling.

## 7. Verification Plan
- **Editor Testing**: Run scene in Editor, verify card drawing and cost deduction.
- **Build Testing**: Build for Windows/WebGL, verify input works outside editor.
- **Asset Check**: Verify `protagonist.png` renders correctly in the bright lighting setup.
