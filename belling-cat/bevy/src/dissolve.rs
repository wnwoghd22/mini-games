//! Shared-beat cross-dissolve animation.
//!
//! Every animated thing on the page is drawn as two layers. On each beat of the global
//! [`CrossDissolveTick`] the incoming layer takes the next frame and the previous frame
//! becomes the outgoing layer; right after the beat the outgoing drawing fades out while the
//! incoming one fades in. Because there is a single tick, the candle, the NPCs and the player
//! all change on the same cadence. A layer pair showing the same drawing at the same place
//! does not blend, so an idle pose holds steady.
//!
//! Layers are separate entities (not children) so that a [`SampledMotion`] owner can move
//! continuously while its drawings stay at the positions sampled on the last two beats.
//! Each layer is a quad with its own [`MaskMaterial`], so a `clip: true` sprite is cut off at
//! its cut's polygon exactly like in the editor.

use crate::mask::MaskMaterial;
use bevy::prelude::*;
use std::collections::HashMap;

/// Each drawing is held this long before the next beat.
pub const POSE_SECONDS: f32 = 0.36;
/// The outgoing drawing fades out while the incoming one fades in over this time.
pub const TRANSITION_SECONDS: f32 = 0.18;
const _: () = assert!(TRANSITION_SECONDS < POSE_SECONDS);

#[derive(Resource, Default, Debug)]
pub struct CrossDissolveTick {
    /// Seconds since the last beat.
    pub clock: f32,
    pub beat: u64,
}

#[derive(Clone, Debug, PartialEq)]
pub struct Frame {
    pub image: Handle<Image>,
    /// Atlas cell as a normalised uv rect; the whole image is `(0,0)-(1,1)`.
    pub uv: Rect,
}

impl Frame {
    pub fn whole(image: Handle<Image>) -> Self {
        Self {
            image,
            uv: Rect::new(0.0, 0.0, 1.0, 1.0),
        }
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum DissolveMode {
    /// Advance to the next frame on every beat (candle flame, idle NPC).
    Cycle,
    /// Show the frame chosen by another system (the player's pose).
    Hold(usize),
}

#[derive(Component, Debug)]
pub struct CrossDissolvable {
    pub frames: Vec<Frame>,
    pub cursor: usize,
    pub mode: DissolveMode,
    pub size: Vec2,
    pub tint: Color,
    pub flip_x: bool,
    /// World-space polygon the drawings are clipped to (`clip: true`); `None` draws whole.
    pub mask: Option<Vec<Vec2>>,
}

impl CrossDissolvable {
    pub fn cycle(frames: Vec<Frame>, size: Vec2) -> Self {
        Self {
            frames,
            cursor: 0,
            mode: DissolveMode::Cycle,
            size,
            tint: Color::WHITE,
            flip_x: false,
            mask: None,
        }
    }

    pub fn hold(frames: Vec<Frame>, size: Vec2) -> Self {
        Self {
            mode: DissolveMode::Hold(0),
            ..Self::cycle(frames, size)
        }
    }

    pub fn with_tint(mut self, tint: Color) -> Self {
        self.tint = tint;
        self
    }

    pub fn with_flip(mut self, flip_x: bool) -> Self {
        self.flip_x = flip_x;
        self
    }

    pub fn with_mask(mut self, mask: Option<Vec<Vec2>>) -> Self {
        self.mask = mask;
        self
    }

    fn next_cursor(&self) -> usize {
        match self.mode {
            DissolveMode::Cycle => (self.cursor + 1) % self.frames.len().max(1),
            DissolveMode::Hold(frame) => frame.min(self.frames.len().saturating_sub(1)),
        }
    }
}

/// The owner moves continuously but its drawings only move on beats.
#[derive(Component, Default)]
pub struct SampledMotion;

/// A pulsing vignette: its [`MaskMaterial`] holds a small-ellipse profile and a large-ellipse
/// profile, and on every beat the fragment alpha is blended from one profile to the other with
/// the same smooth timing as the drawings' cross-fade. The outer edge and the centre have the
/// same alpha in both profiles, so only the ring between the two ellipses changes brightness;
/// nothing moves, nothing snaps, and the overall brightness never pulses.
#[derive(Component, Debug, Clone, Copy, Default)]
pub struct BeatPulse;

/// Blend toward the large profile during beat `beat`, `clock` seconds in: even beats fade
/// toward large, odd beats back toward small.
pub fn pulse_mix(beat: u64, clock: f32) -> f32 {
    layer_alpha(clock, !beat.is_multiple_of(2))
}

fn pulse_on_beat(
    tick: Res<CrossDissolveTick>,
    mut materials: ResMut<Assets<MaskMaterial>>,
    pulses: Query<&MeshMaterial2d<MaskMaterial>, With<BeatPulse>>,
) {
    let mix = pulse_mix(tick.beat, tick.clock);
    for handle in &pulses {
        if let Some(mut material) = materials.get_mut(&handle.0) {
            material.params.vignette2.z = mix;
        }
    }
}

#[derive(Component)]
pub struct DissolveLayer {
    pub owner: Entity,
    pub outgoing: bool,
}

/// What a layer currently shows, kept on the CPU so two layers can be compared cheaply.
#[derive(Component, Clone, Debug, Default, PartialEq)]
pub struct LayerDraw {
    pub frame: Option<Frame>,
    pub flip_x: bool,
}

/// Alpha of one layer `elapsed` seconds after a beat: a smooth cross-fade.
pub fn layer_alpha(elapsed: f32, outgoing: bool) -> f32 {
    let t = (elapsed / TRANSITION_SECONDS).clamp(0.0, 1.0);
    let incoming = t * t * (3.0 - 2.0 * t);
    if outgoing { 1.0 - incoming } else { incoming }
}

/// Spawns `owner` with the dissolvable and its two drawing layers.
pub fn spawn_dissolvable(
    commands: &mut Commands,
    meshes: &mut Assets<Mesh>,
    materials: &mut Assets<MaskMaterial>,
    owner: impl Bundle,
    dissolvable: CrossDissolvable,
    transform: Transform,
) -> Entity {
    let first = dissolvable.frames.first().cloned();
    let size = dissolvable.size;
    let tint = dissolvable.tint;
    let flip_x = dissolvable.flip_x;
    let mask = dissolvable.mask.clone();
    let id = commands
        .spawn((owner, dissolvable, transform, Visibility::Hidden))
        .id();
    let quad = meshes.add(Rectangle::new(size.x, size.y));
    for outgoing in [true, false] {
        let mut material = MaskMaterial::color(tint.with_alpha(if outgoing { 0.0 } else { 1.0 }), mask.as_deref());
        if let Some(frame) = &first {
            material.set_texture(Some(frame.image.clone()), frame.uv);
        }
        material.set_flip_x(flip_x);
        commands.spawn((
            Mesh2d(quad.clone()),
            MeshMaterial2d(materials.add(material)),
            LayerDraw {
                frame: first.clone(),
                flip_x,
            },
            Transform {
                translation: transform.translation + Vec3::Z * if outgoing { 0.0 } else { 0.5 },
                ..transform
            },
            DissolveLayer { owner: id, outgoing },
        ));
    }
    id
}

pub struct DissolvePlugin;

impl Plugin for DissolvePlugin {
    fn build(&self, app: &mut App) {
        app.init_resource::<CrossDissolveTick>()
            .add_systems(FixedUpdate, cross_dissolve)
            .add_systems(Update, (despawn_orphan_layers, pulse_on_beat));
    }
}

type LayerItem<'a> = (
    Entity,
    &'a DissolveLayer,
    &'a mut LayerDraw,
    &'a MeshMaterial2d<MaskMaterial>,
    &'a mut Transform,
);

/// Advances the shared beat and keeps every layer's frame, position, alpha and mask in step.
pub fn cross_dissolve(
    time: Res<Time>,
    mut tick: ResMut<CrossDissolveTick>,
    mut materials: ResMut<Assets<MaskMaterial>>,
    mut owners: Query<(&mut CrossDissolvable, &Transform, Has<SampledMotion>)>,
    mut layers: Query<LayerItem, Without<CrossDissolvable>>,
) {
    tick.clock += time.delta_secs();
    let mut beat = false;
    while tick.clock >= POSE_SECONDS {
        tick.clock -= POSE_SECONDS;
        tick.beat += 1;
        beat = true;
    }

    let mut pairs: HashMap<Entity, [Option<Entity>; 2]> = HashMap::new();
    for (entity, layer, _, _, _) in &layers {
        pairs.entry(layer.owner).or_default()[usize::from(layer.outgoing)] = Some(entity);
    }

    if beat {
        // The outgoing layer copies the incoming one, then the incoming layer takes the next frame.
        for (owner, [incoming, outgoing]) in &pairs {
            let Ok((mut d, owner_transform, sampled)) = owners.get_mut(*owner) else {
                continue;
            };
            let (Some(incoming), Some(outgoing)) = (incoming, outgoing) else {
                continue;
            };
            let Ok(
                [
                    (_, _, mut in_draw, _, mut in_transform),
                    (_, _, mut out_draw, _, mut out_transform),
                ],
            ) = layers.get_many_mut([*incoming, *outgoing])
            else {
                continue;
            };
            *out_draw = in_draw.clone();
            out_transform.translation = in_transform.translation - Vec3::Z * 0.5;
            out_transform.scale = in_transform.scale;

            d.cursor = d.next_cursor();
            if let Some(frame) = d.frames.get(d.cursor) {
                in_draw.frame = Some(frame.clone());
            }
            in_draw.flip_x = d.flip_x;
            if sampled {
                in_transform.translation = owner_transform.translation + Vec3::Z * 0.5;
                in_transform.scale = owner_transform.scale;
            }
        }
    }

    for (_, layer, _, _, mut transform) in &mut layers {
        let Ok((_, owner_transform, sampled)) = owners.get(layer.owner) else {
            continue;
        };
        if !sampled {
            transform.translation =
                owner_transform.translation + Vec3::Z * if layer.outgoing { 0.0 } else { 0.5 };
            transform.scale = owner_transform.scale;
        }
    }

    for (owner, [incoming, outgoing]) in &pairs {
        let Ok((d, _, _)) = owners.get(*owner) else {
            continue;
        };
        let (Some(incoming), Some(outgoing)) = (incoming, outgoing) else {
            continue;
        };
        let Ok([(_, _, in_draw, in_mat, in_transform), (_, _, out_draw, out_mat, out_transform)]) =
            layers.get_many_mut([*incoming, *outgoing])
        else {
            continue;
        };
        let same_drawing = *in_draw == *out_draw
            && in_transform.translation.truncate() == out_transform.translation.truncate();
        let (alpha_in, alpha_out) = if same_drawing {
            (1.0, 0.0)
        } else {
            (layer_alpha(tick.clock, false), layer_alpha(tick.clock, true))
        };
        for (draw, handle, alpha) in [(in_draw, in_mat, alpha_in), (out_draw, out_mat, alpha_out)] {
            let Some(mut material) = materials.get_mut(&handle.0) else {
                continue;
            };
            material.set_tint(d.tint.with_alpha(alpha));
            material.set_texture(draw.frame.as_ref().map(|f| f.image.clone()), draw.frame.as_ref().map(|f| f.uv).unwrap_or(Rect::new(0.0, 0.0, 1.0, 1.0)));
            material.set_flip_x(draw.flip_x);
            material.set_mask(d.mask.as_deref());
        }
    }
}

fn despawn_orphan_layers(
    mut commands: Commands,
    layers: Query<(Entity, &DissolveLayer)>,
    owners: Query<(), With<CrossDissolvable>>,
) {
    for (entity, layer) in &layers {
        if owners.get(layer.owner).is_err() {
            commands.entity(entity).despawn();
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn layers_cross_fade_and_settle_before_the_next_beat() {
        assert_eq!(layer_alpha(0.0, true), 1.0);
        assert_eq!(layer_alpha(0.0, false), 0.0);
        let mid_out = layer_alpha(TRANSITION_SECONDS / 2.0, true);
        let mid_in = layer_alpha(TRANSITION_SECONDS / 2.0, false);
        assert!(mid_out > 0.0 && mid_out < 1.0);
        assert!((mid_in + mid_out - 1.0).abs() < 1e-6);
        assert_eq!(layer_alpha(TRANSITION_SECONDS, false), 1.0);
        assert_eq!(layer_alpha(POSE_SECONDS, true), 0.0);
    }

    #[test]
    fn pulse_mix_fades_toward_large_on_even_beats_and_back_on_odd() {
        assert_eq!(pulse_mix(0, 0.0), 0.0);
        assert_eq!(pulse_mix(0, TRANSITION_SECONDS), 1.0);
        assert_eq!(pulse_mix(0, POSE_SECONDS), 1.0);
        assert_eq!(pulse_mix(1, 0.0), 1.0);
        assert_eq!(pulse_mix(1, TRANSITION_SECONDS), 0.0);
        let mid = pulse_mix(2, TRANSITION_SECONDS / 2.0);
        assert!(mid > 0.0 && mid < 1.0);
    }

    #[test]
    fn cycle_and_hold_pick_the_next_frame() {
        let frames = vec![Frame::whole(Handle::default()); 3];
        let mut d = CrossDissolvable::cycle(frames.clone(), Vec2::ONE);
        d.cursor = 2;
        assert_eq!(d.next_cursor(), 0);
        let mut h = CrossDissolvable::hold(frames, Vec2::ONE);
        h.mode = DissolveMode::Hold(7);
        assert_eq!(h.next_cursor(), 2);
    }
}
