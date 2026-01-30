use crate::sudoku;
use crate::futoshiki::{self, Puzzle, Inequality};
use crate::solver;
use rand::prelude::*;

pub enum Difficulty {
    Easy,
    Normal,
    Hard,
    Expert,
    Classic,  // 블록 내 부등호만, 숫자 힌트 없음
}

impl Difficulty {
    pub fn from_str(s: &str) -> Self {
        match s {
            "Easy" => Difficulty::Easy,
            "Normal" => Difficulty::Normal,
            "Hard" => Difficulty::Hard,
            "Expert" => Difficulty::Expert,
            "Classic" => Difficulty::Classic,
            _ => Difficulty::Normal,
        }
    }

    /// 블록 간 부등호 유지 비율
    pub fn inter_block_keep_ratio(&self) -> f64 {
        match self {
            Difficulty::Easy => 0.7,
            Difficulty::Normal => 0.5,
            Difficulty::Hard => 0.35,
            Difficulty::Expert => 0.2,
            Difficulty::Classic => 1.0,  // 모든 부등호 제공 (숫자 힌트 없음)
        }
    }

    /// 허용되는 힌트 수 범위 (min, max)
    pub fn hint_range(&self) -> (usize, usize) {
        match self {
            Difficulty::Easy => (30, 40),
            Difficulty::Normal => (23, 29),
            Difficulty::Hard => (16, 22),
            Difficulty::Expert => (8, 15),
            Difficulty::Classic => (0, 0),  // 숫자 힌트 없음
        }
    }

    /// 초기에 무조건 공개할 셀 수
    pub fn initial_reveals(&self) -> usize {
        match self {
            Difficulty::Easy => 20,
            Difficulty::Normal => 12,
            Difficulty::Hard => 6,
            Difficulty::Expert => 0,
            Difficulty::Classic => 0,
        }
    }
}

const MAX_ATTEMPTS: usize = 50;
const CLASSIC_MAX_ATTEMPTS: usize = 1000;  // Classic은 더 많은 시도 필요

pub fn generate(difficulty_str: &str) -> Puzzle {
    let difficulty = Difficulty::from_str(difficulty_str);
    let (min_hints, max_hints) = difficulty.hint_range();
    let initial_reveals = difficulty.initial_reveals();
    let mut rng = rand::thread_rng();

    let max_tries = match difficulty {
        Difficulty::Classic => CLASSIC_MAX_ATTEMPTS,
        _ => MAX_ATTEMPTS,
    };

    for _ in 0..max_tries {
        if let Some(puzzle) = try_generate(&difficulty, min_hints, max_hints, initial_reveals, &mut rng) {
            return puzzle;
        }
    }

    // Fallback: Classic은 fallback 없이 panic (유일 해 필수)
    match difficulty {
        Difficulty::Classic => panic!("Failed to generate Classic puzzle with unique solution"),
        _ => try_generate(&difficulty, 0, 81, initial_reveals, &mut rng)
            .expect("Failed to generate puzzle"),
    }
}

fn try_generate(
    difficulty: &Difficulty,
    min_hints: usize,
    max_hints: usize,
    initial_reveals: usize,
    rng: &mut impl Rng,
) -> Option<Puzzle> {
    // 1. Generate full valid grid
    let full_grid = sudoku::generate_complete_grid();

    // 2. Generate ALL inequalities
    let all_inequalities = futoshiki::generate_from_grid(&full_grid);

    // 3. Separate Fixed (Intra) and Variable (Inter)
    let (fixed, mut variable): (Vec<Inequality>, Vec<Inequality>) =
        all_inequalities.into_iter().partition(|iq| iq.is_intra_block());

    // 4. Select Variable inequalities based on difficulty
    variable.shuffle(rng);
    let keep_count = (variable.len() as f64 * difficulty.inter_block_keep_ratio()) as usize;
    let selected_variable: Vec<Inequality> = variable.into_iter().take(keep_count).collect();

    let mut constraints = fixed;
    constraints.extend(selected_variable);

    // 5. 초기 힌트 배치: 난이도별 초기 공개 수만큼 먼저 공개
    let mut puzzle_grid = [0u8; 81];
    let mut indices: Vec<usize> = (0..81).collect();
    indices.shuffle(rng);

    for &idx in indices.iter().take(initial_reveals) {
        puzzle_grid[idx] = full_grid[idx];
    }

    // 6. 유일 해가 될 때까지 추가 공개
    loop {
        let hint_count = puzzle_grid.iter().filter(|&&x| x != 0).count();

        // 최대 힌트 수 초과 시 이 퍼즐 포기
        if hint_count > max_hints {
            return None;
        }

        let count = solver::count_solutions(&puzzle_grid, &constraints, 2);

        if count == 1 {
            // 유일 해 발견 - 힌트 수가 범위 내인지 확인
            if hint_count >= min_hints {
                break;
            }
            // 최소 힌트 미만이면 수락 (더 어려운 퍼즐은 허용)
            break;
        }

        if count == 0 {
            // 해가 없음 - 버그 또는 잘못된 제약
            return None;
        }

        // 다중 해: 추가 셀 공개
        let unrevealed: Vec<usize> = (0..81).filter(|&i| puzzle_grid[i] == 0).collect();
        if unrevealed.is_empty() {
            break;
        }

        let &pick = unrevealed.choose(rng).unwrap();
        puzzle_grid[pick] = full_grid[pick];
    }

    // 7. 최종 힌트 수 검증
    let final_hint_count = puzzle_grid.iter().filter(|&&x| x != 0).count();
    if final_hint_count < min_hints || final_hint_count > max_hints {
        return None;
    }

    // Convert grid to i8 for export
    let mut export_grid = [-1i8; 81];
    for i in 0..81 {
        if puzzle_grid[i] != 0 {
            export_grid[i] = puzzle_grid[i] as i8;
        }
    }

    Some(Puzzle {
        grid: export_grid.to_vec(),
        constraints,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    fn count_hints(puzzle: &Puzzle) -> usize {
        puzzle.grid.iter().filter(|&&x| x != -1).count()
    }

    #[test]
    fn test_easy_hint_range() {
        let (min, max) = Difficulty::Easy.hint_range();
        for _ in 0..5 {
            let puzzle = generate("Easy");
            let hints = count_hints(&puzzle);
            assert!(hints >= min && hints <= max,
                "Easy: hints={} not in range [{}, {}]", hints, min, max);
        }
    }

    #[test]
    fn test_normal_hint_range() {
        let (min, max) = Difficulty::Normal.hint_range();
        for _ in 0..5 {
            let puzzle = generate("Normal");
            let hints = count_hints(&puzzle);
            assert!(hints >= min && hints <= max,
                "Normal: hints={} not in range [{}, {}]", hints, min, max);
        }
    }

    #[test]
    fn test_hard_hint_range() {
        let (min, max) = Difficulty::Hard.hint_range();
        for _ in 0..5 {
            let puzzle = generate("Hard");
            let hints = count_hints(&puzzle);
            assert!(hints >= min && hints <= max,
                "Hard: hints={} not in range [{}, {}]", hints, min, max);
        }
    }

    #[test]
    fn test_expert_hint_range() {
        let (min, max) = Difficulty::Expert.hint_range();
        for _ in 0..5 {
            let puzzle = generate("Expert");
            let hints = count_hints(&puzzle);
            assert!(hints >= min && hints <= max,
                "Expert: hints={} not in range [{}, {}]", hints, min, max);
        }
    }

    #[test]
    fn test_difficulty_ranges_no_overlap() {
        // 난이도 간 범위가 겹치지 않는지 확인
        let easy = Difficulty::Easy.hint_range();
        let normal = Difficulty::Normal.hint_range();
        let hard = Difficulty::Hard.hint_range();
        let expert = Difficulty::Expert.hint_range();

        assert!(easy.0 > normal.1, "Easy and Normal ranges overlap");
        assert!(normal.0 > hard.1, "Normal and Hard ranges overlap");
        assert!(hard.0 > expert.1, "Hard and Expert ranges overlap");
    }

    #[test]
    fn test_classic_no_hints() {
        // Classic: 숫자 힌트 0개, 최소한의 블록 간 부등호
        for _ in 0..3 {
            let puzzle = generate("Classic");
            let hints = count_hints(&puzzle);
            assert_eq!(hints, 0, "Classic should have 0 hints, got {}", hints);

            // 블록 간 부등호 비율 확인 (8% 이하)
            let inter_count = puzzle.constraints.iter()
                .filter(|iq| !iq.is_intra_block())
                .count();
            let total_inter = 72;  // 최대 블록 간 부등호 수
            let ratio = inter_count as f64 / total_inter as f64;
            assert!(ratio <= 1.0, "Classic inter-block ratio too high: {:.2}", ratio);
        }
    }

    #[test]
    fn test_hint_distribution() {
        // 각 난이도별 20개 샘플 생성하여 분포 확인
        for (name, difficulty_str) in [("Easy", "Easy"), ("Normal", "Normal"), ("Hard", "Hard"), ("Expert", "Expert")] {
            let (min, max) = Difficulty::from_str(difficulty_str).hint_range();
            let mut all_hints: Vec<usize> = Vec::new();
            let mut out_of_range = 0;

            for _ in 0..20 {
                let puzzle = generate(difficulty_str);
                let hints = count_hints(&puzzle);
                all_hints.push(hints);
                if hints < min || hints > max {
                    out_of_range += 1;
                }
            }

            let avg: f64 = all_hints.iter().sum::<usize>() as f64 / all_hints.len() as f64;
            let min_h = *all_hints.iter().min().unwrap();
            let max_h = *all_hints.iter().max().unwrap();

            println!("{}: range=[{}, {}], actual=[{}, {}], avg={:.1}, out_of_range={}/20",
                name, min, max, min_h, max_h, avg, out_of_range);

            assert_eq!(out_of_range, 0,
                "{}: {} puzzles out of range [{}, {}], actual range [{}, {}]",
                name, out_of_range, min, max, min_h, max_h);
        }
    }
}
