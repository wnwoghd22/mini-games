/* tslint:disable */
/* eslint-disable */

export enum TileType {
    Normal = 0,
    Bonus = 1,
    Conditional = 2,
    Teleport = 3,
    Lock = 4,
}

export class WasmMapGenerator {
    free(): void;
    [Symbol.dispose](): void;
    generateChunk(start_y: number): any;
    constructor(seed: bigint, difficulty: number);
    setDifficulty(difficulty: number): void;
}

export function test_wasm(): string;

export type InitInput = RequestInfo | URL | Response | BufferSource | WebAssembly.Module;

export interface InitOutput {
    readonly memory: WebAssembly.Memory;
    readonly __wbg_wasmmapgenerator_free: (a: number, b: number) => void;
    readonly wasmmapgenerator_new: (a: bigint, b: number) => number;
    readonly wasmmapgenerator_generateChunk: (a: number, b: number) => any;
    readonly wasmmapgenerator_setDifficulty: (a: number, b: number) => void;
    readonly test_wasm: () => [number, number];
    readonly __wbindgen_malloc: (a: number, b: number) => number;
    readonly __wbindgen_realloc: (a: number, b: number, c: number, d: number) => number;
    readonly __wbindgen_externrefs: WebAssembly.Table;
    readonly __wbindgen_free: (a: number, b: number, c: number) => void;
    readonly __wbindgen_start: () => void;
}

export type SyncInitInput = BufferSource | WebAssembly.Module;

/**
 * Instantiates the given `module`, which can either be bytes or
 * a precompiled `WebAssembly.Module`.
 *
 * @param {{ module: SyncInitInput }} module - Passing `SyncInitInput` directly is deprecated.
 *
 * @returns {InitOutput}
 */
export function initSync(module: { module: SyncInitInput } | SyncInitInput): InitOutput;

/**
 * If `module_or_path` is {RequestInfo} or {URL}, makes a request and
 * for everything else, calls `WebAssembly.instantiate` directly.
 *
 * @param {{ module_or_path: InitInput | Promise<InitInput> }} module_or_path - Passing `InitInput` directly is deprecated.
 *
 * @returns {Promise<InitOutput>}
 */
export default function __wbg_init (module_or_path?: { module_or_path: InitInput | Promise<InitInput> } | InitInput | Promise<InitInput>): Promise<InitOutput>;
