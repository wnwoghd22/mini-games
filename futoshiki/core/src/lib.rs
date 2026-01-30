mod sudoku;
mod futoshiki;
mod solver;
mod generator;

use wasm_bindgen::prelude::*;

#[wasm_bindgen]
pub fn generate_puzzle(difficulty: &str) -> JsValue {
    // Placeholder
    let puzzle = generator::generate(difficulty);
    serde_wasm_bindgen::to_value(&puzzle).unwrap()
}
