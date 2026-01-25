use crate::types::*;
use rand::rngs::SmallRng;
use rand::{Rng, SeedableRng};
use std::collections::HashSet;

pub struct MapGenerator {
    rng: SmallRng,
    difficulty: f32,
    chunk_size: usize,
}

impl MapGenerator {
    pub fn new(seed: u64, difficulty: f32) -> Self {
        Self {
            rng: SmallRng::seed_from_u64(seed),
            difficulty: difficulty.clamp(0.0, 1.0),
            chunk_size: 15,
        }
    }

    pub fn set_difficulty(&mut self, difficulty: f32) {
        self.difficulty = difficulty.clamp(0.0, 1.0);
    }

    pub fn generate_chunk(&mut self, start_y: i32) -> Chunk {
        let end_y = start_y + self.chunk_size as i32;
        let mut tiles = Vec::new();
        let mut prev_row_positions: Vec<i32> = Vec::new();

        web_sys::console::log_1(&format!("[RUST] Generating chunk start_y={}, end_y={}", start_y, end_y).into());

        // Generate tiles for each row with connectivity guarantee
        for y in start_y..end_y {
            let row_tiles = self.generate_row(y, &prev_row_positions);

            // Update prev_row_positions for next iteration
            prev_row_positions = row_tiles.iter().map(|t| t.x).collect();

            web_sys::console::log_1(&format!("[RUST] Row y={} generated {} tiles at X: {:?}", y, row_tiles.len(), prev_row_positions).into());
            tiles.extend(row_tiles);
        }

        Chunk {
            start_y,
            end_y,
            tiles,
            difficulty: self.difficulty,
        }
    }

    fn generate_row(&mut self, y: i32, prev_row_positions: &[i32]) -> Vec<Tile> {
        let mut tiles = Vec::new();
        let mut x_positions: HashSet<i32> = HashSet::new();

        // Map width: x from -5 to +5 (11 tiles total width)
        const MIN_X: i32 = -5;
        const MAX_X: i32 = 5;

        if prev_row_positions.is_empty() {
            // First row in chunk: create initial tiles (6-9 tiles)
            let num_initial = self.rng.gen_range(6..=9);
            let start_x = self.rng.gen_range(MIN_X..=(MAX_X - num_initial + 1));
            for i in 0..num_initial {
                let x = start_x + i;
                if x >= MIN_X && x <= MAX_X {
                    tiles.push(Tile {
                        x,
                        y,
                        tile_type: TileType::Normal,
                        metadata: None,
                    });
                    x_positions.insert(x);
                }
            }
        } else {
            // Calculate ALL reachable positions from previous row
            // Player can move: UP, DOWN, LEFT, RIGHT (dy=-1, dy=1, dx=-1, dx=1)
            // Since we're moving to next row (y+1), player comes from UP (dy=1 from their perspective)
            // So from prev row at Y-1, player can reach Y by moving DOWN
            // But also, player can move LEFT/RIGHT while on same row
            // Actually, player moves from (prev_x, Y-1) to (x, Y) where x = prev_x - 1, prev_x, or prev_x + 1
            let mut reachable: HashSet<i32> = HashSet::new();
            for &prev_x in prev_row_positions {
                // From position prev_x on previous row, player can move to:
                // - prev_x - 1 (moved left then down, or down then left)
                // - prev_x (moved straight down)
                // - prev_x + 1 (moved right then down, or down then right)
                for dx in -1..=1 {
                    let next_x = prev_x + dx;
                    if next_x >= MIN_X && next_x <= MAX_X {
                        reachable.insert(next_x);
                    }
                }
            }

            if reachable.is_empty() {
                web_sys::console::log_1(&format!("[RUST ERROR] No reachable positions for row y={}!", y).into());
                // Fallback: just put something in the middle
                reachable.insert(0);
            }

            // GUARANTEE at least one tile in reachable positions
            let reachable_vec: Vec<i32> = reachable.iter().copied().collect();
            let guaranteed_x = reachable_vec[self.rng.gen_range(0..reachable_vec.len())];
            tiles.push(Tile {
                x: guaranteed_x,
                y,
                tile_type: TileType::Normal,
                metadata: None,
            });
            x_positions.insert(guaranteed_x);

            web_sys::console::log_1(&format!("[RUST] Row y={} - Reachable: {:?}, Guaranteed: {}", y, reachable_vec, guaranteed_x).into());

            // Add more tiles from reachable set (60-80% chance each)
            for &x in &reachable_vec {
                if !x_positions.contains(&x) && self.rng.gen_bool(0.7) {
                    tiles.push(Tile {
                        x,
                        y,
                        tile_type: TileType::Normal,
                        metadata: None,
                    });
                    x_positions.insert(x);
                }
            }

            // Add some tiles outside reachable (for variety, but not guaranteed)
            // Only 10-20% chance to avoid making it too easy
            let extra_chance = (0.1 + self.difficulty * 0.1) as f64;
            for x in MIN_X..=MAX_X {
                if !x_positions.contains(&x) && self.rng.gen_bool(extra_chance) {
                    tiles.push(Tile {
                        x,
                        y,
                        tile_type: TileType::Normal,
                        metadata: None,
                    });
                    x_positions.insert(x);
                }
            }
        }

        // Add bonus tiles (15% chance, replace some normal tiles)
        let bonus_chance = 0.15;
        if self.rng.gen_bool(bonus_chance) && !tiles.is_empty() {
            let bonus_index = self.rng.gen_range(0..tiles.len());
            let required_face = self.rng.gen_range(1..=6);

            tiles[bonus_index].tile_type = TileType::Bonus;
            tiles[bonus_index].metadata = Some(TileMetadata {
                required_face: Some(required_face),
                allowed_faces: None,
                bonus_points: Some(10),
                destination: None,
                pair_id: None,
                is_key: None,
                linked_tiles: None,
            });
        }

        tiles
    }
}
