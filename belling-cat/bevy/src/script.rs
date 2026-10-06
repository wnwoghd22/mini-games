//! Scene progression, independent of the engine.
//!
//! A [`Script`] is a list of beats: focus a cut, speak a line in a cut, or return to the
//! main cut. [`Script::tick`] consumes abstract input and emits [`Command`]s that the Bevy
//! driver turns into camera slides and balloons. The driver lives in `scenes`.

use crate::{balloon::BalloonKind, cut::CutId};
use bevy::prelude::*;

#[derive(Clone, Copy, Debug, PartialEq)]
pub struct Line {
    pub cut: CutId,
    pub text: &'static str,
    pub kind: BalloonKind,
    /// Which balloon slot inside the cut (0 = first balloon shown there).
    pub slot: usize,
}

#[derive(Clone, Copy, Debug, PartialEq)]
pub enum Beat {
    Focus(CutId),
    Line(Line),
    Return,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum After {
    NextBeat,
    Explore,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Phase {
    Exploring,
    Sliding(After),
    Talking,
}

#[derive(Clone, Copy, Debug, Default)]
pub struct ScriptInput {
    pub interact: bool,
    pub slide_done: bool,
    pub line_finished: bool,
    pub at_right_edge: bool,
}

#[derive(Clone, Copy, Debug, PartialEq)]
pub enum Command {
    Focus(CutId),
    Speak(Line),
    RevealLine,
}

#[derive(Debug, Clone)]
pub struct Script {
    beats: Vec<Beat>,
    next: usize,
    pub phase: Phase,
    read_delay: f32,
    pub main: CutId,
    pub exit: CutId,
    pub meeting_done: bool,
    pub left: bool,
}

impl Script {
    pub fn new(main: CutId, exit: CutId, beats: Vec<Beat>) -> Self {
        Self {
            beats,
            next: 0,
            phase: Phase::Exploring,
            read_delay: 0.0,
            main,
            exit,
            meeting_done: false,
            left: false,
        }
    }

    pub fn exploring(&self) -> bool {
        self.phase == Phase::Exploring
    }

    pub fn tick(&mut self, dt: f32, input: ScriptInput, out: &mut Vec<Command>) {
        self.read_delay = (self.read_delay - dt).max(0.0);
        match self.phase {
            Phase::Exploring => {
                if input.interact && !self.meeting_done && self.read_delay == 0.0 {
                    self.run_next_beat(out);
                } else if input.at_right_edge && self.meeting_done && !self.left {
                    self.left = true;
                    out.push(Command::Focus(self.exit));
                    self.phase = Phase::Sliding(After::Explore);
                }
            }
            Phase::Sliding(after) => {
                if input.slide_done {
                    match after {
                        After::NextBeat => self.run_next_beat(out),
                        After::Explore => {
                            self.phase = Phase::Exploring;
                            self.read_delay = 0.15;
                        }
                    }
                }
            }
            Phase::Talking => {
                if input.interact && self.read_delay == 0.0 {
                    if input.line_finished {
                        self.run_next_beat(out);
                    } else {
                        out.push(Command::RevealLine);
                    }
                }
            }
        }
    }

    fn run_next_beat(&mut self, out: &mut Vec<Command>) {
        let beat = self.beats.get(self.next).copied().unwrap_or(Beat::Return);
        self.next += 1;
        match beat {
            Beat::Focus(cut) => {
                out.push(Command::Focus(cut));
                self.phase = Phase::Sliding(After::NextBeat);
            }
            Beat::Line(line) => {
                out.push(Command::Speak(line));
                self.phase = Phase::Talking;
                // An incoming Z press must not dismiss a freshly displayed balloon.
                self.read_delay = 0.15;
            }
            Beat::Return => {
                out.push(Command::Focus(self.main));
                self.phase = Phase::Sliding(After::Explore);
                self.meeting_done = true;
            }
        }
    }
}

#[derive(Resource, Deref, DerefMut)]
pub struct ScriptState(pub Script);

#[cfg(test)]
mod tests {
    use super::*;

    const MAIN: CutId = CutId("main");
    const A: CutId = CutId("a");
    const B: CutId = CutId("b");
    const EXIT: CutId = CutId("exit");

    fn line(cut: CutId, text: &'static str, slot: usize) -> Beat {
        Beat::Line(Line {
            cut,
            text,
            kind: BalloonKind::Speech,
            slot,
        })
    }

    fn script() -> Script {
        Script::new(
            MAIN,
            EXIT,
            vec![
                Beat::Focus(A),
                line(A, "one", 0),
                line(A, "two", 1),
                Beat::Focus(B),
                line(B, "three", 0),
                Beat::Return,
            ],
        )
    }

    fn press(s: &mut Script, extra: ScriptInput) -> Vec<Command> {
        let mut out = Vec::new();
        s.tick(
            0.01,
            ScriptInput {
                interact: true,
                ..extra
            },
            &mut out,
        );
        out
    }

    fn wait(s: &mut Script, seconds: f32) {
        let mut out = Vec::new();
        for _ in 0..(seconds * 100.0).ceil() as usize {
            s.tick(0.01, ScriptInput::default(), &mut out);
        }
        assert!(out.is_empty());
    }

    #[test]
    fn z_walks_through_focus_lines_and_return() {
        let mut s = script();
        assert_eq!(press(&mut s, default()), vec![Command::Focus(A)]);
        assert_eq!(s.phase, Phase::Sliding(After::NextBeat));
        // Input during the slide is ignored.
        assert!(press(&mut s, default()).is_empty());
        let mut out = Vec::new();
        s.tick(
            0.01,
            ScriptInput {
                slide_done: true,
                ..default()
            },
            &mut out,
        );
        assert!(matches!(out[..], [Command::Speak(Line { cut: A, slot: 0, .. })]));
        assert_eq!(s.phase, Phase::Talking);
        // Z immediately after the balloon appears is swallowed by the read delay.
        assert!(press(&mut s, default()).is_empty());
        wait(&mut s, 0.2);
        // Z while typing reveals; Z once finished advances.
        assert_eq!(press(&mut s, default()), vec![Command::RevealLine]);
        let out = press(
            &mut s,
            ScriptInput {
                line_finished: true,
                ..default()
            },
        );
        assert!(matches!(out[..], [Command::Speak(Line { cut: A, slot: 1, .. })]));
        wait(&mut s, 0.2);
        let out = press(
            &mut s,
            ScriptInput {
                line_finished: true,
                ..default()
            },
        );
        assert_eq!(out, vec![Command::Focus(B)]);
        let mut out = Vec::new();
        s.tick(
            0.01,
            ScriptInput {
                slide_done: true,
                ..default()
            },
            &mut out,
        );
        assert!(matches!(out[..], [Command::Speak(Line { cut: B, .. })]));
        wait(&mut s, 0.2);
        let out = press(
            &mut s,
            ScriptInput {
                line_finished: true,
                ..default()
            },
        );
        assert_eq!(out, vec![Command::Focus(MAIN)]);
        assert!(s.meeting_done);
        let mut out = Vec::new();
        s.tick(
            0.01,
            ScriptInput {
                slide_done: true,
                ..default()
            },
            &mut out,
        );
        assert_eq!(s.phase, Phase::Exploring);
        // The meeting does not restart.
        wait(&mut s, 0.2);
        assert!(press(&mut s, default()).is_empty());
    }

    #[test]
    fn leaving_requires_the_meeting_to_be_over() {
        let mut s = script();
        let mut out = Vec::new();
        s.tick(
            0.01,
            ScriptInput {
                at_right_edge: true,
                ..default()
            },
            &mut out,
        );
        assert!(out.is_empty());
        s.meeting_done = true;
        s.tick(
            0.01,
            ScriptInput {
                at_right_edge: true,
                ..default()
            },
            &mut out,
        );
        assert_eq!(out, vec![Command::Focus(EXIT)]);
        assert_eq!(s.phase, Phase::Sliding(After::Explore));
        assert!(s.left);
    }
}
