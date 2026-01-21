use wasm_bindgen::prelude::*;
use std::collections::HashSet;
use std::collections::VecDeque;
use serde::{Serialize, Deserialize};

// Constants
const BOARD_SIZE: usize = 7;
const BOMB_RANGE: i32 = 2;

#[wasm_bindgen]
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub enum Color {
    GRAY = 0,
    BLUE = 1,
    GREEN = 2,
    ORANGE = 3,
    RED = 4,
    WHITE = 5,
    YELLOW = 6,
}

impl Color {
    fn from_axis(axis_char: char) -> Color {
        match axis_char {
            'F' => Color::BLUE,
            'B' => Color::GREEN,
            'R' => Color::ORANGE,
            'L' => Color::RED,
            'U' => Color::WHITE,
            'D' => Color::YELLOW,
            _ => Color::GRAY,
        }
    }
}

#[derive(Clone, Copy, Debug, Serialize, Deserialize)]
pub struct Tile {
    color: Color,
}

impl Tile {
    fn new() -> Self {
        Tile { color: Color::GRAY }
    }
}

#[wasm_bindgen]
pub struct GameEngine {
    tiles: Vec<Tile>, // Flattened 7x7 board
    score: u32,
    high_score: u32,
    move_left: u32,
    game_over: bool,
    
    // Player State
    player_x: i32,
    player_y: i32,
    axis_state: [char; 6], // U, F, R, B, L, D
    
    // Items
    shift_item: u32,
    bomb_item: u32,
    shift_armed: bool,
}

#[derive(Serialize)]
pub struct PlayerState {
    pub x: i32,
    pub y: i32,
    pub shift: u32,
    pub bomb: u32,
    #[serde(rename = "shiftArmed")]
    pub shift_armed: bool,
}

#[derive(Serialize)]
pub struct GameState {
    pub moves: u32,
    pub score: u32,
    #[serde(rename = "highScore")]
    pub high_score: u32,
    #[serde(rename = "gameOver")]
    pub game_over: bool,
    #[serde(rename = "boardColors")]
    pub board_colors: Vec<u8>,
    pub player: PlayerState,
}

#[wasm_bindgen]
impl GameEngine {
    pub fn new() -> GameEngine {
        let mut engine = GameEngine {
            tiles: vec![Tile::new(); BOARD_SIZE * BOARD_SIZE],
            score: 0,
            high_score: 0,
            move_left: 3,
            game_over: false,
            player_x: 0,
            player_y: 0,
            axis_state: ['U', 'F', 'R', 'B', 'L', 'D'],
            shift_item: 1,
            bomb_item: 1,
            shift_armed: false,
        };
        engine.init_level();
        engine
    }

    pub fn init_level(&mut self) {
        self.tiles.fill(Tile::new());
        self.move_left = 3;
        self.score = 0;
        self.game_over = false;
        
        self.reset_player();
    }

    fn reset_player(&mut self) {
        self.player_x = 0;
        self.player_y = 0;
        self.axis_state = ['U', 'F', 'R', 'B', 'L', 'D'];
        self.shift_item = 1;
        self.bomb_item = 1;
        self.shift_armed = false;
    }

    pub fn get_state(&self) -> JsValue {
        let colors: Vec<u8> = self.tiles.iter().map(|t| t.color as u8).collect();
        
        let state = GameState {
            moves: self.move_left,
            score: self.score,
            high_score: self.high_score,
            game_over: self.game_over,
            board_colors: colors,
            player: PlayerState {
                x: self.player_x,
                y: self.player_y,
                shift: self.shift_item,
                bomb: self.bomb_item,
                shift_armed: self.shift_armed,
            }
        };

        serde_wasm_bindgen::to_value(&state).unwrap()
    }

    pub fn toggle_shift(&mut self) {
        if self.game_over { return; }
        if !self.shift_armed {
            if self.shift_item > 0 {
                self.shift_item -= 1;
                self.shift_armed = true;
            }
        } else {
            self.shift_item += 1;
            self.shift_armed = false;
        }
    }

    pub fn start_move(&mut self, direction: &str) -> bool {
        if self.game_over { return false; }
        let (mut nx, mut ny) = (self.player_x, self.player_y);
        
        match direction {
            "UP" => ny -= 1,
            "DOWN" => ny += 1,
            "LEFT" => nx -= 1,
            "RIGHT" => nx += 1,
            _ => return false,
        }

        if nx < 0 || nx >= BOARD_SIZE as i32 || ny < 0 || ny >= BOARD_SIZE as i32 {
            return false;
        }

        // Apply Move
        self.player_x = nx;
        self.player_y = ny;

        if !self.shift_armed {
            self.rotate_axis(direction);
        } else {
            self.shift_armed = false;
        }
        
        true
    }

    fn rotate_axis(&mut self, direction: &str) {
        let a = &mut self.axis_state;
        // Indexes: 0:U, 1:F, 2:R, 3:B, 4:L, 5:D
        match direction {
            "UP" => {
                let temp = a[0]; a[0] = a[1]; a[1] = a[5]; a[5] = a[3]; a[3] = temp;
            },
            "DOWN" => {
                let temp = a[0]; a[0] = a[3]; a[3] = a[5]; a[5] = a[1]; a[1] = temp;
            },
            "LEFT" => {
                let temp = a[0]; a[0] = a[2]; a[2] = a[5]; a[5] = a[4]; a[4] = temp;
            },
            "RIGHT" => {
                let temp = a[0]; a[0] = a[4]; a[4] = a[5]; a[5] = a[2]; a[2] = temp;
            },
            _ => {}
        }
    }

    pub fn finish_move(&mut self) {
        let idx = (self.player_y * BOARD_SIZE as i32 + self.player_x) as usize;
        let down_face = self.axis_state[5];
        let color = Color::from_axis(down_face);
        
        let mut trigger_check = false;

        {
            let tile = &mut self.tiles[idx];
            
            if tile.color != Color::GRAY {
                if self.move_left > 0 {
                    self.move_left -= 1;
                }
            } else {
                if self.move_left < 3 {
                    self.move_left += 1;
                }
                tile.color = color;
                trigger_check = true;
            }
        } // Drop borrow of self.tiles

        if trigger_check {
            self.check_matches(self.player_x, self.player_y);
        }
        
        self.check_game_over();
    }

    fn check_matches(&mut self, x: i32, y: i32) {
        let idx = (y * BOARD_SIZE as i32 + x) as usize;
        let target_color = self.tiles[idx].color;
        if target_color == Color::GRAY { return; }

        let mut visited = HashSet::new();
        let mut stack = vec![(x, y)];
        let mut group = Vec::new();

        while let Some((cx, cy)) = stack.pop() {
            let key = (cx, cy);
            if visited.contains(&key) { continue; }
            visited.insert(key);

            let c_idx = (cy * BOARD_SIZE as i32 + cx) as usize;
            if self.tiles[c_idx].color != target_color { continue; }
            
            group.push((cx, cy));

            let neighbors = [(0, -1), (0, 1), (-1, 0), (1, 0)];
            for (dx, dy) in neighbors {
                let nx = cx + dx;
                let ny = cy + dy;
                if nx >= 0 && nx < BOARD_SIZE as i32 && ny >= 0 && ny < BOARD_SIZE as i32 {
                    stack.push((nx, ny));
                }
            }
        }

        if group.len() >= 3 {
            for (gx, gy) in &group {
                let g_idx = (gy * BOARD_SIZE as i32 + gx) as usize;
                self.tiles[g_idx].color = Color::GRAY;
            }
            let points = (group.len() * group.len() * 10) as u32;
            self.add_score(points);
        }
    }

    pub fn use_bomb(&mut self) {
        if self.game_over { return; }
        if self.bomb_item > 0 {
            self.bomb_item -= 1;
            self.apply_bomb(self.player_x, self.player_y);
        }
    }

    fn apply_bomb(&mut self, x: i32, y: i32) {
        let mut visited = HashSet::new();
        let mut queue = VecDeque::new();
        queue.push_back((x, y, BOMB_RANGE));
        
        let mut removed_count = 0;

        while let Some((cx, cy, depth)) = queue.pop_front() {
            let key = (cx, cy);
            if visited.contains(&key) { continue; }
            visited.insert(key);

            let idx = (cy * BOARD_SIZE as i32 + cx) as usize;
            if self.tiles[idx].color != Color::GRAY {
                self.tiles[idx].color = Color::GRAY;
                removed_count += 1;
            }

            if depth > 0 {
                let neighbors = [(0, -1), (0, 1), (-1, 0), (1, 0)];
                for (dx, dy) in neighbors {
                    let nx = cx + dx;
                    let ny = cy + dy;
                    if nx >= 0 && nx < BOARD_SIZE as i32 && ny >= 0 && ny < BOARD_SIZE as i32 {
                        queue.push_back((nx, ny, depth - 1));
                    }
                }
            }
        }
        
        if removed_count > 0 {
            self.add_score((removed_count * 10) as u32);
        }
    }

    fn add_score(&mut self, amount: u32) {
        self.score += amount;
        if self.score > self.high_score {
            self.high_score = self.score;
        }
    }

    fn check_game_over(&mut self) {
        let colored_count = self.tiles.iter().filter(|t| t.color != Color::GRAY).count();
        if colored_count == BOARD_SIZE * BOARD_SIZE || self.move_left == 0 {
            self.game_over = true;
        }
    }
    
    pub fn restart(&mut self) {
        self.init_level();
    }
}
