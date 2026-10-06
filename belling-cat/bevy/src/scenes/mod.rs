//! Concrete scenes and the driver that turns [`Script`] commands into camera moves and
//! balloons.

pub mod meeting_room;

use crate::{
    art::Art,
    balloon::{SpeechBalloon, spawn_balloon},
    cut::{Cut, Focus, find_cut},
    dissolve::CrossDissolveTick,
    player::{FOOT_OFFSET, Player, PlayerInput, PlayerSet, Walker, consume_input},
    script::{Command, ScriptInput, ScriptState},
};
use bevy::prelude::*;

/// Everything a scene spawns; despawned on restart.
#[derive(Component, Clone, Copy, Default)]
pub struct SceneEntity;

/// Where a character's mouth is, so balloons in that cut can point at it.
#[derive(Component, Debug)]
pub struct Speaker {
    pub cut: crate::cut::CutId,
    pub mouth: Vec2,
}

#[derive(Message, Default)]
pub struct RestartScene;

#[derive(Resource, Default)]
pub struct ActiveBalloon(pub Option<Entity>);

pub struct SceneDriverPlugin;

impl Plugin for SceneDriverPlugin {
    fn build(&self, app: &mut App) {
        app.add_message::<RestartScene>()
            .init_resource::<ActiveBalloon>()
            .add_systems(
                FixedUpdate,
                (drive_script, request_restart, consume_input)
                    .chain()
                    .after(PlayerSet::Move),
            );
    }
}

fn request_restart(input: Res<PlayerInput>, mut restart: MessageWriter<RestartScene>) {
    if input.restart {
        restart.write(RestartScene);
    }
}

#[allow(clippy::too_many_arguments)]
fn drive_script(
    mut commands: Commands,
    time: Res<Time>,
    input: Res<PlayerInput>,
    art: Option<Res<Art>>,
    mut meshes: ResMut<Assets<Mesh>>,
    mut materials: ResMut<Assets<ColorMaterial>>,
    mut focus: ResMut<Focus>,
    mut script: Option<ResMut<ScriptState>>,
    mut active: ResMut<ActiveBalloon>,
    cuts: Query<&Cut>,
    speakers: Query<&Speaker>,
    mut balloons: Query<&mut SpeechBalloon>,
    mut player: Query<(&mut Player, &mut Transform)>,
) {
    let (Some(art), Some(script)) = (art, script.as_mut()) else {
        return;
    };
    let line_finished = active
        .0
        .and_then(|e| balloons.get(e).ok())
        .is_none_or(|b| b.finished());
    let at_right_edge = player.single().map(|p| p.0.at_right_edge).unwrap_or(false);
    let mut out = Vec::new();
    script.tick(
        time.delta_secs(),
        ScriptInput {
            interact: input.interact,
            slide_done: !focus.is_sliding(),
            line_finished,
            at_right_edge,
        },
        &mut out,
    );
    for command in out {
        match command {
            Command::Focus(id) => {
                let Some(cut) = find_cut(cuts.iter(), id) else {
                    warn!("script asked for unknown cut {id:?}");
                    continue;
                };
                focus.go(cut);
                if id == script.exit
                    && let Ok((mut player, mut transform)) = player.single_mut()
                {
                    // Walking out of the right edge arrives at the left of the next cut.
                    player.walker = Walker::standing_at(cut.walk_min + 10.0, cut.floor_y);
                    transform.translation.x = player.walker.x;
                    transform.translation.y = player.walker.y + FOOT_OFFSET;
                }
            }
            Command::Speak(line) => {
                let Some(cut) = find_cut(cuts.iter(), line.cut) else {
                    continue;
                };
                let mouth = speakers
                    .iter()
                    .find(|s| s.cut == line.cut)
                    .map(|s| s.mouth)
                    .unwrap_or(cut.center);
                let size = Vec2::new(cut.size.x * 0.78, 140.0);
                let at = cut.center
                    + Vec2::new(0.0, cut.size.y * 0.5 - 110.0 - line.slot as f32 * 155.0);
                let id = spawn_balloon(
                    &mut commands,
                    &art,
                    &mut meshes,
                    &mut materials,
                    at,
                    size,
                    mouth,
                    line.text,
                    line.kind,
                    SceneEntity,
                );
                active.0 = Some(id);
            }
            Command::RevealLine => {
                if let Some(mut balloon) = active.0.and_then(|e| balloons.get_mut(e).ok()) {
                    balloon.reveal();
                }
            }
        }
    }
}

/// Removes everything a scene spawned and resets the shared clocks.
pub fn clear_scene(
    commands: &mut Commands,
    entities: impl IntoIterator<Item = Entity>,
    tick: &mut CrossDissolveTick,
    active: &mut ActiveBalloon,
) {
    for entity in entities {
        commands.entity(entity).despawn();
    }
    *tick = CrossDissolveTick::default();
    active.0 = None;
}
