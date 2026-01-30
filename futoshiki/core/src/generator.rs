use crate::sudoku::{self, Grid};
use crate::futoshiki::{self, Puzzle, Inequality};
use crate::solver;
use rand::prelude::*;

pub enum Difficulty {
    Easy,
    Normal,
    Hard,
    Expert,
}

impl Difficulty {
    pub fn from_str(s: &str) -> Self {
        match s {
            "Easy" => Difficulty::Easy,
            "Normal" => Difficulty::Normal,
            "Hard" => Difficulty::Hard,
            "Expert" => Difficulty::Expert,
            _ => Difficulty::Normal,
        }
    }

    pub fn inter_block_keep_ratio(&self) -> f64 {
        match self {
            Difficulty::Easy => 0.6,   // Keep 60% of boundary limits
            Difficulty::Normal => 0.45,
            Difficulty::Hard => 0.3,
            Difficulty::Expert => 0.15, // Keep only 15%
        }
    }
}

pub fn generate(difficulty_str: &str) -> Puzzle {
    let difficulty = Difficulty::from_str(difficulty_str);
    let mut rng = rand::thread_rng();

    // 1. Generate full valid grid
    let full_grid = sudoku::generate_complete_grid();

    // 2. Generate ALL inequalities
    let all_inequalities = futoshiki::generate_from_grid(&full_grid);

    // 3. Separate Fixed (Intra) and Variable (Inter)
    let (fixed, mut variable): (Vec<Inequality>, Vec<Inequality>) = 
        all_inequalities.into_iter().partition(|iq| iq.is_intra_block());

    // 4. Select Variable inequalities based on difficulty
    variable.shuffle(&mut rng);
    let keep_count = (variable.len() as f64 * difficulty.inter_block_keep_ratio()) as usize;
    let selected_variable: Vec<Inequality> = variable.into_iter().take(keep_count).collect();

    let mut constraints = fixed;
    constraints.extend(selected_variable);

    // 5. Verify Uniqueness & Handle "No Number" Rule
    // Start with empty grid (all -1/0)
    let mut puzzle_grid = [0; 81];
    
    // Check uniqueness (Limit 2 to detect ambiguity)
    loop {
        let count = solver::count_solutions(&puzzle_grid, &constraints, 2);
        
        if count == 1 {
            break;
        }

        // AMBIGUOUS: Need to reveal a number
        // Pick an unrevealed cell at random (but from the solution)
        // Optimization: pick one that is currently ambiguous? 
        // For simplicity: random unrevealed.
        let unrevealed: Vec<usize> = (0..81).filter(|&i| puzzle_grid[i] == 0).collect();
        if unrevealed.is_empty() {
             // Should not happen if count != 1 (unless 0 solutions, which implies bug)
             break; 
        }
        
        let &pick = unrevealed.choose(&mut rng).unwrap();
        puzzle_grid[pick] = full_grid[pick];
    }

    // Convert grid to i8 for export (-1 for empty, but we used 0 internally)
    let mut export_grid = [-1; 81];
    for i in 0..81 {
        if puzzle_grid[i] != 0 {
            export_grid[i] = puzzle_grid[i] as i8;
        }
    }

    Puzzle {
        grid: export_grid.to_vec(),
        constraints,
    }
}
