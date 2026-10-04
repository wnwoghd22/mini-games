/// Artwork cadence and blend duration are independent of movement/render frequency.
pub const POSE_SECONDS: f32 = 0.2;
pub const FADE_SECONDS: f32 = 0.1;

#[derive(Clone, Copy, Debug, Default, PartialEq, Eq)]
pub struct Pose {
    pub frame: usize,
    pub left: bool,
}

pub struct PencilAnimation {
    pub outgoing: Pose,
    pub incoming: Pose,
    pub blend: f32,
    pub pose_clock: f32,
    pub stride: usize,
}

impl Default for PencilAnimation {
    fn default() -> Self {
        Self {
            outgoing: Pose::default(),
            incoming: Pose::default(),
            blend: 1.0,
            pose_clock: 0.0,
            stride: 0,
        }
    }
}

impl PencilAnimation {
    pub fn tick(&mut self, dt: f32, walking: bool, airborne: bool, left: bool) {
        self.blend = (self.blend + dt / FADE_SECONDS).min(1.0);
        if walking && !airborne {
            self.pose_clock += dt;
            while self.pose_clock >= POSE_SECONDS {
                self.pose_clock -= POSE_SECONDS;
                self.stride = (self.stride + 1) % 2;
            }
        } else {
            self.pose_clock = 0.0;
            self.stride = 0;
        }
        let requested = Pose {
            frame: if airborne {
                3
            } else if walking {
                1 + self.stride
            } else {
                0
            },
            left,
        };
        // Finish the current fade before accepting another pose. Reversing direction or
        // releasing a key mid-fade cannot suddenly resurrect a fully opaque old frame.
        if requested != self.incoming && self.blend >= 1.0 {
            self.outgoing = self.incoming;
            self.incoming = requested;
            self.blend = 0.0;
        }
    }

    pub fn alpha(&self, outgoing: bool) -> f32 {
        let t = self.blend * self.blend * (3.0 - 2.0 * self.blend);
        if outgoing { 1.0 - t } else { t }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn rapid_direction_change_finishes_the_active_fade() {
        let mut a = PencilAnimation::default();
        a.tick(0.01, true, false, false);
        let incoming = a.incoming;
        a.tick(FADE_SECONDS * 0.4, true, false, true);
        assert_eq!(a.incoming, incoming);
        assert!((a.alpha(true) + a.alpha(false) - 1.0).abs() < 0.00001);
        assert!(a.alpha(true) > 0.0 && a.alpha(false) > 0.0);
        a.tick(FADE_SECONDS, true, false, true);
        assert!(a.incoming.left);
        assert_eq!(a.outgoing, incoming);
        assert_eq!(a.alpha(false), 0.0);
    }

    #[test]
    fn pose_and_fade_timing_do_not_depend_on_render_rate() {
        let mut slow = PencilAnimation::default();
        let mut fast = PencilAnimation::default();
        for _ in 0..15 {
            slow.tick(1.0 / 30.0, true, false, false);
        }
        for _ in 0..60 {
            fast.tick(1.0 / 120.0, true, false, false);
        }
        assert_eq!(slow.incoming.frame, fast.incoming.frame);
        assert!((slow.pose_clock - fast.pose_clock).abs() < 0.001);
    }
}
