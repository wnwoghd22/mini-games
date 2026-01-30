use rand::prelude::*;

pub type Grid = [u8; 81];

pub fn generate_complete_grid() -> Grid {
    let mut grid = [0; 81];
    let mut rng = rand::thread_rng();
    
    // We can use a more optimized solver, but for 9x9 generation from scratch,
    // simple backtracking with randomization is fast enough.
    assert!(fill_grid(&mut grid, 0, &mut rng));
    grid
}

fn fill_grid(grid: &mut Grid, idx: usize, rng: &mut ThreadRng) -> bool {
    if idx >= 81 {
        return true;
    }

    let row = idx / 9;
    let col = idx % 9;
    let _blk = (row / 3) * 3 + (col / 3);

    // Find valid numbers
    let mut candidates = [true; 10]; // 1..9
    
    // Check Row & Col (optimization: check only previous cells)
    for k in 0..9 {
        let r_val = grid[row * 9 + k];
        if r_val != 0 { candidates[r_val as usize] = false; }
        
        let c_val = grid[k * 9 + col];
        if c_val != 0 { candidates[c_val as usize] = false; }
    }

    // Check Block
    let start_row = (row / 3) * 3;
    let start_col = (col / 3) * 3;
    for r in 0..3 {
        for c in 0..3 {
            let val = grid[(start_row + r) * 9 + (start_col + c)];
            if val != 0 { candidates[val as usize] = false; }
        }
    }

    // Collect valid numbers
    let mut valid_nums: Vec<u8> = (1..=9).filter(|&n| candidates[n as usize]).collect();
    if valid_nums.is_empty() {
        return false;
    }

    // Shuffle for randomness
    valid_nums.shuffle(rng);

    for num in valid_nums {
        grid[idx] = num;
        if fill_grid(grid, idx + 1, rng) {
            return true;
        }
        grid[idx] = 0;
    }

    false
}
