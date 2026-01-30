use serde::{Serialize, Deserialize};
use crate::sudoku::Grid;

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
pub struct Inequality {
    pub a: usize, // index 0-80
    pub b: usize, // index 0-80
    // dir is redundant if we always store such that constraint is a < b, 
    // but useful for UI or if we want to scramble order. 
    // Let's standard: "value[a] < value[b]"
    // If input grid has value[a] > value[b], we swap a and b.
}

impl Inequality {
    pub fn is_intra_block(&self) -> bool {
        let (r_a, c_a) = (self.a / 9, self.a % 9);
        let (r_b, c_b) = (self.b / 9, self.b % 9);
        
        let blk_a = (r_a / 3) * 3 + (c_a / 3);
        let blk_b = (r_b / 3) * 3 + (c_b / 3);
        
        blk_a == blk_b
    }
}

#[derive(Serialize, Deserialize)]
pub struct Puzzle {
    pub grid: Vec<i8>, // Initial numbers. -1 for empty.
    pub constraints: Vec<Inequality>,
}

/// Generates all valid inequality constraints for the given grid.
/// Always generates 'a < b' form.
pub fn generate_from_grid(grid: &Grid) -> Vec<Inequality> {
    let mut constraints = Vec::new();

    // Check horizontal neighbors (i, i+1)
    for row in 0..9 {
        for col in 0..8 {
            let idx_a = row * 9 + col;
            let idx_b = row * 9 + col + 1;
            let val_a = grid[idx_a];
            let val_b = grid[idx_b];
            
            if val_a < val_b {
                constraints.push(Inequality { a: idx_a, b: idx_b });
            } else {
                constraints.push(Inequality { a: idx_b, b: idx_a });
            }
        }
    }

    // Check vertical neighbors (i, i+9)
    for row in 0..8 {
        for col in 0..9 {
            let idx_a = row * 9 + col;
            let idx_b = (row + 1) * 9 + col;
            let val_a = grid[idx_a];
            let val_b = grid[idx_b];

            if val_a < val_b {
                constraints.push(Inequality { a: idx_a, b: idx_b });
            } else {
                constraints.push(Inequality { a: idx_b, b: idx_a });
            }
        }
    }

    constraints
}
