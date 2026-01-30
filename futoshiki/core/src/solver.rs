use crate::sudoku::Grid;
use crate::futoshiki::Inequality;

const ALL_ALLOWED: u16 = 0x1FF;

#[derive(Clone)]
struct State {
    domains: [u16; 81],
}

impl State {
    fn new() -> Self {
        State { domains: [ALL_ALLOWED; 81] }
    }

    fn apply_initial(&mut self, grid: &Grid) -> bool {
        for i in 0..81 {
            if grid[i] > 0 {
                let mask = 1 << (grid[i] - 1);
                if !self.restrict(i, mask) {
                    return false;
                }
            }
        }
        true
    }

    fn restrict(&mut self, idx: usize, mask: u16) -> bool {
        let current = self.domains[idx];
        let new_domain = current & mask;
        if new_domain == current {
            return true;
        }
        if new_domain == 0 {
            return false;
        }
        self.domains[idx] = new_domain;
        true
    }
}

pub fn count_solutions(initial_grid: &Grid, constraints: &[Inequality], limit: usize) -> usize {
    let mut state = State::new();
    if !state.apply_initial(initial_grid) {
        return 0;
    }
    
    // Initial propagation of constraints could ideally happen here, 
    // but we do it inside search for simplicity or pre-process.
    // For pure solving, we rely on forward checking during search.
    
    // Pre-propagate inequalities to prune obviously impossible values
    // (e.g. if A < B, A cannot be 9, B cannot be 1)
    // Repeat until stable? For now, just once or iterative inside solver.
    // Let's do a strong initial propagation loop.
    if !propagate_all(&mut state, constraints) {
        return 0;
    }

    let mut count = 0;
    solve_recursive(&mut state, constraints, &mut count, limit);
    count
}

fn solve_recursive(state: &mut State, constraints: &[Inequality], count: &mut usize, limit: usize) {
    if *count >= limit {
        return;
    }

    // MRV Heuristic
    let mut min_len = 10;
    let mut best_idx = None;

    for i in 0..81 {
        let d = state.domains[i];
        let ones = d.count_ones();
        if ones == 0 { return; } // Should't happen if restrict checks 0
        if ones == 1 { continue; } // Already assigned
        if ones < min_len {
            min_len = ones;
            best_idx = Some(i);
            if ones == 2 { break; } // Optimization
        }
    }

    if let Some(idx) = best_idx {
        let domain = state.domains[idx];
        for val in 1..=9 {
            let mask = 1 << (val - 1);
            if (domain & mask) != 0 {
                let mut next_state = state.clone();
                // Assign val to idx
                if next_state.restrict(idx, mask) {
                    // Propagate
                    if propagate_from(&mut next_state, idx, constraints) {
                        solve_recursive(&mut next_state, constraints, count, limit);
                    }
                }
            }
        }
    } else {
        // All variables assigned. Check constraints one last time? 
        // Forward checking should have guaranteed validity.
        *count += 1;
    }
}

fn propagate_from(state: &mut State, changed_idx: usize, constraints: &[Inequality]) -> bool {
    // Standard Sudoku propagation (Row/Col/Block)
    if !propagate_sudoku(state, changed_idx) {
        return false;
    }
    
    // Inequality propagation 
    // (Opt: only check constraints involving changed_idx and their neighbors iteratively)
    // For safety/simplicity, strict check all might be slow. 
    // Let's do full propagation loop until stable or optimized.
    propagate_all(state, constraints)
}

fn propagate_sudoku(state: &mut State, idx: usize) -> bool {
    let assigned_val = state.domains[idx];
    // Must be single value
    if assigned_val.count_ones() != 1 { return true; } 
    
    let row = idx / 9;
    let col = idx % 9;
    let _blk = (row / 3) * 3 + (col / 3);

    // Eliminate from Row
    for k in 0..9 {
        let target = row * 9 + k;
        if target != idx {
            if !state.restrict(target, !assigned_val) { return false; }
        }
    }
    // Eliminate from Col
    for k in 0..9 {
        let target = k * 9 + col;
        if target != idx {
            if !state.restrict(target, !assigned_val) { return false; }
        }
    }
    // Eliminate from Block
    let start_row = (row / 3) * 3;
    let start_col = (col / 3) * 3;
    for r in 0..3 {
        for c in 0..3 {
            let target = (start_row + r) * 9 + (start_col + c);
            if target != idx {
                if !state.restrict(target, !assigned_val) { return false; }
            }
        }
    }
    true
}

fn propagate_all(state: &mut State, constraints: &[Inequality]) -> bool {
    let mut changed = true;
    while changed {
        changed = false;
        // Check Sudoku singles? (Expensive to loop 81 every time)
        // Assume Sudoku handled by assignment trigger.
        // Focus on Inequalities.
        
        for ineq in constraints {
            let da = state.domains[ineq.a];
            let db = state.domains[ineq.b];

            // Condition: a < b
            // min(a) must be < max(b)
            // max(b) must be > min(a)
            
            let min_a = get_min(da);
            let max_b = get_max(db);
            
            // a < max_b -> a <= max_b - 1
            // Remove values in A >= max_b
            let new_da = filter_lt(da, max_b); 
            if new_da != da {
                if new_da == 0 { return false; }
                state.domains[ineq.a] = new_da;
                changed = true;
            }

            // b > min_a -> b >= min_a + 1
            // Remove values in B <= min_a
            let new_db = filter_gt(db, min_a);
            if new_db != db {
                if new_db == 0 { return false; }
                state.domains[ineq.b] = new_db;
                changed = true;
            }
        }
    }
    true
}

fn get_min(mask: u16) -> u8 {
    mask.trailing_zeros() as u8 + 1
}

fn get_max(mask: u16) -> u8 {
    16 - (mask.leading_zeros() as u8) // 16 bits
}

fn filter_lt(mask: u16, val: u8) -> u16 {
    // Keep values < val
    // (1 << (val-1)) is the bit for val.
    if val <= 1 { return 0; }
    let limit_bit = 1 << (val - 1);
    let keep_mask = limit_bit - 1;
    mask & keep_mask
}

fn filter_gt(mask: u16, val: u8) -> u16 {
    // Keep values > val
    let _limit_bit = 1 << (val - 1); // e.g. val=1 -> bit 0 (1). limit-1=0. mask & ~0 = mask.
    // wait, val=1, keep 2..9. mask > 1.
    // ~( (1<<val) - 1 )
    let remove_mask = (1 << val) - 1;
    mask & !remove_mask
}
