/* tslint:disable */
/* eslint-disable */

export enum Color {
    GRAY = 0,
    BLUE = 1,
    GREEN = 2,
    ORANGE = 3,
    RED = 4,
    WHITE = 5,
    YELLOW = 6,
}

export class GameEngine {
    private constructor();
    free(): void;
    [Symbol.dispose](): void;
    finish_move(): void;
    get_state(): any;
    init_level(): void;
    static new(): GameEngine;
    restart(): void;
    start_move(direction: string): boolean;
    toggle_shift(): void;
    use_bomb(): void;
}

export type InitInput = RequestInfo | URL | Response | BufferSource | WebAssembly.Module;

export interface InitOutput {
    readonly memory: WebAssembly.Memory;
    readonly __wbg_gameengine_free: (a: number, b: number) => void;
    readonly gameengine_new: () => number;
    readonly gameengine_init_level: (a: number) => void;
    readonly gameengine_get_state: (a: number) => any;
    readonly gameengine_toggle_shift: (a: number) => void;
    readonly gameengine_start_move: (a: number, b: number, c: number) => number;
    readonly gameengine_finish_move: (a: number) => void;
    readonly gameengine_use_bomb: (a: number) => void;
    readonly gameengine_restart: (a: number) => void;
    readonly __wbindgen_malloc: (a: number, b: number) => number;
    readonly __wbindgen_realloc: (a: number, b: number, c: number, d: number) => number;
    readonly __wbindgen_externrefs: WebAssembly.Table;
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
