// sprites.js — procedural pixel sprites. Each sprite is an array of strings; each character maps
// to a palette color ('.' = transparent). Everything is drawn through drawSprite(), so a PNG
// sprite sheet can replace this file later without touching scene.js.

export const PALETTE = {
    '.': null,
    k: '#0b0b14',   // outline / black
    b: '#6b3e1e',   // fur brown
    B: '#8a5530',   // fur light
    t: '#e0b08a',   // face tan
    T: '#f3cfae',   // face light
    w: '#ffffff',   // white
    r: '#e04848',   // red
    y: '#ffd23f',   // yellow
    g: '#41c46b',   // green
    c: '#c8a46a',   // cardboard
    C: '#a5824d',   // cardboard dark
    s: '#4b5566',   // steel
    S: '#6c7a90',   // steel light
    p: '#3b3f52',   // belt dark
    P: '#555b73',   // belt light
    u: '#5bb7ff',   // blue accent
};

// 16×16 chimp. Frames share the body; the face rows differ per state.
const BODY_TOP = [
    '................',
    '....kkkkkkkk....',
    '...kbbbbbbbbk...',
    '..kbbBBBBBBbbk..',
    '..kbBkBBBBkBbk..',
];
const BODY_BOTTOM = [
    '..kbbbbbbbbbbk..',
    '...kkbbbbbbkk...',
    '..kbbkkkkkkbbk..',
    '.kbbbkbbbbkbbbk.',
    '.kbkbkbbbbkbkbk.',
    '..kkkkkbbkkkkk..',
    '......kkkk......',
];
const FACES = {
    idle0: ['..kbttkttkkttbk.', '..kbttttttttttk.', '..kbtkttttktttk.', '...ktttkkttttk..'],
    idle1: ['..kbttkttkkttbk.', '..kbttttttttttk.', '..kbtkttttktttk.', '...ktttkkkkttk..'],
    think0: ['..kbttkttkkttbk.', '..kbttttttttttk.', '..kbttkttttkttk.', '...kttttkkkttk..'],
    think1: ['..kbttkttkkttbk.', '..kbttttttttttk.', '..kbttttkttttkk.', '...kttkkkktttk..'],
    write0: ['..kbttkttkkttbk.', '..kbttttttttttk.', '..kbtkttttktttk.', '...kttkkkkkttk..'],
    write1: ['..kbttkttkkttbk.', '..kbttttttttttk.', '..kbtkttttktttk.', '...kttttttttk...'],
    happy: ['..kbttkttkkttbk.', '..kbttttttttttk.', '..kbtkttttktttk.', '...ktkttttktkk..'],
    sad: ['..kbttkttkkttbk.', '..kbttuttttuttk.', '..kbtkttttktttk.', '...ktttkkkkttk..'],
    dead: ['..kbttkttkkttbk.', '..kbttttttttttk.', '..kbkktttkkttk..', '...ktttkkkkttk..'],
};

function chimp(face) {
    return [...BODY_TOP, ...FACES[face], ...BODY_BOTTOM];
}

export const SPRITES = {
    chimp_idle: [chimp('idle0'), chimp('idle1')],
    chimp_think: [chimp('think0'), chimp('think1')],
    chimp_write: [chimp('write0'), chimp('write1')],
    chimp_happy: [chimp('happy')],
    chimp_sad: [chimp('sad')],
    chimp_dead: [chimp('dead')],
    parcel: [[
        '..kkkkkkkkkk..',
        '.kccccCCccccck',
        '.kcccckkccccck',
        '.kCCCCkkCCCCCk',
        '.kcccckkccccck',
        '.kcccckkccccck',
        '.kCCCCkkCCCCCk',
        '..kkkkkkkkkk..',
    ]],
    banana: [[
        '....kk..',
        '...kyyk.',
        '..kyyyk.',
        '.kyyyk..',
        'kyyyk...',
        'kyyk....',
        '.kk.....',
    ]],
    crate_in: [[
        'kkkkkkkkkkkkkkkkkkkk',
        'kSSSSSSSSSSSSSSSSSSk',
        'kSsssssssssssssssssk',
        'kSsuuuuuuuuuuuuuussk',
        'kSsuuuuuuuuuuuuuussk',
        'kSsssssssssssssssssk',
        'kSsssssssssssssssssk',
        'kSsssssssssssssssssk',
        'kSsssssssssssssssssk',
        'kkkkkkkkkkkkkkkkkkkk',
    ]],
    crate_out: [[
        'kkkkkkkkkkkkkkkkkkkk',
        'kSSSSSSSSSSSSSSSSSSk',
        'kSsssssssssssssssssk',
        'kSsyyyyyyyyyyyyyyssk',
        'kSsyyyyyyyyyyyyyyssk',
        'kSsssssssssssssssssk',
        'kSsssssssssssssssssk',
        'kSsssssssssssssssssk',
        'kSsssssssssssssssssk',
        'kkkkkkkkkkkkkkkkkkkk',
    ]],
    belt_tile: [[
        'PPPPpppp',
        'PPPPpppp',
        'kkkkkkkk',
        'ssssssss',
    ]],
    roller: [[
        '.kk.',
        'kSSk',
        'kSsk',
        '.kk.',
    ]],
    paper_blank: [[
        'kkkkkkk',
        'kwwwwwk',
        'kwwSwwk',
        'kwwwSwk',
        'kwwSwwk',
        'kwwwwwk',
        'kwwSwwk',
        'kwwwwwk',
        'kkkkkkk',
    ]],
    paper_written: [[
        'kkkkkkk',
        'kwwwwwk',
        'kwkkkwk',
        'kwwwwwk',
        'kwkkkwk',
        'kwwwwwk',
        'kwkkwwk',
        'kwwwwwk',
        'kkkkkkk',
    ]],
    check: [[
        '.....gg',
        '....gg.',
        'gg.gg..',
        '.ggg...',
        '..g....',
    ]],
    cross: [[
        'r...r',
        '.r.r.',
        '..r..',
        '.r.r.',
        'r...r',
    ]],
};

/** Draw sprite `name` frame `frame` with its top-left at (x, y) in canvas pixels (1 sprite px = 1 canvas px). */
export function drawSprite(ctx, name, frame, x, y) {
    const frames = SPRITES[name];
    if (!frames) return;
    const rows = frames[frame % frames.length];
    for (let j = 0; j < rows.length; j++) {
        const row = rows[j];
        for (let i = 0; i < row.length; i++) {
            const color = PALETTE[row[i]];
            if (!color) continue;
            ctx.fillStyle = color;
            ctx.fillRect(x + i, y + j, 1, 1);
        }
    }
}

export function spriteSize(name) {
    const rows = SPRITES[name]?.[0] ?? [];
    return { w: rows[0]?.length ?? 0, h: rows.length };
}
