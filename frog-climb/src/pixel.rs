use bevy::asset::RenderAssetUsages;
use bevy::prelude::*;
use bevy::render::render_resource::{Extent3d, TextureDimension, TextureFormat};

pub const GREEN: [u8; 4] = [118, 214, 133, 255];
pub const GOLD: [u8; 4] = [255, 217, 111, 255];
pub const AQUA: [u8; 4] = [126, 222, 225, 255];
pub const WHITE: [u8; 4] = [231, 241, 213, 255];
pub const MUTED: [u8; 4] = [107, 143, 160, 255];

#[derive(Resource)]
pub struct Art {
    pub frogs: Vec<Handle<Image>>,
    pub orb: Handle<Image>,
    pub grip: Handle<Image>,
    pub leaf: Handle<Image>,
    pub solid: Vec<Handle<Image>>,
    pub fragile: Vec<Handle<Image>>,
    pub floor: Handle<Image>,
    pub white_pixel: Handle<Image>,
    pub green_pixel: Handle<Image>,
    pub gold_pixel: Handle<Image>,
    pub glyphs: std::collections::HashMap<char, Handle<Image>>,
}

fn image(rows: &[&str], ink: [u8; 4]) -> Image {
    let h = rows.len();
    let w = rows[0].len();
    let mut pixels = Vec::with_capacity(w * h * 4);
    for row in rows {
        assert_eq!(row.len(), w);
        for c in row.bytes() {
            let rgba = match c {
                b'#' => [24, 48, 52, 255],
                b'g' => GREEN,
                b'l' => [181, 238, 151, 255],
                b'd' => [60, 127, 100, 255],
                b'w' => WHITE,
                b'y' => GOLD,
                b'b' => AQUA,
                b's' => [67, 101, 117, 255],
                b't' => [179, 121, 102, 255],
                b'r' => [236, 168, 117, 255],
                b'*' => ink,
                _ => [0, 0, 0, 0],
            };
            pixels.extend_from_slice(&rgba);
        }
    }
    Image::new(
        Extent3d {
            width: w as u32,
            height: h as u32,
            depth_or_array_layers: 1,
        },
        TextureDimension::D2,
        pixels,
        TextureFormat::Rgba8UnormSrgb,
        RenderAssetUsages::default(),
    )
}

fn platform(images: &mut Assets<Image>, width: usize, fragile: bool) -> Handle<Image> {
    let mut rows = Vec::new();
    for y in 0..8 {
        let row: String = (0..width)
            .map(|x| {
                if y == 0 {
                    if fragile { 'r' } else { 'l' }
                } else if y == 1 {
                    if fragile { 't' } else { 'g' }
                } else if x == 0 || x == width - 1 || y == 7 {
                    '#'
                } else if fragile && (x + y * 2) % 13 == 0 {
                    '#'
                } else if (x + y * 3) % 11 == 0 {
                    if fragile { 'r' } else { 's' }
                } else if fragile {
                    't'
                } else {
                    'd'
                }
            })
            .collect();
        rows.push(row);
    }
    images.add(image(
        &rows.iter().map(String::as_str).collect::<Vec<_>>(),
        WHITE,
    ))
}

impl Art {
    pub fn new(images: &mut Assets<Image>) -> Self {
        let resting = [
            "................",
            "...###....###...",
            "..#www#..#www#..",
            "..#w#w####w#w#..",
            "..#gggllllggg#..",
            ".#ggllllllgggg#.",
            ".#gllllllllggg#.",
            ".#gg##gggg##gg#.",
            "..#ggg####ggg#..",
            "..#ggllwwllgg#..",
            ".#dgllwwwwllgd#.",
            "#ggdggggggggdgg#",
            "#lldggggggggdll#",
            ".##d########d##.",
            "..###......###..",
            "................",
        ];
        let jumping = [
            "................",
            "...###....###...",
            "..#www#..#www#..",
            "..#w#w####w#w#..",
            "..#gggllllggg#..",
            "..#gllllllggg#..",
            "..#gllllllllg#..",
            "...#g######g#...",
            "..#ggllwwllgg#..",
            ".#ggllwwwwllgg#.",
            ".#gdggggggggdg#.",
            "..#d########d#..",
            "..#gg#....#gg#..",
            ".#gl#......#lg#.",
            "#ll#........#ll#",
            ".##..........##.",
        ];
        let crouching = [
            "................",
            "................",
            "................",
            "...###....###...",
            "..#www#..#www#..",
            "..#w#w####w#w#..",
            "..#gggllllggg#..",
            ".#ggllllllllgg#.",
            ".#gg##gggg##gg#.",
            ".#gggg####gggg#.",
            "..#gllwwwwllg#..",
            ".#dgllwwwwllgd#.",
            "#lldggggggggdll#",
            "#lld########dll#",
            ".###........###.",
            "................",
        ];
        let glyphs = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789 :+-./!<>"
            .chars()
            .map(|c| (c, images.add(image(&glyph(c), WHITE))))
            .collect();
        Self {
            frogs: vec![
                images.add(image(&resting, WHITE)),
                images.add(image(&jumping, WHITE)),
                images.add(image(&crouching, WHITE)),
            ],
            orb: images.add(image(
                &[
                    "...y...", "..yly..", ".ylwly.", "ylwwwly", ".ylwly.", "..yly..", "...y...",
                ],
                WHITE,
            )),
            grip: images.add(image(
                &[
                    "....bb....",
                    "...bwwb...",
                    "..bw..wb..",
                    ".bw....wb.",
                    "bw......wb",
                    "bw......wb",
                    ".bw....wb.",
                    "..bw..wb..",
                    "...bwwb...",
                    "....bb....",
                ],
                WHITE,
            )),
            leaf: images.add(image(
                &[
                    ".....d..", "..gggld.", ".ggllld.", "ggllld..", "gllld...", ".dd.....",
                ],
                WHITE,
            )),
            solid: (0..5)
                .map(|i| platform(images, 48 + i * 8, false))
                .collect(),
            fragile: (0..5).map(|i| platform(images, 48 + i * 8, true)).collect(),
            floor: platform(images, 320, false),
            white_pixel: images.add(image(&["*"], WHITE)),
            green_pixel: images.add(image(&["*"], GREEN)),
            gold_pixel: images.add(image(&["*"], GOLD)),
            glyphs,
        }
    }
}

fn glyph(c: char) -> [&'static str; 5] {
    match c {
        'A' => [".*.", "*.*", "***", "*.*", "*.*"],
        'B' => ["**.", "*.*", "**.", "*.*", "**."],
        'C' => [".**", "*..", "*..", "*..", ".**"],
        'D' => ["**.", "*.*", "*.*", "*.*", "**."],
        'E' => ["***", "*..", "**.", "*..", "***"],
        'F' => ["***", "*..", "**.", "*..", "*.."],
        'G' => [".**", "*..", "*.*", "*.*", ".**"],
        'H' => ["*.*", "*.*", "***", "*.*", "*.*"],
        'I' => ["***", ".*.", ".*.", ".*.", "***"],
        'J' => ["..*", "..*", "..*", "*.*", ".*."],
        'K' => ["*.*", "*.*", "**.", "*.*", "*.*"],
        'L' => ["*..", "*..", "*..", "*..", "***"],
        'M' => ["*.*", "***", "***", "*.*", "*.*"],
        'N' => ["*.*", "***", "***", "***", "*.*"],
        'O' => [".*.", "*.*", "*.*", "*.*", ".*."],
        'P' => ["**.", "*.*", "**.", "*..", "*.."],
        'Q' => [".*.", "*.*", "*.*", "***", "..*"],
        'R' => ["**.", "*.*", "**.", "*.*", "*.*"],
        'S' => [".**", "*..", ".*.", "..*", "**."],
        'T' => ["***", ".*.", ".*.", ".*.", ".*."],
        'U' => ["*.*", "*.*", "*.*", "*.*", "***"],
        'V' => ["*.*", "*.*", "*.*", "*.*", ".*."],
        'W' => ["*.*", "*.*", "***", "***", "*.*"],
        'X' => ["*.*", "*.*", ".*.", "*.*", "*.*"],
        'Y' => ["*.*", "*.*", ".*.", ".*.", ".*."],
        'Z' => ["***", "..*", ".*.", "*..", "***"],
        '0' => ["***", "*.*", "*.*", "*.*", "***"],
        '1' => [".*.", "**.", ".*.", ".*.", "***"],
        '2' => ["**.", "..*", ".*.", "*..", "***"],
        '3' => ["**.", "..*", ".*.", "..*", "**."],
        '4' => ["*.*", "*.*", "***", "..*", "..*"],
        '5' => ["***", "*..", "**.", "..*", "**."],
        '6' => [".**", "*..", "***", "*.*", "***"],
        '7' => ["***", "..*", ".*.", ".*.", ".*."],
        '8' => ["***", "*.*", "***", "*.*", "***"],
        '9' => ["***", "*.*", "***", "..*", "**."],
        ':' => ["...", ".*.", "...", ".*.", "..."],
        '+' => ["...", ".*.", "***", ".*.", "..."],
        '-' => ["...", "...", "***", "...", "..."],
        '.' => ["...", "...", "...", "...", ".*."],
        '/' => ["..*", "..*", ".*.", "*..", "*.."],
        '!' => [".*.", ".*.", ".*.", "...", ".*."],
        '<' => ["..*", ".*.", "*..", ".*.", "..*"],
        '>' => ["*..", ".*.", "..*", ".*.", "*.."],
        _ => ["..."; 5],
    }
}
