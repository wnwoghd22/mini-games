use crate::types::*;
use rand::rngs::SmallRng;
use rand::{Rng, SeedableRng};

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

        web_sys::console::log_1(&format!("[RUST] Generating chunk start_y={}, end_y={}", start_y, end_y).into());

        // Generate tiles for each row - SUPER SIMPLE
        for y in start_y..end_y {
            let row_tiles = self.generate_row(y);
            web_sys::console::log_1(&format!("[RUST] Row y={} generated {} tiles", y, row_tiles.len()).into());
            tiles.extend(row_tiles);
        }

        Chunk {
            start_y,
            end_y,
            tiles,
            difficulty: self.difficulty,
        }
    }

    fn generate_row(&mut self, y: i32) -> Vec<Tile> {
        let mut tiles = Vec::new();
        let mut x_positions = Vec::new();

        // TEMPORARY: Fill all tiles for debugging
        for x in -4..=4 {
            tiles.push(Tile {
                x,
                y,
                tile_type: TileType::Normal,
                metadata: None,
            });
            x_positions.push(x);
        }

        // Step 3: Add bonus tiles (15% chance, replace some normal tiles)
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

        x_positions.sort();
        web_sys::console::log_1(&format!("[RUST] Row y={} tiles at X: {:?}", y, x_positions).into());

        tiles
    }

    /* COMMENTED OUT FOR DEBUGGING - Restore later
    fn generate_row(&mut self, y: i32) -> Vec<Tile> {
        let mut tiles = Vec::new();
        let mut x_positions = Vec::new();

        // Step 1: Guarantee a connected path (at least 2-3 tiles in a row)
        // Choose a random starting point
        let path_start = self.rng.gen_range(-3..=2);
        let path_length = self.rng.gen_range(2..=4); // 2-4 connected tiles

        for i in 0..path_length {
            let x = (path_start + i).clamp(-4, 4);
            tiles.push(Tile {
                x,
                y,
                tile_type: TileType::Normal,
                metadata: None,
            });
            x_positions.push(x);
        }

        // Step 2: Add some random tiles (30-50% chance for remaining positions)
        for x in -4..=4 {
            if !x_positions.contains(&x) && self.rng.gen_bool((0.3 + self.difficulty * 0.2) as f64) {
                tiles.push(Tile {
                    x,
                    y,
                    tile_type: TileType::Normal,
                    metadata: None,
                });
                x_positions.push(x);
            }
        }

        // Step 3: Add bonus tiles (10% chance, replace some normal tiles)
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

        x_positions.sort();
        web_sys::console::log_1(&format!("[RUST] Row y={} tiles at X: {:?}", y, x_positions).into());

        tiles
    }
    */
}
