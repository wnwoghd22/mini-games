# Hex Conveyor: Game Design & Development Roadmap

## 1. Game Concept

A **hexagonal grid conveyor belt puzzle** where each hex cell points in one of 6 directions. Clicking a cell rotates its direction. Connected directional chains form **conveyor belts** that move tiles. The goal is to route colored tiles through matching colored **holes** on the 6 outer edges of the grid.

**Core Fantasy**: You are an engineer managing a hexagonal conveyor system — rotate the belts to sort colored packages into the correct chutes.

---

## 2. Core Mechanics

### A. Grid
- **Shape**: Pointy-topped hexagonal grid, radius 4 (61 cells)
- **Each cell has**:
  - A **direction** (0-5, corresponding to the 6 hex neighbors)
  - An optional **tile** (colored piece sitting on the cell)

### B. Direction & Conveyor Belts
- Each hex points to exactly **one adjacent hex**
- A **conveyor chain** is formed when hex A points to hex B, and hex B points to hex C, etc.
- Chains can:
  - **Exit**: Lead to one of the 6 outer colored holes
  - **Loop**: Cycle internally without reaching any hole (strategic, no score)

### C. Input
- **Click a hex**: Rotates its direction clockwise by 60 degrees
- **Long-press or right-click**: Rotates counter-clockwise

### D. Simulation (Play Button)
- Pressing the **Play button** advances all tiles one step along their conveyor direction
- Tiles that reach a hole matching their color are **scored and removed**
- Tiles that reach a non-matching hole are **destroyed with penalty** (-5 points)
- Tiles in internal loops stay in the loop

### E. Tile Refill
- When all tiles have either exited or are stuck in loops (no tile can reach any hole), **empty cells** are filled with new random colored tiles
- This creates a new puzzle state to solve

---

## 3. Scoring & Goals

### A. Scoring
- **Match**: Tile exits through matching color hole = **+10 points**
- **Combo**: Multiple tiles of the same color exit in one simulation = **combo multiplier** (x2, x3, etc.)
- **Loop Bonus**: Creating a loop that holds N tiles and then releasing them all at once = **N x 5 bonus**

### B. Color Progression
- Starting colors: 3 (Red, Blue, Green)
- Unlockable colors: Yellow (500pts), Purple (1500pts), Orange (3000pts)
- More colors = more complexity

### C. Game Over
- Grid is full of tiles AND no tile can reach any matching hole
- No valid moves remain (all directions checked, no possible exit path)

---

## 4. Visual Design

### A. Grid Rendering
- **Canvas-based** rendering (consistent with hex-defense, hex-connect)
- Dark background (#0f172a), hex cells (#1e293b)
- Direction indicator: **arrow** drawn inside each hex pointing to its target neighbor

### B. Tiles
- Colored circles/diamonds rendered on top of hex cells
- Smooth sliding animation during simulation step
- Glow effect when tile is on a path leading to its matching hole

### C. Holes
- 6 colored holes positioned outside the grid, one per hex direction
- Each hole has a **color indicator** and a **slot counter** (how many tiles it has accepted)
- Visual "suction" animation when a tile enters a matching hole
- "Reject" animation (bounce/spark) when tile color doesn't match

### D. Conveyor Feedback
- **Connected chain highlight**: When hovering a hex, highlight the entire conveyor chain it belongs to
- **Path preview**: Show which hole a chain leads to (if any)
- **Loop indicator**: Subtle pulsing glow on cells that are part of an internal loop

---

## 5. UI Elements

### A. Top Bar
- **Score** display
- **Combo** counter (current combo multiplier)
- **Play button** (prominent, centered)
- **Undo** button (reverse last direction change)
- **Reset** button (restart current puzzle state)

### B. Side Panel (optional, right side)
- **Color legend**: Shows hole colors and how many tiles of each color remain
- **Controls guide**: Click = rotate CW, Right-click = rotate CCW

---

## 6. Technical Architecture

### A. File Structure
```
hex-conveyor/
  index.html
  style.css
  game.js
```

### B. Classes
- **Hex**: Cube coordinate system (q, r, s) — reuse from hex-defense/hex-connect
- **Layout**: Pointy-topped hex to pixel conversion — reuse from existing games
- **Cell**: { hex, direction (0-5), tile (color | null), isLoop }
- **ConveyorSystem**: Manages chain detection, loop detection, path tracing
- **Tile**: { color, position (hex key), animState }
- **Hole**: { direction (0-5), color, acceptedCount }
- **Game**: Main game loop, input handling, rendering, scoring

### C. Key Algorithms
1. **Chain Detection**: Follow direction pointers from each cell to build chains
2. **Loop Detection**: DFS with visited set — if we revisit a cell in the same traversal, it's a loop
3. **Path-to-Hole**: Trace from each cell following directions; if it exits the grid boundary, determine which hole direction it matches
4. **Simulation Step**: Move all tiles simultaneously along their cell's direction; resolve exits/rejects; refill empties

### D. Shared Code
- `Hex` class: Copy from hex-defense (cube coords, neighbor, distance, etc.)
- `Layout` class: Copy from hex-connect (hexToPixel, pixelToHex, hexRound)

---

## 7. Development Phases

### Phase 1: Foundation
- [ ] Project setup (index.html, style.css, game.js)
- [ ] Hex grid rendering (61 cells, pointy-topped)
- [ ] Direction system (click to rotate, arrow visualization)
- [ ] Basic conveyor chain detection

### Phase 2: Core Gameplay
- [ ] Tile spawning (random colored tiles on grid)
- [ ] Play button simulation (one-step tile movement)
- [ ] Hole system (6 colored holes on grid edges)
- [ ] Tile exit logic (match/mismatch)
- [ ] Tile refill when grid stalls

### Phase 3: Scoring & Polish
- [ ] Score system + combo multiplier
- [ ] Loop detection + loop bonus
- [ ] Undo / Reset functionality
- [ ] Color unlock progression

### Phase 4: Visual Polish
- [ ] Smooth tile sliding animations
- [ ] Hole suction/reject animations
- [ ] Chain highlight on hover
- [ ] Loop glow indicator
- [ ] Sound effects (click, slide, match, reject, combo)

### Phase 5: Game Over & Meta
- [ ] Game over detection
- [ ] Score summary screen
- [ ] Responsive design (mobile touch support)

---

## 8. Design Tradeoffs & Notes

### A. Simultaneous vs Sequential Tile Movement
- **Simultaneous** (all tiles move at once): More puzzle-like, requires planning
- **Sequential** (one tile at a time): More casual, easier to understand
- **Decision**: Simultaneous — fits the "conveyor belt" fantasy better

### B. Rejected Tile Behavior
- **Option A**: Tile destroyed with penalty (-5 points)
- **Option B**: Tile bounces back to previous cell
- **Option C**: Tile stays at edge cell, blocks that cell
- **Decision**: Option A (destroyed with penalty) — keeps grid from getting clogged, adds risk/reward

### C. Loop Strategy
- Loops are **intentionally allowed** as a strategic tool
- Player can hold tiles in a loop, rotate directions to set up a mass-release combo
- Loop detection should be visual so player knows which cells are looping

### D. Difficulty Scaling
- Start with 3 colors, radius 4 grid
- As score increases, unlock more colors
- More colors = more planning required = natural difficulty curve

---

## 9. Inspiration & References
- **hex-defense**: Hex grid math, Canvas rendering, enemy path following
- **hex-connect**: Hex grid interaction, color matching, score-based unlocks
- **tile-push**: Game design document format, puzzle game structure
- **Mini Metro / Mini Motorways**: Flow-based puzzle design, minimalist UI
- **Conveyor belt puzzle games**: Factorio, Shapez (tile routing concepts)
