//! Speech balloons built from a scene file's `balloon` child. Once a balloon is on the page it
//! stays there; nothing despawns it except a scene reload.
//!
//! Shapes mirror `editor/media/balloon.ts`: `speech` is an oval with a pointer, `shout` a
//! jagged star, `thought` a scalloped cloud trailing three bubbles toward the tail.

use crate::{
    art::{Art, INK, PAPER},
    polygon::polygon_mesh,
    scene_file::BalloonDef,
};
use bevy::{prelude::*, sprite_render::AlphaMode2d, text::TextBounds};

pub const LETTERS_PER_SECOND: f32 = 36.0;
/// How far a tail may extend past the balloon rim.
pub const TAIL_LENGTH: f32 = 90.0;
/// Default text size: the same as the cut labels in the editor.
pub const DEFAULT_FONT: f32 = 13.0;
pub const MIN_FONT: f32 = 8.0;
/// Fraction of the balloon's width/height the text box may use (inscribed in the oval).
pub const TEXT_AREA: f32 = 0.7;

/// Average glyph width and line height as fractions of the font size (Anime Ace, caps).
const GLYPH_W: f32 = 0.62;
const LINE_H: f32 = 1.3;

/// The text box inside a balloon of `size`.
pub fn text_box(size: Vec2) -> Vec2 {
    size * TEXT_AREA
}

/// Largest font size (<= `preferred`, >= MIN_FONT) at which `text` fits `text_box` when
/// wrapped by words; the estimate uses average glyph metrics, matching the editor preview.
pub fn fit_font(text: &str, preferred: f32, text_box: Vec2) -> f32 {
    let mut font = preferred.max(MIN_FONT);
    loop {
        if fits(text, font, text_box) || font <= MIN_FONT {
            return font;
        }
        font = (font - 0.5).max(MIN_FONT);
    }
}

fn fits(text: &str, font: f32, text_box: Vec2) -> bool {
    let max_chars = (text_box.x / (font * GLYPH_W)).floor().max(1.0) as usize;
    let mut lines = 0usize;
    for paragraph in text.split('\n') {
        // Greedy word wrap.
        let mut width = 0usize;
        let mut count = 1usize;
        for word in paragraph.split_whitespace() {
            let w = word.chars().count();
            if w > max_chars {
                return false;
            }
            let needed = if width == 0 { w } else { width + 1 + w };
            if needed > max_chars {
                count += 1;
                width = w;
            } else {
                width = needed;
            }
        }
        lines += count;
    }
    lines as f32 * font * LINE_H <= text_box.y
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Default)]
pub enum BalloonKind {
    #[default]
    Speech,
    Shout,
    Thought,
}

impl BalloonKind {
    pub fn parse(text: Option<&str>) -> Self {
        match text {
            Some("shout") => Self::Shout,
            Some("thought") => Self::Thought,
            _ => Self::Speech,
        }
    }
}

/// The scene-file id of a spawned balloon, so a repeated `say` can find it instead of
/// spawning it again.
#[derive(Component, Debug, Clone, PartialEq, Eq)]
pub struct BalloonId(pub String);

#[derive(Component, Debug)]
pub struct SpeechBalloon {
    pub full: String,
    pub letters: f32,
    pub kind: BalloonKind,
    pub size: Vec2,
    /// Direction the tail points at, relative to the centre; `None` for no tail.
    pub tail: Option<Vec2>,
    /// Body outline in balloon-local space, for the ink pass.
    pub outline: Vec<Vec2>,
    pub text_entity: Entity,
}

impl SpeechBalloon {
    pub fn finished(&self) -> bool {
        self.letters as usize >= self.full.chars().count()
    }

    pub fn reveal(&mut self) {
        self.letters = self.full.chars().count() as f32;
    }

    pub fn visible_text(&self) -> String {
        self.full.chars().take(self.letters as usize).collect()
    }
}

/// Body outline in local space (centre at the origin), matching the editor.
pub fn outline(kind: BalloonKind, size: Vec2) -> Vec<Vec2> {
    let (rx, ry) = (size.x / 2.0, size.y / 2.0);
    match kind {
        BalloonKind::Shout => {
            let spikes = (((rx + ry) / 14.0).round() as usize).max(10);
            (0..spikes * 2)
                .map(|i| {
                    let a = i as f32 / (spikes * 2) as f32 * std::f32::consts::TAU;
                    let r = if i % 2 == 0 { 1.0 } else { 0.78 };
                    Vec2::new(a.cos() * rx * r, a.sin() * ry * r)
                })
                .collect()
        }
        _ => {
            let n = 96;
            let bumps = (((rx + ry) / 28.0).round() as usize).max(6) as f32;
            (0..n)
                .map(|i| {
                    let a = i as f32 / n as f32 * std::f32::consts::TAU;
                    let r = if kind == BalloonKind::Thought {
                        let phase = (a * bumps / std::f32::consts::TAU).fract();
                        0.9 + 0.1 * (1.0 - (phase * 2.0 - 1.0).powi(2)).max(0.0).sqrt()
                    } else {
                        1.0
                    };
                    Vec2::new(a.cos() * rx * r, a.sin() * ry * r)
                })
                .collect()
        }
    }
}

fn direction(towards: Vec2) -> Vec2 {
    towards.normalize_or(Vec2::NEG_Y)
}

/// Tail tip: points toward `towards` but reaches at most [`TAIL_LENGTH`] past the rim.
pub fn tail_tip(size: Vec2, towards: Vec2) -> Vec2 {
    let dir = direction(towards);
    let angle = dir.y.atan2(dir.x);
    let rim = Vec2::new(angle.cos() * size.x * 0.5, angle.sin() * size.y * 0.5);
    let reach = (towards.length() - rim.length()).clamp(20.0, TAIL_LENGTH);
    rim + dir * reach
}

/// Two points on the rim either side of the tail direction (the pointer's base).
pub fn tail_base(size: Vec2, towards: Vec2) -> (Vec2, Vec2) {
    let dir = direction(towards);
    let angle = dir.y.atan2(dir.x);
    let spread = 0.28;
    let rim = |a: f32| Vec2::new(a.cos() * size.x * 0.46, a.sin() * size.y * 0.46);
    (rim(angle - spread), rim(angle + spread))
}

/// Thought balloons trail three shrinking bubbles toward the tail tip.
pub fn thought_bubbles(size: Vec2, towards: Vec2) -> Vec<(Vec2, f32)> {
    let tip = tail_tip(size, towards);
    let dir = direction(towards);
    let angle = dir.y.atan2(dir.x);
    let rim = Vec2::new(angle.cos() * size.x * 0.5, angle.sin() * size.y * 0.5);
    let base = size.x.min(size.y) * 0.09;
    (0..3)
        .map(|i| {
            let t = (i as f32 + 1.0) / 3.5;
            (rim.lerp(tip, t), base * (1.0 - i as f32 * 0.28))
        })
        .collect()
}

/// Spawns a balloon from its scene definition. `text` is the dialogue body.
#[allow(clippy::too_many_arguments)]
pub fn spawn_balloon(
    commands: &mut Commands,
    art: &Art,
    meshes: &mut Assets<Mesh>,
    materials: &mut Assets<ColorMaterial>,
    def: &BalloonDef,
    text: &str,
    revealed: bool,
    extra: impl Bundle + Clone,
) -> Entity {
    let at = Vec2::new(def.pos[0], def.pos[1]);
    let size = Vec2::new(def.size[0], def.size[1]);
    let z = def.z.unwrap_or(1.0) + 10.0;
    let kind = BalloonKind::parse(def.kind.as_deref());
    let tail = def
        .tail
        .map(|t| Vec2::new(t[0], t[1]))
        .filter(|t| *t != Vec2::ZERO);
    let white = materials.add(ColorMaterial {
        color: Color::srgb(0.98, 0.965, 0.925),
        alpha_mode: AlphaMode2d::Opaque,
        ..default()
    });
    let area = text_box(size);
    let font_px = fit_font(text, def.font.unwrap_or(DEFAULT_FONT), area);
    let text_entity = commands
        .spawn((
            Text2d::new(if revealed { text } else { "" }),
            TextFont {
                font: art.font.clone().into(),
                font_size: FontSize::Px(font_px),
                ..default()
            },
            TextColor(INK),
            TextLayout::justify(Justify::Center),
            TextBounds::from(area),
            Transform::from_translation(at.extend(z + 2.0)),
            extra.clone(),
        ))
        .id();
    let body = outline(kind, size);
    let balloon = commands
        .spawn((
            Mesh2d(meshes.add(polygon_mesh(&body))),
            MeshMaterial2d(white.clone()),
            Transform::from_translation(at.extend(z)),
            SpeechBalloon {
                full: text.to_string(),
                letters: if revealed { text.chars().count() as f32 } else { 0.0 },
                kind,
                size,
                tail,
                outline: body,
                text_entity,
            },
            extra.clone(),
        ))
        .id();
    if let Some(tail) = tail {
        match kind {
            BalloonKind::Thought => {
                for (center, radius) in thought_bubbles(size, tail) {
                    commands.spawn((
                        Mesh2d(meshes.add(Circle::new(radius))),
                        MeshMaterial2d(white.clone()),
                        Transform::from_translation((at + center).extend(z - 0.5)),
                        extra.clone(),
                    ));
                }
            }
            _ => {
                let (a, b) = tail_base(size, tail);
                commands.spawn((
                    Mesh2d(meshes.add(Triangle2d::new(a, b, tail_tip(size, tail)))),
                    MeshMaterial2d(white),
                    Transform::from_translation(at.extend(z - 0.5)),
                    extra,
                ));
            }
        }
    }
    balloon
}

pub struct BalloonPlugin;

impl Plugin for BalloonPlugin {
    fn build(&self, app: &mut App) {
        app.add_systems(Update, typewriter);
    }
}

fn typewriter(
    time: Res<Time>,
    mut balloons: Query<&mut SpeechBalloon>,
    mut texts: Query<&mut Text2d>,
) {
    for mut balloon in &mut balloons {
        if balloon.finished() {
            continue;
        }
        balloon.letters += time.delta_secs() * LETTERS_PER_SECOND;
        if let Ok(mut text) = texts.get_mut(balloon.text_entity) {
            text.0 = balloon.visible_text();
        }
    }
}

/// Draws the hand-inked outline of a balloon (body, pointer or bubbles).
pub fn draw_balloon_ink(gizmos: &mut Gizmos, balloon: &SpeechBalloon, center: Vec2) {
    let tail_gap = balloon.tail.filter(|_| balloon.kind != BalloonKind::Thought).map(|t| {
        let d = direction(t);
        d.y.atan2(d.x)
    });
    for pass in 0..2 {
        let mut run: Vec<Vec2> = Vec::new();
        let n = balloon.outline.len();
        for i in 0..=n {
            let p = balloon.outline[i % n];
            let a = p.y.atan2(p.x);
            let in_gap = tail_gap.is_some_and(|g| angle_diff(a, g) < 0.28);
            let broken = balloon.kind == BalloonKind::Thought && (i / 6) % 2 == 1;
            if in_gap || broken {
                flush(gizmos, &mut run, pass);
                continue;
            }
            let wobble = 1.0 + ((a * 7.0).sin() * 1.4 + pass as f32) / p.length().max(1.0);
            run.push(center + p * wobble);
        }
        flush(gizmos, &mut run, pass);
    }
    if let Some(tail) = balloon.tail {
        match balloon.kind {
            BalloonKind::Thought => {
                for (c, r) in thought_bubbles(balloon.size, tail) {
                    gizmos.circle_2d(Isometry2d::from_translation(center + c), r, INK);
                }
            }
            _ => {
                let (a, b) = tail_base(balloon.size, tail);
                gizmos.linestrip_2d(
                    [center + a, center + tail_tip(balloon.size, tail), center + b],
                    INK,
                );
            }
        }
    }
}

fn angle_diff(a: f32, b: f32) -> f32 {
    let d = (a - b).rem_euclid(std::f32::consts::TAU);
    d.min(std::f32::consts::TAU - d)
}

fn flush(gizmos: &mut Gizmos, run: &mut Vec<Vec2>, pass: i32) {
    if run.len() >= 2 {
        gizmos.linestrip_2d(
            run.drain(..),
            INK.with_alpha(if pass == 0 { 1.0 } else { 0.4 }),
        );
    } else {
        run.clear();
    }
}

/// Paper colour used by thought/speech fills in gizmo-only contexts.
pub const PAPER_FILL: Color = PAPER;

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn typewriter_reveals_progressively_and_can_skip() {
        let mut b = SpeechBalloon {
            full: "Hello\nthere".into(),
            letters: 0.0,
            kind: BalloonKind::Speech,
            size: Vec2::ONE,
            tail: None,
            outline: vec![],
            text_entity: Entity::PLACEHOLDER,
        };
        assert!(!b.finished());
        b.letters = 3.0;
        assert_eq!(b.visible_text(), "Hel");
        b.reveal();
        assert!(b.finished());
    }

    #[test]
    fn long_lines_shrink_the_font_until_they_fit() {
        let area = text_box(Vec2::new(300.0, 140.0)); // 210 × 98
        assert_eq!(fit_font("Short.", 13.0, area), 13.0);
        // Seven paragraphs need 7 × 13 × 1.3 = 118 px of height, more than the 98 available.
        let long = "one\ntwo\nthree\nfour\nfive\nsix\nseven";
        let f = fit_font(long, 13.0, area);
        assert!((MIN_FONT..13.0).contains(&f), "got {f}");
        assert!(7.0 * f * 1.3 <= area.y);
        // Never below the minimum even for absurd input.
        assert_eq!(fit_font(&"x".repeat(500), 13.0, Vec2::new(40.0, 20.0)), MIN_FONT);
    }

    #[test]
    fn outlines_differ_by_kind_and_tails_are_capped() {
        let size = Vec2::new(300.0, 140.0);
        let radius = |p: Vec2| (p.x / 150.0).hypot(p.y / 70.0);
        let oval = outline(BalloonKind::Speech, size);
        assert!(oval.iter().all(|&p| (radius(p) - 1.0).abs() < 1e-4));
        let shout = outline(BalloonKind::Shout, size);
        assert!(shout.iter().any(|&p| radius(p) < 0.8));
        let cloud = outline(BalloonKind::Thought, size);
        assert!(cloud.iter().all(|&p| radius(p) > 0.85 && radius(p) < 1.01));
        let tip = tail_tip(size, Vec2::new(0.0, -500.0));
        assert!(tip.y < -70.0 && tip.y >= -70.0 - TAIL_LENGTH - 1e-4);
        assert_eq!(thought_bubbles(size, Vec2::new(0.0, -300.0)).len(), 3);
    }
}
