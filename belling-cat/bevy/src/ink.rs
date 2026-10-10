//! Hand-inked outlines drawn with gizmos, and the page furniture (title, footer hints).

use crate::{
    art::{Art, INK, Ready},
    balloon::{SpeechBalloon, draw_balloon_ink},
    cut::{Cut, CutHidden, Focus, FollowCamera},
    script::{Phase, ScriptState},
};
use bevy::prelude::*;

/// Page furniture is printed under the panels, so a sliding camera never shows it on top.
const PAGE_Z: f32 = -3.0;

#[derive(Component)]
pub struct Footer;

pub struct InkPlugin;

impl Plugin for InkPlugin {
    fn build(&self, app: &mut App) {
        app.add_systems(Startup, spawn_page_text)
            .add_systems(Update, (draw_cut_outlines, draw_balloons, update_footer));
    }
}

/// Spawns centred ink text; shared by every module that writes on the page.
pub fn text(commands: &mut Commands, art: &Art, content: &str, size: f32, position: Vec2) -> Entity {
    commands
        .spawn((
            Text2d::new(content),
            TextFont {
                font: art.font.clone().into(),
                font_size: FontSize::Px(size),
                ..default()
            },
            TextColor(INK),
            TextLayout::justify(Justify::Center),
            Transform::from_translation(position.extend(12.0)),
        ))
        .id()
}

fn spawn_page_text(mut commands: Commands, art: Res<Art>) {
    for (content, size, y) in [
        ("BELLING THE CAT", 27.0, 433.0),
        ("A STORY BETWEEN THE LINES", 10.0, 397.0),
    ] {
        let id = text(&mut commands, &art, content, size, Vec2::new(0.0, y));
        commands.entity(id).insert((
            FollowCamera(Vec2::new(0.0, y)),
            Transform::from_xyz(0.0, y, PAGE_Z),
        ));
    }
    let footer = text(&mut commands, &art, "", 13.0, Vec2::new(0.0, -438.0));
    commands.entity(footer).insert((
        Footer,
        FollowCamera(Vec2::new(0.0, -438.0)),
        Transform::from_xyz(0.0, -438.0, PAGE_Z),
    ));
}

/// Two slightly offset, slightly wobbly contours along each cut polygon.
fn draw_cut_outlines(mut gizmos: Gizmos, cuts: Query<&Cut, Without<CutHidden>>) {
    for cut in &cuts {
        let n = cut.polygon.len();
        for pass in 0..2 {
            let offset = 3.0 + pass as f32 * 2.0;
            let points: Vec<Vec2> = (0..=n)
                .map(|i| {
                    let p = cut.polygon[i % n];
                    // Push each corner outward from the centre so the ink sits just outside the paper.
                    let away = (p - cut.center()).normalize_or_zero();
                    let wobble = ((i as f32 * 1.7 + pass as f32) * 3.1).sin() * 1.5;
                    p + away * (offset + wobble)
                })
                .collect();
            gizmos.linestrip_2d(points, INK.with_alpha(if pass == 0 { 0.55 } else { 0.3 }));
        }
    }
}

fn draw_balloons(mut gizmos: Gizmos, balloons: Query<(&SpeechBalloon, &Transform)>) {
    for (balloon, transform) in &balloons {
        draw_balloon_ink(&mut gizmos, balloon, transform.translation.truncate());
    }
}

fn update_footer(
    ready: Res<Ready>,
    script: Option<Res<ScriptState>>,
    focus: Res<Focus>,
    mut footer: Single<&mut Text2d, With<Footer>>,
) {
    footer.0 = if !ready.0 {
        "LOADING THE PAGE...".to_string()
    } else if focus.is_sliding() {
        "BETWEEN THE PANELS...".to_string()
    } else {
        match script.as_ref().map(|s| s.phase) {
            None => "LOADING THE SCENE...".to_string(),
            Some(Phase::Exploring) => "ARROWS / A D  MOVE    SPACE  JUMP    Z  ACT    R  RELOAD".to_string(),
            Some(Phase::Sliding(_)) => "BETWEEN THE PANELS...".to_string(),
            Some(Phase::Talking) => "Z  REVEAL / NEXT    R  RELOAD".to_string(),
            Some(Phase::Waiting(_)) => "...".to_string(),
        }
    };
}
