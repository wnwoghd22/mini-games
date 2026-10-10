//! Spawns a [`SceneFile`] into entities and keeps it in sync with the file on disk.

use super::{ActiveBalloon, RestartScene, SceneEntity};
use crate::{
    art::{Art, DARK_PAPER, INK, Ready, art_ready},
    balloon::spawn_balloon,
    cut::{Cut, CutHidden, Focus, InCut},
    dialogue::Dialogue,
    dissolve::{BeatPulse, CrossDissolvable, CrossDissolveTick, DissolveLayer, SampledMotion, spawn_dissolvable},
    ink::text,
    mask::MaskMaterial,
    player::{DEFAULT_SIZE, Player, Walker},
    polygon::polygon_mesh,
    scene_file::{ChildDef, SceneFile, parse_color},
    script::{Script, ScriptState, TargetSpot},
};
use bevy::{platform::collections::HashMap, prelude::*};

/// Handles of the scene being played and its dialogue file.
#[derive(Resource)]
pub struct SceneHandles {
    pub scene: Handle<SceneFile>,
    pub dialogue: Option<Handle<Dialogue>>,
    /// Asset path of the scene, used to resolve the dialogue path next to it.
    pub path: String,
}

#[derive(Resource, Default)]
pub struct LoadedScene {
    pub spawned: bool,
}

pub struct SceneLoaderPlugin {
    pub path: &'static str,
}

impl Plugin for SceneLoaderPlugin {
    fn build(&self, app: &mut App) {
        let path = self.path;
        app.init_resource::<LoadedScene>()
            .add_systems(PreStartup, move |mut commands: Commands, server: Res<AssetServer>| {
                commands.insert_resource(SceneHandles {
                    scene: server.load(path),
                    dialogue: None,
                    path: path.to_string(),
                });
            })
            .add_systems(
                Update,
                (
                    watch_scene_assets,
                    restart,
                    spawn_scene.run_if(art_ready).run_if(|s: Res<LoadedScene>| !s.spawned),
                    apply_cut_visibility,
                )
                    .chain(),
            );
    }
}

/// Hot reload: when the scene or dialogue file changes on disk, respawn.
fn watch_scene_assets(
    mut scene_events: MessageReader<AssetEvent<SceneFile>>,
    mut dialogue_events: MessageReader<AssetEvent<Dialogue>>,
    mut restart: MessageWriter<RestartScene>,
    loaded: Res<LoadedScene>,
) {
    let scene_changed = scene_events
        .read()
        .any(|e| matches!(e, AssetEvent::Modified { .. }));
    let dialogue_changed = dialogue_events
        .read()
        .any(|e| matches!(e, AssetEvent::Modified { .. }));
    if loaded.spawned && (scene_changed || dialogue_changed) {
        info!("scene file changed on disk; reloading");
        restart.write(RestartScene);
    }
}

fn restart(
    mut commands: Commands,
    mut messages: MessageReader<RestartScene>,
    entities: Query<Entity, With<SceneEntity>>,
    mut tick: ResMut<CrossDissolveTick>,
    mut active: ResMut<ActiveBalloon>,
    mut loaded: ResMut<LoadedScene>,
) {
    if messages.read().next().is_none() {
        return;
    }
    for entity in &entities {
        commands.entity(entity).despawn();
    }
    *tick = CrossDissolveTick::default();
    active.0 = None;
    loaded.spawned = false;
}

#[allow(clippy::too_many_arguments)]
fn spawn_scene(
    mut commands: Commands,
    art: Res<Art>,
    images: Res<Assets<Image>>,
    mut meshes: ResMut<Assets<Mesh>>,
    mut materials: ResMut<Assets<ColorMaterial>>,
    mut masks: ResMut<Assets<MaskMaterial>>,
    mut focus: ResMut<Focus>,
    mut loaded: ResMut<LoadedScene>,
    mut handles: ResMut<SceneHandles>,
    server: Res<AssetServer>,
    scenes: Res<Assets<SceneFile>>,
    dialogues: Res<Assets<Dialogue>>,
    _ready: Res<Ready>,
) {
    let Some(scene) = scenes.get(&handles.scene) else {
        return;
    };
    // Load the dialogue file named by the scene (relative to the scene file) and wait for it.
    if let Some(name) = &scene.dialogue {
        if handles.dialogue.is_none() {
            let dir = handles.path.rsplit_once('/').map(|(d, _)| d).unwrap_or("");
            let path = if dir.is_empty() { name.clone() } else { format!("{dir}/{name}") };
            handles.dialogue = Some(server.load(path));
            return;
        }
        if handles.dialogue.as_ref().is_some_and(|h| !dialogues.contains(h)) {
            return;
        }
    }
    loaded.spawned = true;
    let dialogue = handles.dialogue.as_ref().and_then(|h| dialogues.get(h));
    if let Some(d) = dialogue {
        for w in &d.warnings {
            warn!("dialogue: {w}");
        }
    }

    let mut targets: HashMap<String, TargetSpot> = HashMap::new();
    let mut cuts: Vec<Cut> = Vec::new();
    for def in &scene.cuts {
        let points = def.points();
        if points.len() < 3 {
            warn!("cut {:?} has fewer than 3 vertices; skipped", def.id);
            continue;
        }
        let cut = Cut::new(
            def.id.clone(),
            points.clone(),
            def.floor_y,
            def.walk.map(|w| (w[0], w[1])),
        );
        let center = cut.center();
        let size = cut.bbox.size();
        targets.insert(
            def.id.clone(),
            TargetSpot {
                cut: def.id.clone(),
                x: center.x,
                half_width: size.x / 2.0,
            },
        );

        // Ink frame behind, paper in front; the wobbly contour is drawn by gizmos.
        let frame_points: Vec<Vec2> = points
            .iter()
            .map(|p| *p + (*p - center).normalize_or_zero() * 4.0)
            .collect();
        let in_cut = InCut(def.id.clone());
        commands.spawn((
            Mesh2d(meshes.add(polygon_mesh(&frame_points))),
            MeshMaterial2d(materials.add(INK)),
            Transform::from_xyz(0.0, 0.0, -2.0),
            SceneEntity,
            in_cut.clone(),
        ));
        let fill = parse_color(def.fill.as_deref().unwrap_or("dark"), DARK_PAPER);
        commands.spawn((
            Mesh2d(meshes.add(polygon_mesh(&points))),
            MeshMaterial2d(materials.add(fill)),
            Transform::from_xyz(0.0, 0.0, -1.0),
            SceneEntity,
            in_cut.clone(),
        ));
        // `label` is for the editor only; the play view shows no panel titles.

        for child in &def.children {
            targets.insert(
                child.id().to_string(),
                TargetSpot {
                    cut: def.id.clone(),
                    x: child.pos().x,
                    half_width: child.half_width(),
                },
            );
            spawn_child(&mut commands, &art, &images, &mut meshes, &mut masks, child, dialogue, &in_cut, &points);
        }
        let mut cut_entity = commands.spawn((cut.clone(), SceneEntity));
        // The player's home cut is on screen from the start, hidden or not.
        if def.hidden() && def.id != scene.player.cut {
            cut_entity.insert(CutHidden);
        }
        cuts.push(cut);
    }

    // Player.
    let size = scene
        .player
        .size
        .map(|s| Vec2::new(s[0], s[1]))
        .unwrap_or(DEFAULT_SIZE);
    let mut frames = Vec::new();
    frames.extend(art.frame(&scene.player.frames.idle, &images));
    let walk: Vec<_> = art.frames(&scene.player.frames.walk, &images);
    let walk_frames = walk.len().max(1);
    frames.extend(walk);
    frames.extend(art.frame(&scene.player.frames.jump, &images));
    match cuts.iter().find(|c| c.id == scene.player.cut) {
        Some(home) if home.floor_y.is_some() => {
            let mut player = Player::new(Walker::standing_at(0.0, 0.0), &home.id, size, walk_frames);
            player.place(home, scene.player.x);
            let at = Vec2::new(player.walker.x, player.walker.y + player.foot_offset());
            let mask = scene.player.clip.then(|| home.polygon.clone());
            spawn_dissolvable(
                &mut commands,
                &mut meshes,
                &mut masks,
                (SceneEntity, SampledMotion, player),
                CrossDissolvable::hold(frames, size).with_mask(mask),
                Transform::from_translation(at.extend(3.0)),
            );
            focus.snap(home);
        }
        Some(_) => warn!("player cut {:?} has no floor_y", scene.player.cut),
        None => warn!("player cut {:?} does not exist", scene.player.cut),
    }

    commands.insert_resource(ScriptState(Script::new(scene.flow.clone(), targets)));
    info!("scene {:?} spawned: {} cuts, {} triggers", handles.path, cuts.len(), scene.flow.len());
}

/// Shows or hides everything tagged with a cut according to the cut's [`CutHidden`] marker.
/// Dissolve layers are not tagged (they are separate entities) and follow their owner's tag;
/// the owner entity itself stays `Hidden`, as the layers do the drawing.
fn apply_cut_visibility(
    hidden: Query<&Cut, With<CutHidden>>,
    mut members: Query<(&InCut, &mut Visibility), Without<CrossDissolvable>>,
    mut layers: Query<(&DissolveLayer, &mut Visibility), Without<InCut>>,
    owners: Query<&InCut, With<CrossDissolvable>>,
) {
    let hidden: Vec<&str> = hidden.iter().map(|c| c.id.as_str()).collect();
    let wanted = |tag: &InCut| {
        if hidden.contains(&tag.0.as_str()) {
            Visibility::Hidden
        } else {
            Visibility::Inherited
        }
    };
    for (tag, mut visibility) in &mut members {
        visibility.set_if_neq(wanted(tag));
    }
    for (layer, mut visibility) in &mut layers {
        if let Ok(tag) = owners.get(layer.owner) {
            visibility.set_if_neq(wanted(tag));
        }
    }
}

#[allow(clippy::too_many_arguments)]
fn spawn_child(
    commands: &mut Commands,
    art: &Art,
    images: &Assets<Image>,
    meshes: &mut Assets<Mesh>,
    materials: &mut Assets<MaskMaterial>,
    child: &ChildDef,
    dialogue: Option<&Dialogue>,
    in_cut: &InCut,
    polygon: &[Vec2],
) {
    let pos = child.pos();
    let z = child.z();
    let tag = in_cut.clone();
    // `clip: true` (the default) keeps the child inside its cut, as in the editor.
    let mask: Option<&[Vec2]> = child.clip().then_some(polygon);
    match child {
        ChildDef::Sprite(def) => {
            let frames = art.frames(&def.frames, images);
            if frames.is_empty() {
                warn!("sprite {:?} has no usable frames", def.id);
                return;
            }
            let size = Vec2::new(def.size[0], def.size[1]);
            let mut d = if def.mode.as_deref() == Some("hold") {
                CrossDissolvable::hold(frames, size)
            } else {
                CrossDissolvable::cycle(frames, size)
            };
            d = d.with_flip(def.flip).with_mask(mask.map(<[Vec2]>::to_vec));
            if let Some(tint) = &def.tint {
                d = d.with_tint(parse_color(tint, Color::WHITE));
            }
            spawn_dissolvable(commands, meshes, materials, (SceneEntity, tag), d, Transform::from_translation(pos.extend(z)));
        }
        ChildDef::Balloon(def) => {
            if def.initially.as_deref() == Some("shown") {
                let body = dialogue
                    .and_then(|d| d.text(&def.line))
                    .map(str::to_string)
                    .unwrap_or_else(|| format!("[missing: {}]", def.line));
                spawn_balloon(commands, art, meshes, materials, def, &body, true, mask, (SceneEntity, tag));
            }
        }
        ChildDef::Text(def) => {
            let id = text(commands, art, &def.text, def.size.unwrap_or(22.0), pos);
            let mut e = commands.entity(id);
            e.insert((
                SceneEntity,
                tag,
                TextColor(parse_color(def.color.as_deref().unwrap_or("ink"), INK)),
                Transform::from_translation(pos.extend(z)),
            ));
            if let Some(b) = def.r#box {
                e.insert(bevy::text::TextBounds::from(Vec2::new(b[0], b[1])));
            }
        }
        ChildDef::Shape(def) => {
            let size = Vec2::new(def.size[0], def.size[1]);
            let color = parse_color(def.color.as_deref().unwrap_or("ink"), INK)
                .with_alpha(def.alpha.unwrap_or(1.0));
            if def.shape == "vignette" {
                // One quad whose material holds a small-ellipse and a large-ellipse profile;
                // `BeatPulse` blends between them on every beat (see dissolve.rs).
                let inner = def.inner.unwrap_or(0.45);
                let amount = def.pulse.unwrap_or(0.05).clamp(0.0, 1.0);
                // Only the inner (light) ellipse differs between the profiles; the outer radius
                // where the darkening completes is the same, so the outermost area never changes.
                let mut material = MaskMaterial::color(color, mask);
                material.set_vignette(inner * (1.0 - amount), 1.0);
                material.set_vignette_mix(inner * (1.0 + amount), 1.0, 0.0);
                commands.spawn((
                    Mesh2d(meshes.add(Rectangle::new(size.x, size.y))),
                    MeshMaterial2d(materials.add(material)),
                    Transform::from_translation(pos.extend(z)),
                    SceneEntity,
                    tag,
                    BeatPulse,
                ));
                return;
            }
            let mesh = if def.shape == "ellipse" {
                meshes.add(Ellipse::new(size.x / 2.0, size.y / 2.0))
            } else {
                meshes.add(Rectangle::new(size.x, size.y))
            };
            commands.spawn((
                Mesh2d(mesh),
                MeshMaterial2d(materials.add(MaskMaterial::color(color, mask))),
                Transform::from_translation(pos.extend(z)),
                SceneEntity,
                tag,
            ));
        }
    }
}
