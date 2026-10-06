//! The first scene: a dark meeting room. A candle on a table, two council mice beside it,
//! the player on the left. Z listens to the elder and the scout in close-up cuts; after the
//! meeting, walking off the right edge leads to the door cut.

use super::{ActiveBalloon, RestartScene, SceneEntity, Speaker, clear_scene};
use crate::{
    art::{Art, DARK_PAPER, INK, MOUSE_IDLE, MOUSE_JUMP, PAPER, Ready, art_ready, cell_rect},
    balloon::BalloonKind,
    cut::{Cut, CutId, Focus},
    dissolve::{CrossDissolvable, CrossDissolveTick, Frame, SampledMotion, spawn_dissolvable},
    ink::text,
    player::{FOOT_OFFSET, PLAYER_SIZE, Player, Walker},
    script::{Beat, Line, Script, ScriptState},
};
use bevy::prelude::*;

pub const COUNCIL: CutId = CutId("council");
pub const ELDER: CutId = CutId("elder");
pub const SCOUT: CutId = CutId("scout");
pub const DOOR: CutId = CutId("door");

const PANEL: Vec2 = Vec2::new(570.0, 760.0);
const CLOSEUP: Vec2 = Vec2::new(480.0, 640.0);
const NPC_TINT: Color = Color::srgb(0.62, 0.58, 0.52);

fn cuts() -> Vec<(Cut, &'static str)> {
    vec![
        (
            Cut::new(COUNCIL, Vec2::new(0.0, -20.0), PANEL),
            "01 / THE COUNCIL",
        ),
        (
            Cut::new(ELDER, Vec2::new(-330.0, 840.0), CLOSEUP),
            "02 / THE ELDER",
        ),
        (
            Cut::new(SCOUT, Vec2::new(330.0, 840.0), CLOSEUP),
            "03 / THE SCOUT",
        ),
        (Cut::new(DOOR, Vec2::new(760.0, -20.0), PANEL), "04 / THE DOOR"),
    ]
}

fn line(cut: CutId, text: &'static str, kind: BalloonKind, slot: usize) -> Beat {
    Beat::Line(Line {
        cut,
        text,
        kind,
        slot,
    })
}

pub fn script() -> Script {
    use BalloonKind::*;
    Script::new(
        COUNCIL,
        DOOR,
        vec![
            Beat::Focus(ELDER),
            line(
                ELDER,
                "The council has spoken.\nThe old bell is failing.",
                Speech,
                0,
            ),
            line(
                ELDER,
                "You will carry the new one.\nGood luck, little one.",
                Speech,
                1,
            ),
            Beat::Focus(COUNCIL),
            line(
                COUNCIL,
                "Good luck. As if luck\nhas ever saved one of us.",
                Thought,
                0,
            ),
            Beat::Focus(SCOUT),
            line(
                SCOUT,
                "It sleeps by the hearth\nin the big house.",
                Speech,
                0,
            ),
            line(
                SCOUT,
                "Past the pantry, on the right.\nGo before the candle\nburns out.",
                Speech,
                1,
            ),
            Beat::Return,
        ],
    )
}

#[derive(Resource, Default)]
struct Spawned(bool);

pub struct MeetingRoomPlugin;

impl Plugin for MeetingRoomPlugin {
    fn build(&self, app: &mut App) {
        app.insert_resource(ScriptState(script()))
            .init_resource::<Spawned>()
            .add_systems(
                Update,
                (
                    restart,
                    spawn_scene.run_if(art_ready).run_if(|s: Res<Spawned>| !s.0),
                )
                    .chain(),
            );
    }
}

fn restart(
    mut commands: Commands,
    mut messages: MessageReader<RestartScene>,
    entities: Query<Entity, With<SceneEntity>>,
    mut tick: ResMut<CrossDissolveTick>,
    mut active: ResMut<ActiveBalloon>,
    mut spawned: ResMut<Spawned>,
) {
    if messages.read().next().is_none() {
        return;
    }
    clear_scene(&mut commands, entities.iter(), &mut tick, &mut active);
    spawned.0 = false;
}

fn mouse_frame(art: &Art, images: &Assets<Image>, cell: usize) -> Frame {
    Frame {
        image: art.mouse.clone(),
        rect: images.get(&art.mouse).map(|i| cell_rect(i, 2, 2, cell)),
    }
}

fn walk_frame(art: &Art, images: &Assets<Image>, cell: usize) -> Frame {
    Frame {
        image: art.walk.clone(),
        rect: images.get(&art.walk).map(|i| cell_rect(i, 2, 1, cell)),
    }
}

fn candle_frames(art: &Art, images: &Assets<Image>) -> Vec<Frame> {
    match art.candle.as_slice() {
        [strip] => (0..3)
            .map(|cell| Frame {
                image: strip.clone(),
                rect: images.get(strip).map(|i| cell_rect(i, 3, 1, cell)),
            })
            .collect(),
        many => many
            .iter()
            .map(|h| Frame {
                image: h.clone(),
                rect: None,
            })
            .collect(),
    }
}

#[allow(clippy::too_many_arguments)]
fn spawn_scene(
    mut commands: Commands,
    art: Res<Art>,
    images: Res<Assets<Image>>,
    mut meshes: ResMut<Assets<Mesh>>,
    mut materials: ResMut<Assets<ColorMaterial>>,
    mut focus: ResMut<Focus>,
    mut script_state: ResMut<ScriptState>,
    mut spawned: ResMut<Spawned>,
    _ready: Res<Ready>,
) {
    spawned.0 = true;
    script_state.0 = script();

    for (cut, label) in cuts() {
        let center = cut.center;
        let size = cut.size;
        let floor = cut.floor_y;
        // Ink frame behind, dark paper in front; the wobbly contour is drawn by gizmos.
        commands.spawn((
            Sprite::from_color(INK, size + Vec2::splat(8.0)),
            Transform::from_translation(center.extend(-2.0)),
            SceneEntity,
        ));
        let mut background = commands.spawn((
            Sprite::from_color(DARK_PAPER, size),
            Transform::from_translation(center.extend(-1.0)),
            SceneEntity,
        ));
        if cut.id == COUNCIL
            && let Some(room) = &art.meeting_room
        {
            background.insert(Sprite {
                image: room.clone(),
                custom_size: Some(size),
                ..default()
            });
        }
        let label_at = Vec2::new(cut.left() + 100.0, center.y + size.y / 2.0 - 26.0);
        commands.spawn((
            Sprite::from_color(PAPER, Vec2::new(172.0, 34.0)),
            Transform::from_translation(label_at.extend(1.0)),
            SceneEntity,
        ));
        let id = text(&mut commands, &art, label, 13.0, label_at);
        commands.entity(id).insert(SceneEntity);

        if cut.id == COUNCIL {
            spawn_council(
                &mut commands,
                &art,
                &images,
                &mut meshes,
                &mut materials,
                &cut,
            );
            focus.snap(&cut);
        } else if cut.id == DOOR {
            let id = text(
                &mut commands,
                &art,
                "TO BE CONTINUED",
                22.0,
                Vec2::new(center.x, floor + 220.0),
            );
            commands
                .entity(id)
                .insert((SceneEntity, TextColor(PAPER.with_alpha(0.55))));
        } else {
            // Close-up: the same mouse drawn larger, facing the reader.
            let flip = cut.id == SCOUT;
            let at = center + Vec2::new(0.0, -150.0);
            spawn_dissolvable(
                &mut commands,
                (
                    SceneEntity,
                    Speaker {
                        cut: cut.id,
                        mouth: at + Vec2::new(if flip { -70.0 } else { 70.0 }, 40.0),
                    },
                ),
                CrossDissolvable::cycle(
                    vec![
                        mouse_frame(&art, &images, MOUSE_IDLE),
                        mouse_frame(&art, &images, 1),
                    ],
                    Vec2::splat(260.0),
                )
                .with_tint(NPC_TINT)
                .with_flip(flip),
                Transform::from_translation(at.extend(2.0)),
            );
        }
        commands.spawn((cut, SceneEntity));
    }
}

fn spawn_council(
    commands: &mut Commands,
    art: &Art,
    images: &Assets<Image>,
    meshes: &mut Assets<Mesh>,
    materials: &mut Assets<ColorMaterial>,
    cut: &Cut,
) {
    let floor = cut.floor_y;
    let cx = cut.center.x;

    // Candle glow.
    commands.spawn((
        Mesh2d(meshes.add(Ellipse::new(230.0, 170.0))),
        MeshMaterial2d(materials.add(ColorMaterial {
            color: Color::srgba(0.95, 0.72, 0.35, 0.22),
            alpha_mode: bevy::sprite_render::AlphaMode2d::Blend,
            ..default()
        })),
        Transform::from_xyz(cx, floor + 120.0, -0.5),
        SceneEntity,
    ));
    // Floor line.
    commands.spawn((
        Sprite::from_color(INK.with_alpha(0.6), Vec2::new(cut.size.x - 40.0, 2.0)),
        Transform::from_xyz(cx, floor, 0.5),
        SceneEntity,
    ));
    commands.spawn((
        Sprite {
            image: art.table.clone(),
            custom_size: Some(Vec2::new(180.0, 90.0)),
            ..default()
        },
        Transform::from_xyz(cx, floor + 45.0, 1.0),
        SceneEntity,
    ));
    spawn_dissolvable(
        commands,
        SceneEntity,
        CrossDissolvable::cycle(candle_frames(art, images), Vec2::new(40.0, 80.0)),
        Transform::from_xyz(cx, floor + 72.0 + 40.0, 2.0),
    );

    for (x, flip) in [(-95.0, false), (95.0, true)] {
        spawn_dissolvable(
            commands,
            SceneEntity,
            CrossDissolvable::cycle(
                vec![
                    mouse_frame(art, images, MOUSE_IDLE),
                    mouse_frame(art, images, 1),
                ],
                Vec2::splat(PLAYER_SIZE),
            )
            .with_tint(NPC_TINT)
            .with_flip(flip),
            Transform::from_xyz(cx + x, floor + FOOT_OFFSET, 2.0),
        );
    }

    let walker = Walker::standing_at(cut.walk_min + 8.0, floor);
    spawn_dissolvable(
        commands,
        (
            SceneEntity,
            SampledMotion,
            Player::new(walker),
            Speaker {
                cut: cut.id,
                mouth: Vec2::new(walker.x + 30.0, floor + 90.0),
            },
        ),
        CrossDissolvable::hold(
            vec![
                mouse_frame(art, images, MOUSE_IDLE),
                walk_frame(art, images, 0),
                walk_frame(art, images, 1),
                mouse_frame(art, images, MOUSE_JUMP),
            ],
            Vec2::splat(PLAYER_SIZE),
        ),
        Transform::from_xyz(walker.x, floor + FOOT_OFFSET, 3.0),
    );
}
