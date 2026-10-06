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
pub const PLAYER_SIZE: f32 = 142.0;
/// Height of the sprite centre above the feet.
pub const FOOT_OFFSET: f32 = 56.0;

/// Frame indices in the player's [`CrossDissolvable`].
pub const FRAME_IDLE: usize = 0;
pub const FRAME_WALK_A: usize = 1;
pub const FRAME_WALK_B: usize = 2;
pub const FRAME_JUMP: usize = 3;

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

    pub fn step(&mut self, dt: f32, axis: f32, jump: bool, cut: &Cut) {
        self.walking = axis.abs() > 0.01;
        if self.walking {
            self.facing_left = axis < 0.0;
        }
        self.x = (self.x + axis * WALK_SPEED * dt).clamp(cut.walk_min, cut.walk_max);
        if jump && self.grounded(cut.floor_y) {
            self.vertical_speed = JUMP_SPEED;
        }
        if !self.grounded(cut.floor_y) {
            self.vertical_speed -= GRAVITY * dt;
            self.y += self.vertical_speed * dt;
            if self.y <= cut.floor_y {
                self.y = cut.floor_y;
                self.vertical_speed = 0.0;
            }
        }
    }

    pub fn at_right_edge(&self, cut: &Cut) -> bool {
        self.x >= cut.walk_max - 0.5 && !self.facing_left && self.walking
    }
}

#[derive(Component, Debug)]
pub struct Player {
    pub walker: Walker,
    pub stride: usize,
    last_beat: u64,
    pub at_right_edge: bool,
}

impl Player {
    pub fn new(walker: Walker) -> Self {
        Self {
            walker,
            stride: 0,
            last_beat: 0,
            at_right_edge: false,
        }
    }

    pub fn pose_frame(&self, airborne: bool) -> usize {
        if airborne {
            FRAME_JUMP
        } else if self.walker.walking {
            FRAME_WALK_A + self.stride
        } else {
            FRAME_IDLE
        }
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
    script: Res<ScriptState>,
    tick: Res<CrossDissolveTick>,
    cuts: Query<&Cut>,
    mut player: Query<(&mut Player, &mut Transform, &mut CrossDissolvable), With<SampledMotion>>,
) {
    let Ok((mut player, mut transform, mut drawing)) = player.single_mut() else {
        return;
    };
    let Some(cut) = find_cut(cuts.iter(), focus.current) else {
        return;
    };
    let free = script.exploring() && !focus.is_sliding();
    let (axis, jump) = if free { (input.axis, input.jump) } else { (0.0, false) };
    player.walker.step(time.delta_secs(), axis, jump, cut);
    player.at_right_edge = free && player.walker.at_right_edge(cut);

    if tick.beat != player.last_beat {
        player.last_beat = tick.beat;
        player.stride = if player.walker.walking {
            (player.stride + 1) % 2
        } else {
            0
        };
    }
    let airborne = !player.walker.grounded(cut.floor_y);
    drawing.mode = DissolveMode::Hold(player.pose_frame(airborne));
    drawing.flip_x = player.walker.facing_left;
    transform.translation.x = player.walker.x;
    transform.translation.y = player.walker.y + FOOT_OFFSET;
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::cut::CutId;

    fn cut() -> Cut {
        Cut::new(CutId("c"), Vec2::ZERO, Vec2::new(570.0, 760.0))
    }

    #[test]
    fn jump_lands_and_cannot_rejump_in_midair() {
        let c = cut();
        let mut w = Walker::standing_at(0.0, c.floor_y);
        w.step(0.01, 0.0, true, &c);
        assert!(!w.grounded(c.floor_y));
        let speed = w.vertical_speed;
        w.step(0.01, 0.0, true, &c);
        assert!((w.vertical_speed - (speed - GRAVITY * 0.01)).abs() < 0.001);
        for _ in 0..100 {
            w.step(0.01, 0.0, false, &c);
        }
        assert!(w.grounded(c.floor_y));
        assert_eq!(w.y, c.floor_y);
    }

    #[test]
    fn walking_is_clamped_to_the_cut_and_flags_the_right_edge() {
        let c = cut();
        let mut w = Walker::standing_at(c.walk_max - 10.0, c.floor_y);
        for _ in 0..50 {
            w.step(0.01, 1.0, false, &c);
        }
        assert_eq!(w.x, c.walk_max);
        assert!(w.at_right_edge(&c));
        w.step(0.01, -1.0, false, &c);
        assert!(w.facing_left);
        assert!(!w.at_right_edge(&c));
    }

    #[test]
    fn pose_follows_motion_and_stride() {
        let mut p = Player::new(Walker::standing_at(0.0, 0.0));
        assert_eq!(p.pose_frame(false), FRAME_IDLE);
        assert_eq!(p.pose_frame(true), FRAME_JUMP);
        p.walker.walking = true;
        p.stride = 1;
        assert_eq!(p.pose_frame(false), FRAME_WALK_B);
    }
}
