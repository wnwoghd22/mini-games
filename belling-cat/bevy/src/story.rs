#[derive(Debug, Clone, Copy, PartialEq)]
pub struct PlayerPosition {
    pub x: f32,
    pub y: f32,
}

impl PlayerPosition {
    pub fn new(x: f32, y: f32) -> Self {
        Self { x, y }
    }
}

pub const PANEL_DISTANCE: f32 = 760.0;
pub const FLOOR_Y: f32 = -276.0;
pub const BELL_X: f32 = 180.0;
pub const WALK_SPEED: f32 = 170.0;
pub const SLIDE_SECONDS: f32 = 0.9;
pub const DIALOGUE: [&str; 3] = [
    "So this is the bell...\nSmaller than I imagined.",
    "One little sound,\nand everyone will know\nwhen he is coming.",
    "All I have to do\nis get close enough...",
];

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Phase {
    Exploring,
    SlidingIn,
    Talking,
    SlidingOut,
}

#[derive(Default, Clone, Copy)]
pub struct InputFrame {
    pub axis: f32,
    pub jump: bool,
    pub interact: bool,
}

pub struct Story {
    pub phase: Phase,
    pub position: PlayerPosition,
    pub facing_left: bool,
    pub walking: bool,
    pub vertical_speed: f32,
    pub slide_elapsed: f32,
    pub line: usize,
    pub letters: f32,
    pub read_delay: f32,
}

impl Default for Story {
    fn default() -> Self {
        Self {
            phase: Phase::Exploring,
            position: PlayerPosition::new(-170.0, FLOOR_Y),
            facing_left: false,
            walking: false,
            vertical_speed: 0.0,
            slide_elapsed: 0.0,
            line: 0,
            letters: 0.0,
            read_delay: 0.0,
        }
    }
}

impl Story {
    pub fn grounded(&self) -> bool {
        self.position.y <= FLOOR_Y + 0.01 && self.vertical_speed == 0.0
    }

    pub fn near_bell(&self) -> bool {
        (self.position.x - BELL_X).abs() <= 76.0 && self.grounded()
    }

    pub fn camera_x(&self) -> f32 {
        let t = (self.slide_elapsed / SLIDE_SECONDS).clamp(0.0, 1.0);
        let eased = t * t * (3.0 - 2.0 * t);
        match self.phase {
            Phase::Exploring => 0.0,
            Phase::SlidingIn => PANEL_DISTANCE * eased,
            Phase::Talking => PANEL_DISTANCE,
            Phase::SlidingOut => PANEL_DISTANCE * (1.0 - eased),
        }
    }

    pub fn visible_text(&self) -> String {
        DIALOGUE[self.line]
            .chars()
            .take(self.letters as usize)
            .collect()
    }

    pub fn line_finished(&self) -> bool {
        self.letters as usize >= DIALOGUE[self.line].chars().count()
    }

    pub fn tick(&mut self, dt: f32, input: InputFrame) {
        self.walking = false;
        match self.phase {
            Phase::Exploring => {
                // Process interaction first: the trigger preserves the exact return position.
                if input.interact && self.near_bell() {
                    self.phase = Phase::SlidingIn;
                    self.slide_elapsed = 0.0;
                    self.line = 0;
                    self.letters = 0.0;
                    return;
                }
                self.walking = input.axis.abs() > 0.01;
                if self.walking {
                    self.facing_left = input.axis < 0.0;
                }
                self.position.x =
                    (self.position.x + input.axis * WALK_SPEED * dt).clamp(-210.0, 210.0);
                if input.jump && self.grounded() {
                    self.vertical_speed = 430.0;
                }
                if !self.grounded() {
                    self.vertical_speed -= 1150.0 * dt;
                    self.position.y += self.vertical_speed * dt;
                    if self.position.y <= FLOOR_Y {
                        self.position.y = FLOOR_Y;
                        self.vertical_speed = 0.0;
                    }
                }
            }
            Phase::SlidingIn | Phase::SlidingOut => {
                self.slide_elapsed += dt;
                if self.slide_elapsed >= SLIDE_SECONDS {
                    if self.phase == Phase::SlidingIn {
                        self.phase = Phase::Talking;
                        // An incoming Z press must not dismiss a freshly displayed balloon.
                        self.read_delay = 0.15;
                    } else {
                        self.phase = Phase::Exploring;
                    }
                }
            }
            Phase::Talking => {
                self.read_delay = (self.read_delay - dt).max(0.0);
                self.letters += dt * 36.0;
                if input.interact && self.read_delay == 0.0 {
                    if !self.line_finished() {
                        self.letters = DIALOGUE[self.line].chars().count() as f32;
                    } else if self.line + 1 < DIALOGUE.len() {
                        self.line += 1;
                        self.letters = 0.0;
                        self.read_delay = 0.12;
                    } else {
                        self.phase = Phase::SlidingOut;
                        self.slide_elapsed = 0.0;
                    }
                }
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    fn default<T: Default>() -> T {
        T::default()
    }

    fn advance(story: &mut Story, seconds: f32, input: InputFrame) {
        for _ in 0..(seconds * 100.0).ceil() as usize {
            story.tick(0.01, input);
        }
    }

    #[test]
    fn interaction_requires_proximity_and_ground() {
        let mut s = Story::default();
        let z = InputFrame {
            interact: true,
            ..default()
        };
        s.tick(0.01, z);
        assert_eq!(s.phase, Phase::Exploring);
        s.position = PlayerPosition::new(BELL_X, FLOOR_Y + 30.0);
        s.tick(0.01, z);
        assert_eq!(s.phase, Phase::Exploring);
        s.position.y = FLOOR_Y;
        s.vertical_speed = 0.0;
        s.tick(0.01, z);
        assert_eq!(s.phase, Phase::SlidingIn);
    }

    #[test]
    fn round_trip_locks_movement_and_preserves_position() {
        let mut s = Story::default();
        s.position.x = BELL_X - 20.0;
        let saved = s.position;
        s.tick(
            0.01,
            InputFrame {
                interact: true,
                ..default()
            },
        );
        let moving = InputFrame {
            axis: 1.0,
            jump: true,
            ..default()
        };
        advance(&mut s, 1.0, moving);
        assert_eq!(s.phase, Phase::Talking);
        assert_eq!(s.position, saved);
        assert_eq!(s.camera_x(), PANEL_DISTANCE);
        for _ in DIALOGUE {
            advance(&mut s, 3.0, moving);
            s.tick(
                0.01,
                InputFrame {
                    interact: true,
                    ..default()
                },
            );
        }
        assert_eq!(s.phase, Phase::SlidingOut);
        advance(&mut s, 0.91, InputFrame::default());
        assert_eq!(s.phase, Phase::Exploring);
        assert_eq!(s.position, saved);
        assert_eq!(s.camera_x(), 0.0);
        s.tick(0.01, moving);
        assert!(s.position.x > saved.x);
    }

    #[test]
    fn z_reveals_before_advancing_and_ignores_slide_input() {
        let mut s = Story::default();
        s.position.x = BELL_X;
        let z = InputFrame {
            interact: true,
            ..default()
        };
        s.tick(0.01, z);
        advance(&mut s, 0.91, z);
        assert_eq!(s.phase, Phase::Talking);
        assert_eq!(s.line, 0);
        advance(&mut s, 0.2, InputFrame::default());
        s.tick(0.01, z);
        assert!(s.line_finished());
        assert_eq!(s.line, 0);
        s.tick(0.01, z);
        assert_eq!(s.line, 1);
    }

    #[test]
    fn jump_lands_and_cannot_rejump_in_midair() {
        let mut s = Story::default();
        s.tick(
            0.01,
            InputFrame {
                jump: true,
                ..default()
            },
        );
        assert!(!s.grounded());
        let speed = s.vertical_speed;
        s.tick(
            0.01,
            InputFrame {
                jump: true,
                ..default()
            },
        );
        assert!((s.vertical_speed - (speed - 11.5)).abs() < 0.001);
        advance(&mut s, 1.0, InputFrame::default());
        assert!(s.grounded());
        assert_eq!(s.position.y, FLOOR_Y);
    }
}
