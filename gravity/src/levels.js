export const TILE = {
    EMPTY: 0,
    WALL: 1,
    START: 2,
    GEM: 3,
    CORNER_TL: 4, // Top-Left Round
    CORNER_TR: 5, // Top-Right Round
    CORNER_BL: 6, // Bottom-Left Round
    CORNER_BR: 7  // Bottom-Right Round
};

export const LEVELS = [
    {
        width: 10,
        height: 10,
        // Simple test level: A platform with a corner
        // 1 = Wall, 2 = Start, 3 = Gem, 5 = TR Corner
        grid: [
            [1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
            [1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
            [1, 2, 0, 0, 0, 0, 0, 0, 3, 1],
            [1, 1, 1, 1, 5, 0, 0, 0, 1, 1], // TR at (4,3). Walk Right from (3,2).
            [1, 1, 1, 1, 1, 0, 4, 1, 1, 1], // TL at (6,4). Climb Right from (5,4)? No, TL is Top-Left. Climb Right into Left side.
            [1, 1, 1, 1, 1, 1, 1, 1, 1, 1], // Floor at (5,5).
            [1, 1, 1, 1, 1, 1, 0, 0, 1, 1],
            [1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
            [1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
            [1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
        ]
    }
];
