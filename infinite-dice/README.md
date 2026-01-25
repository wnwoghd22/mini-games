# Infinite Dice Roll

An endless runner game where you control a rolling dice on an infinite procedurally-generated platform. Navigate through special tiles and survive as long as possible!

## Features

### Core Gameplay
- **Dice Face Tracking**: The game tracks which face (1-6) is on top of the dice using quaternion rotations
- **Endless Scrolling**: Procedurally generated tiles scroll continuously
- **Physics-Based Rolling**: Realistic dice rolling animation with 3D transforms

### Special Tile Types

1. **Bonus Tile** (Gold)
   - Requires face 6 to activate
   - Grants +10 points

2. **Conditional Tile** (Blue)
   - Only allows faces 3, 4, or 5
   - Other faces cause you to fall

3. **Teleport Tile** (Purple, pulsing)
   - Requires face 1 to activate
   - Warps you to a different location

4. **Lock Tile** (Green key, Red door)
   - Requires face 2 to unlock
   - Opening the key spawns new path tiles

### Advanced Map Generation

The game uses a **Rust WebAssembly** module for efficient procedural map generation:
- Generates chunks of 10-20 rows at a time
- Ensures safe paths exist on every row
- Automatically places special tiles based on difficulty
- Caches chunks for performance
- Falls back to JavaScript generator if WASM fails to load

## Building the WASM Module

### Prerequisites
- [Rust](https://www.rust-lang.org/tools/install)
- [wasm-pack](https://rustwasm.github.io/wasm-pack/installer/)

### Build Steps

```bash
cd wasm-mapgen
wasm-pack build --target web --out-dir pkg
```

Or use the build script:
```bash
cd wasm-mapgen
build.bat  # Windows
```

## Running the Game

1. Build the WASM module (see above)
2. Serve the game directory with a local web server:
   ```bash
   # Example using Python
   python -m http.server 8000
   ```
3. Open `http://localhost:8000` in your browser
4. Press "START GAME" and use arrow keys to move

## Controls

- **Arrow Keys**: Move the dice (up/down/left/right)
- The dice face changes as you move in different directions
- Stand on tiles with the correct face to survive!

## Difficulty Progression

- Difficulty gradually increases with your score
- Higher difficulty means fewer tiles and more gaps
- Special tiles appear more frequently at higher difficulties

## Technical Details

### Architecture
- **Frontend**: Vanilla JavaScript with CSS 3D transforms
- **Map Generation**: Rust compiled to WebAssembly
- **Build Tool**: wasm-pack

### Performance Optimizations
- Chunk-based map generation (15 rows per chunk)
- Chunk caching (stores last 10 chunks)
- Optimized WASM binary size (`opt-level = "z"`)
- Tile culling for off-screen elements

## License

MIT
