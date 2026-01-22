# Hex Defense 🛡️

Hex Defense is a strategic tower defense game played on a hexagonal grid. Players place clusters of turrets ("polyominoes") to defend against waves of enemies moving across the map.

## 🎮 Current Features (Phase 1: JS Prototype)
- **Hexagonal Grid**: Custom grid system using cube coordinates.
- **Pathfinding**: Enemies spawn and follow a calculated path from start to end.
- **Shop System**: Buy random turret clusters (Tiles) using gold.
- **Drag & Drop Placement**: Drag tiles from the shop to the grid. Validates placement against path and obstacles.
- **Turret Combat**:
    - **Red**: Rapid fire, low range.
    - **Green**: Slow fire, high damage.
    - **Blue**: Medium range, applies slow/weaken (logic implemented, stats placeholder).
- **UI/UX Enhancements**:
    - **Turret Info**: Hover/Select turrets to see damage, range, and cooldown stats.
    - **Wave Info**: Display current enemy types, HP, and count.
    - **Dynamic Pathing (Maze Building)**:
    - Enemies find the shortest path to the exit.
    - Players can place turrets to block paths and force enemies to take longer routes (Maze Building).
    - Placement is only valid if a path to the exit remains open.
- **Selling**: Long press Right-Click on a turret to sell it for partial gold refund.
- **Merge Mechanics (Chain-Connect)**:
    - inspired by *Hex Connect*. Drag across multiple adjacent turrets of the same type to link them.
    - Merging 3+ turrets creates a significantly stronger upgraded turret.
    - The longer the chain, the higher the bonus stats.

## 🚀 Future Implementation Plan (Phase 2: Rust & WebAssembly)
The goal is to migrate performance-critical logic to Rust for high-speed simulation, allowing for thousands of units and complex flow fields.

### 1. Rust Environment Setup
- [ ] Initialize `hex-defense-core` Rust crate.
- [ ] Configure `wasm-pack` for building WebAssembly targets.

### 2. Core Logic Migration
- [ ] **Grid State**: Port the `Map` and `Hex` logic to Rust structs.
- [ ] **Pathfinding**: Implement high-performance pathfinding (Flow Fields or Dijkstra) in Rust to support massive unit counts.
- [ ] **Collision & Physics**: Move entity movement and collision detection to Rust.

### 3. Wasm Integration
- [ ] **Game Loop**: Expose a `tick(dt)` function in Wasm that updates the entire game state.
- [ ] **Rendering Bridge**: Efficiently transfer render data (positions, types) from Wasm memory to JS for Canvas rendering.

### 4. Advanced Features
- [ ] **Complex Enemy AI**: Enemies that flank or react to turret placement.
- [ ] **Tech Tree**: Persistent upgrades for turrets.
- [ ] **Endless Mode**: Procedurally generated waves with increasing difficulty.
