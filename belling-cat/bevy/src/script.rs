//! Scene flow, independent of the engine.
//!
//! [`Script`] holds the triggers from the scene file. Each tick it consumes abstract input
//! and emits [`Command`]s that the scene driver turns into camera moves, balloons and
//! player moves. See FORMAT.md for the meaning of triggers and steps.

use crate::scene_file::{KeyframeDef, StepDef, TriggerDef, TriggerOn, When};
use bevy::{platform::collections::HashMap, prelude::*};

pub const DEFAULT_RANGE: f32 = 80.0;

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum After {
    NextStep,
    Explore,
}

#[derive(Clone, Copy, Debug, PartialEq)]
pub enum Phase {
    Exploring,
    Sliding(After),
    Talking,
    Waiting(f32),
}

#[derive(Clone, Copy, Debug, Default)]
pub struct ScriptInput<'a> {
    pub interact: bool,
    pub slide_done: bool,
    pub line_finished: bool,
    pub at_right_edge: bool,
    pub at_left_edge: bool,
    pub player_cut: &'a str,
    pub player_x: f32,
    pub player_facing_left: bool,
    /// Half the player's sprite width, for edge-to-edge distances.
    pub player_half_width: f32,
}

#[derive(Clone, Debug, PartialEq)]
pub enum Command {
    Focus(String),
    Path(Vec<KeyframeDef>),
    Speak(String),
    RevealLine,
    MovePlayer { cut: String, x: f32 },
}

/// Where a trigger target sits: its cut, centre x and half width, used for `range` checks.
#[derive(Clone, Debug, PartialEq)]
pub struct TargetSpot {
    pub cut: String,
    pub x: f32,
    pub half_width: f32,
}

/// Horizontal gap between two sprites' edges (0 when they overlap).
pub fn edge_gap(player_x: f32, player_half: f32, target_x: f32, target_half: f32) -> f32 {
    ((target_x - player_x).abs() - player_half - target_half).max(0.0)
}

#[derive(Debug, Clone)]
pub struct Script {
    triggers: Vec<TriggerDef>,
    fired: Vec<bool>,
    targets: HashMap<String, TargetSpot>,
    active: Option<(usize, usize)>,
    pub phase: Phase,
    read_delay: f32,
    pub flow_done: bool,
    started: bool,
    /// The cut the player is in after a `player` step in the same tick.
    player_cut: Option<String>,
}

impl Script {
    pub fn new(triggers: Vec<TriggerDef>, targets: HashMap<String, TargetSpot>) -> Self {
        Self {
            fired: vec![false; triggers.len()],
            triggers,
            targets,
            active: None,
            phase: Phase::Exploring,
            read_delay: 0.0,
            flow_done: false,
            started: false,
            player_cut: None,
        }
    }

    pub fn exploring(&self) -> bool {
        self.phase == Phase::Exploring
    }

    /// Index of the running trigger and the step about to run, for debugging and the footer.
    pub fn active(&self) -> Option<(usize, usize)> {
        self.active
    }

    /// True when the target is close enough: same cut, edge gap within `range`, and (for
    /// `require_facing`) in front of the player unless the two already overlap.
    fn within_range(&self, trigger: &TriggerDef, input: &ScriptInput, require_facing: bool) -> bool {
        let Some(id) = &trigger.target else {
            return true;
        };
        let Some(spot) = self.targets.get(id) else {
            return false;
        };
        if spot.cut != input.player_cut {
            return false;
        }
        let gap = edge_gap(input.player_x, input.player_half_width, spot.x, spot.half_width);
        if gap > trigger.range.unwrap_or(DEFAULT_RANGE) {
            return false;
        }
        if require_facing && gap > 0.0 {
            let target_is_left = spot.x < input.player_x;
            return target_is_left == input.player_facing_left;
        }
        true
    }

    fn ready(&self, index: usize, input: &ScriptInput) -> bool {
        let trigger = &self.triggers[index];
        if self.fired[index] && trigger.once {
            return false;
        }
        if trigger.when == Some(When::FlowDone) && !self.flow_done {
            return false;
        }
        match trigger.on {
            TriggerOn::Z => input.interact && self.within_range(trigger, input, true),
            TriggerOn::Near => self.within_range(trigger, input, false),
            TriggerOn::RightEdge => input.at_right_edge,
            TriggerOn::LeftEdge => input.at_left_edge,
            TriggerOn::Enter => !self.started,
        }
    }

    pub fn tick(&mut self, dt: f32, input: ScriptInput, out: &mut Vec<Command>) {
        self.read_delay = (self.read_delay - dt).max(0.0);
        self.player_cut = None;
        match self.phase {
            Phase::Exploring => {
                if self.read_delay == 0.0 {
                    let candidate = (0..self.triggers.len()).find(|&i| self.ready(i, &input));
                    if let Some(i) = candidate {
                        info!("flow: trigger {i} ({:?}) starts", self.triggers[i].on);
                        self.fired[i] = true;
                        self.active = Some((i, 0));
                        self.run_next(&input, out);
                    }
                }
                self.started = true;
            }
            Phase::Sliding(after) => {
                if input.slide_done {
                    match after {
                        After::NextStep => self.run_next(&input, out),
                        After::Explore => {
                            self.phase = Phase::Exploring;
                            self.active = None;
                            self.read_delay = 0.15;
                        }
                    }
                }
            }
            Phase::Talking => {
                if input.interact && self.read_delay == 0.0 {
                    if input.line_finished {
                        self.run_next(&input, out);
                    } else {
                        out.push(Command::RevealLine);
                    }
                }
            }
            Phase::Waiting(remaining) => {
                let left = remaining - dt;
                if left <= 0.0 {
                    self.run_next(&input, out);
                } else {
                    self.phase = Phase::Waiting(left);
                }
            }
        }
    }

    fn run_next(&mut self, input: &ScriptInput, out: &mut Vec<Command>) {
        let Some((ti, si)) = self.active else {
            self.phase = Phase::Exploring;
            return;
        };
        let Some(step) = self.triggers[ti].steps.get(si).cloned() else {
            // Steps exhausted without a return: back to exploring where the camera is.
            self.phase = Phase::Exploring;
            self.active = None;
            self.read_delay = 0.15;
            return;
        };
        self.active = Some((ti, si + 1));
        match step {
            StepDef::Focus(cut) => {
                out.push(Command::Focus(cut));
                self.phase = Phase::Sliding(After::NextStep);
            }
            StepDef::Path(frames) => {
                out.push(Command::Path(frames));
                self.phase = Phase::Sliding(After::NextStep);
            }
            StepDef::Say(balloon) => {
                out.push(Command::Speak(balloon));
                self.phase = Phase::Talking;
                // An incoming Z press must not dismiss a freshly displayed balloon.
                self.read_delay = 0.15;
            }
            StepDef::Wait(seconds) => {
                self.phase = Phase::Waiting(seconds.max(0.0));
            }
            StepDef::Player(mv) => {
                self.player_cut = Some(mv.cut.clone());
                out.push(Command::MovePlayer { cut: mv.cut, x: mv.x });
                self.run_next(input, out);
            }
            StepDef::Return(_) => {
                let home = self
                    .player_cut
                    .clone()
                    .unwrap_or_else(|| input.player_cut.to_string());
                out.push(Command::Focus(home));
                self.phase = Phase::Sliding(After::Explore);
                self.flow_done = true;
            }
        }
    }
}

#[derive(Resource, Deref, DerefMut)]
pub struct ScriptState(pub Script);

#[cfg(test)]
mod tests {
    use super::*;
    use crate::scene_file::PlayerMove;

    fn trigger(on: TriggerOn, steps: Vec<StepDef>) -> TriggerDef {
        TriggerDef {
            on,
            target: None,
            range: None,
            when: None,
            once: true,
            steps,
        }
    }

    fn script() -> Script {
        let mut targets = HashMap::new();
        targets.insert(
            "candle".to_string(),
            TargetSpot {
                cut: "main".into(),
                x: 0.0,
                half_width: 20.0,
            },
        );
        let mut z = trigger(
            TriggerOn::Z,
            vec![
                StepDef::Focus("a".into()),
                StepDef::Say("b1".into()),
                StepDef::Say("b2".into()),
                StepDef::Return(true),
            ],
        );
        z.target = Some("candle".into());
        z.range = Some(50.0);
        let mut leave = trigger(
            TriggerOn::RightEdge,
            vec![
                StepDef::Focus("exit".into()),
                StepDef::Player(PlayerMove {
                    cut: "exit".into(),
                    x: 10.0,
                }),
            ],
        );
        leave.when = Some(When::FlowDone);
        Script::new(vec![z, leave], targets)
    }

    fn input<'a>(cut: &'a str, x: f32) -> ScriptInput<'a> {
        ScriptInput {
            player_cut: cut,
            player_x: x,
            player_half_width: 70.0,
            ..default()
        }
    }

    fn press<'a>(s: &mut Script, base: ScriptInput<'a>) -> Vec<Command> {
        let mut out = Vec::new();
        s.tick(
            0.01,
            ScriptInput {
                interact: true,
                ..base
            },
            &mut out,
        );
        out
    }

    fn wait(s: &mut Script, seconds: f32, base: ScriptInput) {
        let mut out = Vec::new();
        for _ in 0..(seconds * 100.0).ceil() as usize {
            s.tick(0.01, base, &mut out);
        }
        assert!(out.is_empty(), "unexpected commands while waiting: {out:?}");
    }

    #[test]
    fn z_fires_when_facing_a_target_within_the_edge_gap() {
        // Player half width 70, candle half width 20, range 50: fires when the gap <= 50.
        let mut s = script();
        // Too far: gap = 200 - 90 = 110.
        assert!(press(&mut s, input("main", 200.0)).is_empty());
        // Other cut.
        assert!(press(&mut s, input("other", 0.0)).is_empty());
        // Close enough (gap 40) but facing away from the candle, which is to the left.
        assert!(
            press(
                &mut s,
                ScriptInput {
                    player_facing_left: false,
                    ..input("main", 130.0)
                }
            )
            .is_empty()
        );
        // Same spot, facing the candle: fires before the sprites touch.
        assert_eq!(
            press(
                &mut s,
                ScriptInput {
                    player_facing_left: true,
                    ..input("main", 130.0)
                }
            ),
            vec![Command::Focus("a".into())]
        );
        assert_eq!(s.phase, Phase::Sliding(After::NextStep));
    }

    #[test]
    fn overlapping_target_fires_regardless_of_facing() {
        let mut s = script();
        assert_eq!(
            press(
                &mut s,
                ScriptInput {
                    player_facing_left: false,
                    ..input("main", -30.0)
                }
            ),
            vec![Command::Focus("a".into())]
        );
        assert_eq!(edge_gap(0.0, 70.0, 50.0, 20.0), 0.0);
        assert_eq!(edge_gap(0.0, 70.0, 150.0, 20.0), 60.0);
    }

    #[test]
    fn steps_run_in_order_and_return_sets_flow_done() {
        let mut s = script();
        let base = input("main", 0.0);
        press(&mut s, base);
        // Input during the slide is ignored; finishing the slide speaks the first line.
        assert!(press(&mut s, base).is_empty());
        let mut out = Vec::new();
        s.tick(
            0.01,
            ScriptInput {
                slide_done: true,
                ..base
            },
            &mut out,
        );
        assert_eq!(out, vec![Command::Speak("b1".into())]);
        // Z right after a balloon appears is swallowed; then it reveals, then advances.
        assert!(press(&mut s, base).is_empty());
        wait(&mut s, 0.2, base);
        assert_eq!(press(&mut s, base), vec![Command::RevealLine]);
        let finished = ScriptInput {
            line_finished: true,
            ..base
        };
        assert_eq!(press(&mut s, finished), vec![Command::Speak("b2".into())]);
        wait(&mut s, 0.2, base);
        assert_eq!(press(&mut s, finished), vec![Command::Focus("main".into())]);
        assert!(s.flow_done);
        let mut out = Vec::new();
        s.tick(
            0.01,
            ScriptInput {
                slide_done: true,
                ..base
            },
            &mut out,
        );
        assert_eq!(s.phase, Phase::Exploring);
        // Fired once: Z near the candle does nothing now.
        wait(&mut s, 0.2, base);
        assert!(press(&mut s, base).is_empty());
    }

    #[test]
    fn edge_trigger_waits_for_flow_done_and_moves_the_player() {
        let mut s = script();
        let edge = ScriptInput {
            at_right_edge: true,
            ..input("main", 100.0)
        };
        let mut out = Vec::new();
        s.tick(0.01, edge, &mut out);
        assert!(out.is_empty());
        s.flow_done = true;
        s.tick(0.01, edge, &mut out);
        assert_eq!(out, vec![Command::Focus("exit".into())]);
        out.clear();
        s.tick(
            0.01,
            ScriptInput {
                slide_done: true,
                ..edge
            },
            &mut out,
        );
        assert_eq!(
            out,
            vec![Command::MovePlayer {
                cut: "exit".into(),
                x: 10.0
            }]
        );
        assert_eq!(s.phase, Phase::Exploring);
    }

    #[test]
    fn near_and_enter_start_without_a_key_and_wait_counts_down() {
        let mut targets = HashMap::new();
        targets.insert(
            "door".to_string(),
            TargetSpot {
                cut: "main".into(),
                x: 200.0,
                half_width: 10.0,
            },
        );
        let mut near = trigger(TriggerOn::Near, vec![StepDef::Wait(0.3), StepDef::Focus("x".into())]);
        near.target = Some("door".into());
        let enter = trigger(TriggerOn::Enter, vec![StepDef::Focus("intro".into())]);
        let mut s = Script::new(vec![near, enter], targets);
        let mut out = Vec::new();
        s.tick(0.01, input("main", 0.0), &mut out);
        assert_eq!(out, vec![Command::Focus("intro".into())]);
        out.clear();
        s.tick(0.01, ScriptInput { slide_done: true, ..input("main", 0.0) }, &mut out);
        s.tick(0.2, input("main", 0.0), &mut out);
        assert_eq!(s.phase, Phase::Exploring);
        // Gap = 200 - 60 - 70 - 10 = 60 <= 80: the near trigger starts without a key.
        s.tick(0.01, input("main", 60.0), &mut out);
        assert!(matches!(s.phase, Phase::Waiting(_)));
        s.tick(0.5, input("main", 60.0), &mut out);
        assert_eq!(out, vec![Command::Focus("x".into())]);
    }
}
