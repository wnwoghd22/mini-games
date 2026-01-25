mod generator;
mod types;

use generator::MapGenerator;
use wasm_bindgen::prelude::*;

#[wasm_bindgen]
pub struct WasmMapGenerator {
    generator: MapGenerator,
}

#[wasm_bindgen]
impl WasmMapGenerator {
    #[wasm_bindgen(constructor)]
    pub fn new(seed: u64, difficulty: f32) -> Self {
        // Set panic hook for better error messages in browser console
        #[cfg(feature = "console_error_panic_hook")]
        console_error_panic_hook::set_once();

        Self {
            generator: MapGenerator::new(seed, difficulty),
        }
    }

    #[wasm_bindgen(js_name = generateChunk)]
    pub fn generate_chunk(&mut self, start_y: i32) -> JsValue {
        let chunk = self.generator.generate_chunk(start_y);
        serde_wasm_bindgen::to_value(&chunk).unwrap()
    }

    #[wasm_bindgen(js_name = setDifficulty)]
    pub fn set_difficulty(&mut self, difficulty: f32) {
        self.generator.set_difficulty(difficulty);
    }
}

// Test function to verify WASM is working
#[wasm_bindgen]
pub fn test_wasm() -> String {
    "WASM module loaded successfully!".to_string()
}
