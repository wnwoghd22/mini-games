//! Turning a loaded `*.scene.json` into entities, driving its flow, and reloading it.
//!
//! `loader` spawns cuts, children and the player from the [`SceneFile`] asset and respawns
//! them when the file changes on disk (hot reload) or when R is pressed. The driver below runs
//! the [`Script`] each fixed step and applies its commands.

pub mod loader;

use crate::{
    art::Art,
    balloon::{SpeechBalloon, spawn_balloon},
    cut::{Cut, Focus, find_cut},
    dialogue::Dialogue,
    player::{Player, PlayerInput, PlayerSet, consume_input},
    scene_file::{ChildDef, SceneFile},
    script::{Command, ScriptInput, ScriptState},
};
use bevy::prelude::*;

pub use loader::{LoadedScene, SceneHandles};

/// Everything a scene spawns; despawned on reload.
#[derive(Component, Clone, Copy, Default)]
pub struct SceneEntity;

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
    handles: Option<Res<SceneHandles>>,
    scenes: Res<Assets<SceneFile>>,
    dialogues: Res<Assets<Dialogue>>,
    cuts: Query<&Cut>,
    mut balloons: Query<&mut SpeechBalloon>,
    mut player: Query<(&mut Player, &mut Transform)>,
) {
    let (Some(art), Some(script), Some(handles)) = (art, script.as_mut(), handles) else {
        return;
    };
    let Some(scene) = scenes.get(&handles.scene) else {
        return;
    };
    let line_finished = active
        .0
        .and_then(|e| balloons.get(e).ok())
        .is_none_or(|b| b.finished());
    let (player_cut, player_x, at_right, at_left, facing_left, half_width) = player
        .single()
        .map(|(p, _)| {
            (
                p.cut.clone(),
                p.walker.x,
                p.at_right_edge,
                p.at_left_edge,
                p.walker.facing_left,
                p.size.x / 2.0,
            )
        })
        .unwrap_or_default();
    let mut out = Vec::new();
    script.tick(
        time.delta_secs(),
        ScriptInput {
            interact: input.interact,
            slide_done: !focus.is_sliding(),
            line_finished,
            at_right_edge: at_right,
            at_left_edge: at_left,
            player_cut: &player_cut,
            player_x,
            player_facing_left: facing_left,
            player_half_width: half_width,
        },
        &mut out,
    );
    for command in out {
        info!("flow: {command:?}");
        match command {
            Command::Focus(id) => match find_cut(cuts.iter(), &id) {
                Some(cut) => focus.go(cut),
                None => warn!("flow asked for unknown cut {id:?}"),
            },
            Command::Path(frames) => focus.go_path(&frames),
            Command::MovePlayer { cut, x } => {
                let Some(cut) = find_cut(cuts.iter(), &cut) else {
                    warn!("flow moves the player to unknown cut {cut:?}");
                    continue;
                };
                if let Ok((mut player, mut transform)) = player.single_mut() {
                    player.place(cut, x);
                    transform.translation.x = player.walker.x;
                    transform.translation.y = player.walker.y + player.foot_offset();
                }
            }
            Command::Speak(id) => {
                let Some(ChildDef::Balloon(def)) = scene
                    .cuts
                    .iter()
                    .flat_map(|c| c.children.iter())
                    .find(|c| c.id() == id)
                else {
                    warn!("flow says unknown balloon {id:?}");
                    continue;
                };
                let text = handles
                    .dialogue
                    .as_ref()
                    .and_then(|h| dialogues.get(h))
                    .and_then(|d| d.text(&def.line))
                    .map(str::to_string)
                    .unwrap_or_else(|| format!("[missing: {}]", def.line));
                let entity = spawn_balloon(
                    &mut commands,
                    &art,
                    &mut meshes,
                    &mut materials,
                    def,
                    &text,
                    false,
                    SceneEntity,
                );
                active.0 = Some(entity);
            }
            Command::RevealLine => {
                if let Some(mut balloon) = active.0.and_then(|e| balloons.get_mut(e).ok()) {
                    balloon.reveal();
                }
            }
        }
    }
}
