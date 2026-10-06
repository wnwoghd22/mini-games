//! Speech balloons. Once a balloon is on the page it stays there; nothing despawns it
//! except a scene restart.

use crate::art::{Art, INK};
use bevy::{prelude::*, text::TextBounds};

pub const LETTERS_PER_SECOND: f32 = 36.0;
/// How far a tail may extend past the balloon rim.
pub const TAIL_LENGTH: f32 = 90.0;

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum BalloonKind {
    Speech,
    /// A thought: drawn with a broken outline and no tail.
    Thought,
}

#[derive(Component, Debug)]
pub struct SpeechBalloon {
    pub full: String,
    pub letters: f32,
    pub kind: BalloonKind,
    pub size: Vec2,
    /// Tail tip, relative to the balloon centre.
    pub tail: Vec2,
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

/// Spawns a balloon centred at `at` whose tail points to `tail_to` (world space).
#[allow(clippy::too_many_arguments)]
pub fn spawn_balloon(
    commands: &mut Commands,
    art: &Art,
    meshes: &mut Assets<Mesh>,
    materials: &mut Assets<ColorMaterial>,
    at: Vec2,
    size: Vec2,
    tail_to: Vec2,
    text: &str,
    kind: BalloonKind,
    extra: impl Bundle + Clone,
) -> Entity {
    let white = materials.add(Color::srgb(0.98, 0.965, 0.925));
    let text_entity = commands
        .spawn((
            Text2d::new(""),
            TextFont {
                font: art.font.clone().into(),
                font_size: FontSize::Px(22.0),
                ..default()
            },
            TextColor(INK),
            TextLayout::justify(Justify::Center),
            TextBounds::from(size - Vec2::new(60.0, 30.0)),
            Transform::from_translation(at.extend(12.0)),
            extra.clone(),
        ))
        .id();
    let tail = tail_tip(size, tail_to - at);
    let balloon = commands
        .spawn((
            Mesh2d(meshes.add(Ellipse::new(size.x / 2.0, size.y / 2.0))),
            MeshMaterial2d(white.clone()),
            Transform::from_translation(at.extend(10.0)),
            SpeechBalloon {
                full: text.to_string(),
                letters: 0.0,
                kind,
                size,
                tail,
                text_entity,
            },
            extra.clone(),
        ))
        .id();
    if kind == BalloonKind::Speech {
        let (a, b) = tail_base(size, tail);
        commands.spawn((
            Mesh2d(meshes.add(Triangle2d::new(a, b, tail))),
            MeshMaterial2d(white),
            Transform::from_translation(at.extend(9.0)),
            extra,
        ));
    }
    balloon
}

/// Tail tip: points toward `towards` but reaches at most [`TAIL_LENGTH`] past the rim.
pub fn tail_tip(size: Vec2, towards: Vec2) -> Vec2 {
    let dir = towards.normalize_or(Vec2::NEG_Y);
    let angle = dir.y.atan2(dir.x);
    let rim = Vec2::new(angle.cos() * size.x * 0.5, angle.sin() * size.y * 0.5);
    let reach = (towards.length() - rim.length()).clamp(20.0, TAIL_LENGTH);
    rim + dir * reach
}

/// Two points on the oval's rim either side of the tail direction.
pub fn tail_base(size: Vec2, tail: Vec2) -> (Vec2, Vec2) {
    let dir = tail.normalize_or(Vec2::NEG_Y);
    let angle = dir.y.atan2(dir.x);
    let spread = 0.28;
    let rim = |a: f32| Vec2::new(a.cos() * size.x * 0.46, a.sin() * size.y * 0.46);
    (rim(angle - spread), rim(angle + spread))
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

/// Draws the hand-inked outline of every balloon.
pub fn draw_balloon_ink(gizmos: &mut Gizmos, balloon: &SpeechBalloon, center: Vec2) {
    let (rx, ry) = (balloon.size.x / 2.0, balloon.size.y / 2.0);
    let (gap_a, gap_b) = if balloon.kind == BalloonKind::Speech {
        let dir = balloon.tail.normalize_or(Vec2::NEG_Y);
        let a = dir.y.atan2(dir.x);
        (a - 0.28, a + 0.28)
    } else {
        (0.0, 0.0)
    };
    for pass in 0..2 {
        let mut run: Vec<Vec2> = Vec::new();
        for i in 0..=96 {
            let a = gap_b + (std::f32::consts::TAU - (gap_b - gap_a)) * i as f32 / 96.0;
            let wobble = (a * 7.0).sin() * 1.4;
            let broken = balloon.kind == BalloonKind::Thought && (i / 6) % 2 == 1;
            if broken {
                flush(gizmos, &mut run, pass);
                continue;
            }
            run.push(
                center
                    + Vec2::new(
                        a.cos() * (rx + wobble + pass as f32),
                        a.sin() * (ry + wobble),
                    ),
            );
        }
        flush(gizmos, &mut run, pass);
    }
    if balloon.kind == BalloonKind::Speech {
        let (a, b) = tail_base(balloon.size, balloon.tail);
        gizmos.linestrip_2d([center + a, center + balloon.tail, center + b], INK);
    }
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
            tail: Vec2::NEG_Y,
            text_entity: Entity::PLACEHOLDER,
        };
        assert!(!b.finished());
        b.letters = 3.0;
        assert_eq!(b.visible_text(), "Hel");
        b.reveal();
        assert!(b.finished());
        assert_eq!(b.visible_text(), "Hello\nthere");
    }

    #[test]
    fn tail_is_capped_but_keeps_its_direction() {
        let tip = tail_tip(Vec2::new(300.0, 140.0), Vec2::new(60.0, -400.0));
        assert!(tip.y < -70.0 && tip.y > -70.0 - TAIL_LENGTH - 1.0);
        assert!(tip.x > 0.0);
    }

    #[test]
    fn tail_base_straddles_the_tail_direction() {
        let (a, b) = tail_base(Vec2::new(200.0, 100.0), Vec2::new(0.0, -120.0));
        assert!(a.x < 0.0 && b.x > 0.0);
        assert!(a.y < 0.0 && b.y < 0.0);
    }
}
