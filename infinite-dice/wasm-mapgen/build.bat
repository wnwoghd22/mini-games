@echo off
echo Building WASM module...
wasm-pack build --target web --out-dir pkg
echo Build complete!
