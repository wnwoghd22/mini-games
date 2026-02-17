# Tile Push Puzzle: Game Design & Expansion Plan

## 1. Game Concept
A **Tile Pushing Puzzle** where the player manipulates a grid of pipe fragments to connect flows from **Sites** to **Sinks**. The unique mechanic is "pushing" tiles from the edges, shifting rows/columns and recycling the overflow tile back into the player's hand.

### Core Mechanics
- **Grid Size**: 5x5 (Expandable to 7x7 for higher difficulty).
- **Goal**: Create continuous pipe paths matching specific criteria (e.g., Simple Connection, Color Matching).
- **Interaction**:
  - **Click/Tap**: Tap directional arrows on the border to push the current hand tile.
  - **Drag & Drop**: Drag the tile from the "Hand" to any valid edge position to push. 
- **The Cycle**: Pushing a tile inserts it -> shifts row/col -> pops opposite tile -> popped tile becomes new Hand.

## 2. Advanced Features & Mechanics

### A. Enhanced Interactions
- **Slide Animations**: Smooth CSS transitions (`0.3s ease-out`) when tiles move. The new tile slides in, existing tiles shift, and the popped tile fades out/slides to Hand.
- **Haptic Feedback**: Subtle vibration on mobile when a tile snaps into place or a connection is made.
- **"Ghost" Preview**: Hovering or dragging near an edge shows a semi-transparent preview of the result (where tiles will end up).

### B. Level Design & Objectives
- **Multiple Sinks & Colors**: 
  - **Red Source** -> **Red Sink**
  - **Blue Source** -> **Blue Sink**
  - Paths cannot cross unless using a special **Cross-over** tile.
- **Multi-Output Sources**: A source might require splitting flow into two directions.
- **Locked Tiles**: Some tiles are bolted down (cannot be shifted). Pushing a row with a locked tile is blocked (or shifts only the segment before/after? Usually blocked is simpler).

### C. Special Tile Types
- **Omni-Pipe (Wildcard)**: Connects to all 4 directions locally, acts as a bridge.
- **One-Way Valve**: Flow only goes in direction of the arrow.
- **Cracked Pipe**: Leaks (loses condition) if flow passes through. Must be avoided or repaired (if repair mechanic exists).
- **Portal Pair**: Flow entering Portal A exits Portal B.

### D. Scoring & Progression
- **Move Counter**: "Par" number of moves for each level.
- **Undo System**: essential for puzzle solving. Stack-based history of moves.
- **Star Rating**: 
  - 3 Stars: Solved under X moves.
  - 2 Stars: Solved.
  - 1 Star: Solved but used "Hint".

## 3. Technical Stack Improvements
- **Animation System**: 
  - Use `requestAnimationFrame` or CSS Transitions. 
  - Logic state updates immediately, Visual state interpolates.
  - Input blocked during animation.
- **Input Handling**: 
  - Unified Pointer Events for Mouse/Touch.
  - Drag gesture detection optimization.

## 4. Implementation phases (Revised)

### Phase 1: Core Polish (Current)
- [x] Basic Grid & Shifting
- [x] Win Condition (Source -> Sink)
- [ ] **Slide Animations**: Refactor render loop to support transition states.

### Phase 2: Enhanced Input
- [ ] **Drag & Drop**: Implement `mousedown`/`touchstart` on Hand tile, visual feedback on drop zones.
- [ ] **Keyboard Controls**: Arrow keys to select edge, Space/Enter to push.

### Phase 3: Complexity
- [ ] **Multi-Color Logic**: Update `checkWin` to track "Fluid Type" (Color).
- [ ] **Obstacles**: Add `locked` property to Tile class.
- [ ] **Undo/Redo**: Store Game State snapshots.

### Phase 4: Juice
- [ ] **Flow Animation**: When connected, animate the "fluid" flowing through the pipes.
- [ ] **Particles**: Sparks upon connection.
- [ ] **Sound**: SFX for Slide, Snap, Flow, Win.

