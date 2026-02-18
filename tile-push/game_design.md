# Tile Push Puzzle: Game Design & Development Roadmap

## 1. Game Concept
A **Tile Pushing Puzzle** where the player manipulates a grid of pipe fragments to connect flows from **Source** to **Sink**. The core mechanic involves pushing tiles into the grid from the edges, which shifts the entire row or column and pops the opposite tile out to be recycled.

## 2. Core Mechanics (Implemented)
- **Grid Size**: 5x5.
- **Goal**: Connect the **Source (Green)** to the **Sink (Red)** with a continuous pipe path.
- **Input**:
  - **Drag & Drop**: Drag a tile from the 3-slot Hand to any valid arrow on the grid edge.
  - **Recycling**: The tile pushed out of the grid returns to the specific hand slot used.
- **Constraints**:
  - **Locked Tiles (🔒)**: Specific tiles are fixed and block their entire row/column from being pushed.
- **Quality of Life**:
  - **Undo (↩️)**: Reverse the last move (even if solved).
  - **Reset (↺)**: Restart the current level from its initial state.
  - **Scramble (🔄)**: Generate a new random solvable level.

## 3. Visuals & Feedback (Implemented)
- **Fluid Animation**: Smooth sliding animations for tile shifts.
- **Connection Glow**:
  - Connected pipes glow **Neon Blue** via a BFS trace from the Source.
  - When the Sink is reached, the flow pulses and interaction locks.
- **UI**: Minimalist, language-agnostic interface using SVG icons.

## 4. Planned Features (Next Steps)

### A. Game Logic Complexity
- **Multi-Color Flow (🔴 & 🔵)**:
  - Introduce a second pair of Source/Sink (e.g., Blue).
  - Both paths must be completed simultaneously.
  - Paths cannot cross (unless a special "Cross" tile is introduced).
- **Special Tiles**:
  - **Cross/Bridge**: Allows two flows to cross without mixing.
  - **One-Way Valve**: Flow only goes in one direction.

### B. Polish & Meta
- **Score System**:
  - **Move Counter**: Track efficiency.
  - **Par Score**: Target move count for each generated level.
- **Sound Effects**:
  - Slide, Lock Impact, Connection, Win.
- **Level System**:
  - Currently random. Implement a "Seed" system or specific difficulty tiers (Easy/Medium/Hard) based on grid size or locked tile count.

## 5. Technical Stack
- **Engine**: Vanilla JavaScript (ES6+).
- **Rendering**: DOM-based (Divs/CSS Grid) with CSS Transitions.
- **Pathfinding**: BFS for flow tracing.
