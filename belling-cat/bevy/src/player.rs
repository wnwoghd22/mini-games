//! The player mouse: input, side-view movement and pose selection.
//!
//! Physics runs continuously in `FixedUpdate`; the drawing is sampled on the dissolve beat
//! because the player owner carries [`SampledMotion`].

use crate::{
    cut::{Cut, Focus, find_cut},
    dissolve::{CrossDissolvable, CrossDissolveTick, DissolveMode, SampledMotion},
    script::ScriptState,
};
use bevy::prelude::*;

pub const WALK_SPEED: f32 = 170.0;
pub const JUMP_SPEED: f32 = 430.0;
pub const GRAVITY: f32 = 1150.0;
pub const DEFAULT_SIZE: Vec2 = Vec2::splat(142.0);

/// Ground and side limits the player moves within, taken from the current cut.
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct Bounds {
    pub floor_y: f32,
    pub min_x: f32,
    pub max_x: f32,
}

impl Bounds {
    pub fn of(cut: &Cut) -> Option<Self> {
        let (min_x, max_x) = cut.walk_range();
        cut.floor_y.map(|floor_y| Self { floor_y, min_x, max_x })
    }
}

/// Engine-free movement state. `y` is the feet height.
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct Walker {
    pub x: f32,
    pub y: f32,
    pub facing_left: bool,
    pub walking: bool,
    pub vertical_speed: f32,
}

impl Walker {
    pub fn standing_at(x: f32, floor_y: f32) -> Self {
        Self {
            x,
            y: floor_y,
            facing_left: false,
            walking: false,
            vertical_speed: 0.0,
        }
    }

    pub fn grounded(&self, floor_y: f32) -> bool {
        self.y <= floor_y + 0.01 && self.vertical_speed == 0.0
    }

    pub fn step(&mut self, dt: f32, axis: f32, jump: bool, b: Bounds) {
        self.walking = axis.abs() > 0.01;
        if self.walking {
            self.facing_left = axis < 0.0;
        }
        self.x = (self.x + axis * WALK_SPEED * dt).clamp(b.min_x, b.max_x);
        if jump && self.grounded(b.floor_y) {
            self.vertical_speed = JUMP_SPEED;
        }
        if !self.grounded(b.floor_y) {
            self.vertical_speed -= GRAVITY * dt;
            self.y += self.vertical_speed * dt;
            if self.y <= b.floor_y {
                self.y = b.floor_y;
                self.vertical_speed = 0.0;
            }
        }
    }

    pub fn at_right_edge(&self, b: Bounds) -> bool {
        self.x >= b.max_x - 0.5 && !self.facing_left && self.walking
    }

    pub fn at_left_edge(&self, b: Bounds) -> bool {
        self.x <= b.min_x + 0.5 && self.facing_left && self.walking
    }
}

#[derive(Component, Debug)]
pub struct Player {
    pub walker: Walker,
    /// Id of the cut the player stands in.
    pub cut: String,
    pub size: Vec2,
    /// Frame layout inside the player's `CrossDissolvable`: idle, then `walk_frames` strides, then jump.
    pub walk_frames: usize,
    pub stride: usize,
    last_beat: u64,
    pub at_right_edge: bool,
    pub at_left_edge: bool,
}

impl Player {
    pub fn new(walker: Walker, cut: impl Into<String>, size: Vec2, walk_frames: usize) -> Self {
        Self {
            walker,
            cut: cut.into(),
            size,
            walk_frames: walk_frames.max(1),
            stride: 0,
            last_beat: 0,
            at_right_edge: false,
            at_left_edge: false,
        }
    }

    pub fn foot_offset(&self) -> f32 {
        self.size.y * 0.4
    }

    pub fn pose_frame(&self, airborne: bool) -> usize {
        if airborne {
            1 + self.walk_frames
        } else if self.walker.walking {
            1 + self.stride % self.walk_frames
        } else {
            0
        }
    }

    /// Puts the player on the floor of `cut` at `x`.
    pub fn place(&mut self, cut: &Cut, x: f32) {
        let floor = cut.floor_y.unwrap_or(cut.bbox.min.y);
        self.walker = Walker::standing_at(x, floor);
        self.cut = cut.id.clone();
    }
}

/// Keys gathered every render frame and consumed once per fixed step.
#[derive(Resource, Default, Debug)]
pub struct PlayerInput {
    pub axis: f32,
    pub jump: bool,
    pub interact: bool,
    pub restart: bool,
}

#[derive(SystemSet, Debug, Clone, PartialEq, Eq, Hash)]
pub enum PlayerSet {
    Move,
}

pub struct PlayerPlugin;

impl Plugin for PlayerPlugin {
    fn build(&self, app: &mut App) {
        app.init_resource::<PlayerInput>()
            .add_systems(Update, collect_input)
            .add_systems(FixedUpdate, move_player.in_set(PlayerSet::Move));
    }
}

fn collect_input(keys: Res<ButtonInput<KeyCode>>, mut input: ResMut<PlayerInput>) {
    let right = keys.pressed(KeyCode::ArrowRight) || keys.pressed(KeyCode::KeyD);
    let left = keys.pressed(KeyCode::ArrowLeft) || keys.pressed(KeyCode::KeyA);
    input.axis = i32::from(right) as f32 - i32::from(left) as f32;
    input.jump |= keys.just_pressed(KeyCode::Space) || keys.just_pressed(KeyCode::ArrowUp);
    input.interact |= keys.just_pressed(KeyCode::KeyZ);
    input.restart |= keys.just_pressed(KeyCode::KeyR);
}

/// Clears one-shot presses after the fixed step that used them.
pub fn consume_input(mut input: ResMut<PlayerInput>) {
    input.jump = false;
    input.interact = false;
    input.restart = false;
}

fn move_player(
    time: Res<Time>,
    input: Res<PlayerInput>,
    focus: Res<Focus>,
    script: Option<Res<ScriptState>>,
    tick: Res<CrossDissolveTick>,
    cuts: Query<&Cut>,
    mut player: Query<(&mut Player, &mut Transform, &mut CrossDissolvable), With<SampledMotion>>,
) {
    let Ok((mut player, mut transform, mut drawing)) = player.single_mut() else {
        return;
    };
    let Some(cut) = find_cut(cuts.iter(), &player.cut) else {
        return;
    };
    let Some(bounds) = Bounds::of(cut) else {
        return;
    };
    let exploring = script.as_ref().is_some_and(|s| s.exploring());
    let free = exploring && !focus.is_sliding();
    let (axis, jump) = if free { (input.axis, input.jump) } else { (0.0, false) };
    player.walker.step(time.delta_secs(), axis, jump, bounds);
    player.at_right_edge = free && player.walker.at_right_edge(bounds);
    player.at_left_edge = free && player.walker.at_left_edge(bounds);

    if tick.beat != player.last_beat {
        player.last_beat = tick.beat;
        player.stride = if player.walker.walking {
            (player.stride + 1) % player.walk_frames
        } else {
            0
        };
    }
    let airborne = !player.walker.grounded(bounds.floor_y);
    drawing.mode = DissolveMode::Hold(player.pose_frame(airborne));
    drawing.flip_x = player.walker.facing_left;
    transform.translation.x = player.walker.x;
    transform.translation.y = player.walker.y + player.foot_offset();
}

#[cfg(test)]
mod tests {
    use super::*;

    fn bounds() -> Bounds {
        Bounds {
            floor_y: -278.0,
            min_x: -211.0,
            max_x: 211.0,
        }
    }

    #[test]
    fn jump_lands_and_cannot_rejump_in_midair() {
        let b = bounds();
        let mut w = Walker::standing_at(0.0, b.floor_y);
        w.step(0.01, 0.0, true, b);
        assert!(!w.grounded(b.floor_y));
        let speed = w.vertical_speed;
        w.step(0.01, 0.0, true, b);
        assert!((w.vertical_speed - (speed - GRAVITY * 0.01)).abs() < 0.001);
        for _ in 0..100 {
            w.step(0.01, 0.0, false, b);
        }
        assert!(w.grounded(b.floor_y));
        assert_eq!(w.y, b.floor_y);
    }

    #[test]
    fn walking_is_clamped_and_flags_the_edges() {
        let b = bounds();
        let mut w = Walker::standing_at(b.max_x - 10.0, b.floor_y);
        for _ in 0..50 {
            w.step(0.01, 1.0, false, b);
        }
        assert_eq!(w.x, b.max_x);
        assert!(w.at_right_edge(b));
        for _ in 0..300 {
            w.step(0.01, -1.0, false, b);
        }
        assert_eq!(w.x, b.min_x);
        assert!(w.at_left_edge(b) && !w.at_right_edge(b));
    }

    #[test]
    fn pose_follows_motion_and_stride_count() {
        let mut p = Player::new(Walker::standing_at(0.0, 0.0), "c", DEFAULT_SIZE, 2);
        assert_eq!(p.pose_frame(false), 0);
        assert_eq!(p.pose_frame(true), 3);
        p.walker.walking = true;
        p.stride = 1;
        assert_eq!(p.pose_frame(false), 2);
        p.stride = 2;
        assert_eq!(p.pose_frame(false), 1);
    }
}
