# Tile Push Puzzle: Game Design & Implementation Plan

## 1. Game Concept
A **Tile Pushing Puzzle** where the player manipulates a grid of pipe fragments to connect a flow from a **Source** to a **Sink**.

### Core Mechanics
- **Grid Size**: 5x5.
- **Goal**: Create a continuous pipe path from the **Fixed Source** to the **Fixed Sink**.
- **Interaction**:
  - The player holds a "Hand" of one or more tiles.
  - The player can **push** the top tile from their hand into any row or column from the edges (Top, Bottom, Left, Right).
  - Pushing inserts the new tile and shifts the entire row/column.
  - The tile that gets pushed out on the opposite side is added to the player's Hand (cycling mechanism).
- **Tile Types**:
  - **Straight**: Lines (| or -)
  - **Corner**: L-shapes (└, ┐, etc.)
  - **T-Shape**: (┴, ├, etc.)
  - **Cross**: (+)
- **Win Condition**: Fluid (conceptually) can flow from Source coordinate to Sink coordinate.

## 2. Technical Stack
- **Engine**: Vanilla HTML5, CSS3, JavaScript (ES6+).
- **Styling**: Dark/Neon theme with CSS Grid layout.
- **State**: Plain JS Objects.

## 3. Implementation Steps

### Phase 1: Project Setup
- Create directory structure: `/tile-push/`
- Set up `index.html` with a container for the game board and UI controls.
- Set up `style.css` for the 5x5 grid layout and dark theme.

### Phase 2: Core Logic (The "Engine")
- **Data Structures**:
  - `Grid`: 2D Array (5x5) storing tile objects `{ type, rotation }`.
  - `Hand`: Array/Stack of tile objects.
  - `Source/Sink`: Coordinates `{r, c}`.
- **Functions**:
  - `shiftRow(rowIndex, direction, inputTile)`: Shifts items, returns the overflow tile.
  - `shiftCol(colIndex, direction, inputTile)`: Shifts items, returns the overflow tile.
  - `isConnected(source, sink)`: Breadth-First Search (BFS) to traverse pipe connections.

### Phase 3: Interaction & Rendering
- **Grid Rendering**: Dynamically generate DOM elements based on the `Grid` state.
- **Controls**:
  - Render "Push Buttons" (Arrows) around the grid edges.
  - render the "Current Hand" tile visibly.
- **Event Handling**:
  - Click Arrow -> Trigger Shift -> Update State -> Re-render.

### Phase 4: Win Condition & Scrambling
- **Level Generation**:
  1. Start with a guaranteed solved path (e.g., a simple loop or direct line).
  2. **Scramble**: Perform N random valid moves (pushes) to shuffle the board.
  3. Ensure the solvable state is preserved (technically, any state reachable from a solved state via reversible moves is solvable, though we're using a cycle mechanics so we need to be careful about parity, but random scrambling usually works well for this genre).
- **Win Visualization**: Highlight the connected path when the user wins.

### Phase 5: Polish
- **Animations**: CSS transitions for sliding tiles (`transform: translate`).
- **Visuals**: Neon glow effects for pipes.
- **Sound**: Simple pop/slide sounds (optional).
