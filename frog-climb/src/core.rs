//! Rendering-independent physics and reachable, seeded level generation.

pub const WIDTH: f32 = 320.0;
pub const HEIGHT: f32 = 240.0;
pub const GRAVITY: f32 = 400.0;
pub const MAX_SPEED: f32 = 260.0;
pub const HALF_FROG: f32 = 6.0;
pub const STEP: f32 = 1.0 / 120.0;
pub const GRAB_RADIUS: f32 = 20.0;

#[derive(Clone, Copy, Debug, Default, PartialEq)]
pub struct Point {
    pub x: f32,
    pub y: f32,
}

impl Point {
    pub const fn new(x: f32, y: f32) -> Self {
        Self { x, y }
    }

    pub fn length(self) -> f32 {
        self.x.hypot(self.y)
    }
}

pub fn wrap(x: f32) -> f32 {
    (x + WIDTH / 2.0).rem_euclid(WIDTH) - WIDTH / 2.0
}

pub fn distance(a: Point, b: Point) -> f32 {
    wrap(a.x - b.x).hypot(a.y - b.y)
}

pub fn launch_velocity(drag: Point) -> Option<Point> {
    if drag.length() < 8.0 || drag.y >= 0.0 {
        return None;
    }
    let power = (MAX_SPEED / drag.length()).min(3.0);
    Some(Point::new(-drag.x * power, -drag.y * power))
}

pub fn arc(start: Point, velocity: Point, t: f32) -> Point {
    Point::new(
        wrap(start.x + velocity.x * t),
        start.y + velocity.y * t - 0.5 * GRAVITY * t * t,
    )
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum PlatformKind {
    Solid,
    Fragile,
}

#[derive(Clone, Debug)]
pub struct Platform {
    pub id: u64,
    pub pos: Point,
    pub width: f32,
    pub kind: PlatformKind,
}

#[derive(Clone, Debug)]
pub struct Pickup {
    pub pos: Point,
}

#[derive(Clone, Debug)]
pub struct Grip {
    pub id: u64,
    pub pos: Point,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Support {
    Platform(u64),
    Grip(u64),
    Air,
}

#[derive(Clone, Copy, Debug)]
pub struct Frog {
    pub pos: Point,
    pub velocity: Point,
    pub support: Support,
    pub blocked_grip: Option<u64>,
}

#[derive(Clone, Copy, Debug)]
pub struct Particle {
    pub pos: Point,
    pub velocity: Point,
    pub life: f32,
    pub gold: bool,
}

#[derive(Clone, Debug)]
pub struct Transition {
    pub source: Platform,
    pub target: Platform,
    pub velocity: Point,
    pub duration: f32,
}

// Small seeded PRNG keeps generation and tests identical on native and WASM.
#[derive(Clone, Debug)]
struct Rng(u64);

impl Rng {
    fn next(&mut self) -> u32 {
        self.0 ^= self.0 << 13;
        self.0 ^= self.0 >> 7;
        self.0 ^= self.0 << 17;
        (self.0 >> 32) as u32
    }

    fn range(&mut self, lo: f32, hi: f32) -> f32 {
        lo + (hi - lo) * (self.next() as f32 / u32::MAX as f32)
    }
}

#[derive(Clone, Debug)]
pub struct World {
    pub frog: Frog,
    pub platforms: Vec<Platform>,
    pub pickups: Vec<Pickup>,
    pub grips: Vec<Grip>,
    pub particles: Vec<Particle>,
    pub camera_y: f32,
    pub max_height: f32,
    pub collected: u32,
    pub over: bool,
    pub elapsed: f32,
    frontier: Platform,
    rng: Rng,
    next_id: u64,
    rows: u32,
}

impl World {
    pub fn new(seed: u64) -> Self {
        let floor = Platform {
            id: 1,
            pos: Point::new(0.0, 0.0),
            width: WIDTH,
            kind: PlatformKind::Solid,
        };
        let mut world = Self {
            frog: Frog {
                pos: Point::new(0.0, HALF_FROG),
                velocity: Point::default(),
                support: Support::Platform(1),
                blocked_grip: None,
            },
            platforms: vec![floor.clone()],
            pickups: Vec::new(),
            grips: Vec::new(),
            particles: Vec::new(),
            camera_y: 100.0,
            max_height: 0.0,
            collected: 0,
            over: false,
            elapsed: 0.0,
            frontier: floor,
            rng: Rng(seed.max(1)),
            next_id: 2,
            rows: 0,
        };
        world.extend();
        world
    }

    fn id(&mut self) -> u64 {
        let id = self.next_id;
        self.next_id += 1;
        id
    }

    pub fn score(&self) -> u32 {
        (self.max_height / 10.0) as u32 + self.collected * 10
    }

    pub fn launch(&mut self, velocity: Point) -> bool {
        if self.over || self.frog.support == Support::Air || velocity.y <= 0.0 {
            return false;
        }
        let factor = (MAX_SPEED / velocity.length()).min(1.0);
        self.frog.velocity = Point::new(velocity.x * factor, velocity.y * factor);
        match self.frog.support {
            Support::Platform(id) => {
                if let Some(i) = self.platforms.iter().position(|p| p.id == id)
                    && self.platforms[i].kind == PlatformKind::Fragile
                {
                    let pos = self.platforms.remove(i).pos;
                    self.burst(pos, false);
                }
            }
            Support::Grip(id) => self.frog.blocked_grip = Some(id),
            Support::Air => unreachable!(),
        }
        self.frog.support = Support::Air;
        true
    }

    pub fn nearest_grip(&self) -> Option<&Grip> {
        if self.frog.support != Support::Air || self.over {
            return None;
        }
        self.grips
            .iter()
            .filter(|g| Some(g.id) != self.frog.blocked_grip)
            .filter(|g| distance(g.pos, self.frog.pos) <= GRAB_RADIUS)
            .min_by(|a, b| {
                distance(a.pos, self.frog.pos).total_cmp(&distance(b.pos, self.frog.pos))
            })
    }

    pub fn grab(&mut self) -> bool {
        let Some(grip) = self.nearest_grip().cloned() else {
            return false;
        };
        self.frog.pos = Point::new(grip.pos.x, grip.pos.y - 10.0);
        self.frog.velocity = Point::default();
        self.frog.support = Support::Grip(grip.id);
        self.track_height();
        true
    }

    pub fn release_grip(&mut self, velocity: Point) {
        if matches!(self.frog.support, Support::Grip(_)) {
            self.frog.support = Support::Air;
            self.frog.velocity = velocity;
        }
    }

    pub fn generate_next(&mut self) -> Transition {
        let source = self.frontier.clone();
        let rise = self.rng.range(28.0, 55.0);
        let vy = self.rng.range(220.0, 250.0);
        let max_vx = (MAX_SPEED * MAX_SPEED - vy * vy).sqrt();
        // Leave horizontal headroom for launches from the edges of the source platform.
        let vx = self.rng.range(-max_vx * 0.65, max_vx * 0.65);
        let duration = (vy + (vy * vy - 2.0 * GRAVITY * rise).sqrt()) / GRAVITY;
        let velocity = Point::new(vx, vy);
        let width = 48.0 + (self.rng.next() % 5) as f32 * 8.0;
        let kind = if self.rows >= 3 && self.rng.next() % 10 < 3 {
            PlatformKind::Fragile
        } else {
            PlatformKind::Solid
        };
        let target = Platform {
            id: self.id(),
            pos: Point::new(wrap(source.pos.x + vx * duration), source.pos.y + rise),
            width,
            kind,
        };
        let start = Point::new(source.pos.x, source.pos.y + HALF_FROG);
        for fraction in [0.28, 0.65] {
            let pos = arc(start, velocity, duration * fraction);
            self.pickups.push(Pickup { pos });
        }
        if self.rows >= 2 && self.rows % 3 == 2 {
            let pos = arc(start, velocity, vy / GRAVITY);
            let id = self.id();
            self.grips.push(Grip {
                id,
                pos: Point::new(pos.x, pos.y + 6.0),
            });
        }
        self.platforms.push(target.clone());
        self.frontier = target.clone();
        self.rows += 1;
        Transition {
            source,
            target,
            velocity,
            duration,
        }
    }

    fn extend(&mut self) {
        while self.frontier.pos.y < self.camera_y + HEIGHT / 2.0 + 160.0 {
            let path = self.generate_next();
            debug_assert_eq!(
                first_landing(
                    Point::new(path.source.pos.x, path.source.pos.y + HALF_FROG),
                    path.velocity,
                    path.duration + 0.001,
                    std::slice::from_ref(&path.target),
                )
                .map(|(id, _)| id),
                Some(path.target.id),
            );
        }
    }

    fn burst(&mut self, pos: Point, gold: bool) {
        for _ in 0..8 {
            self.particles.push(Particle {
                pos,
                velocity: Point::new(self.rng.range(-45.0, 45.0), self.rng.range(10.0, 65.0)),
                life: 0.45,
                gold,
            });
        }
    }

    fn track_height(&mut self) {
        self.max_height = self.max_height.max(self.frog.pos.y - HALF_FROG);
        self.camera_y = self.camera_y.max(self.frog.pos.y + 30.0);
    }

    pub fn step(&mut self, dt: f32) {
        if self.over {
            return;
        }
        self.elapsed += dt;
        for p in &mut self.particles {
            p.pos = arc(p.pos, p.velocity, dt);
            p.velocity.y -= GRAVITY * dt;
            p.life -= dt;
        }
        self.particles.retain(|p| p.life > 0.0);
        if self.frog.support == Support::Air {
            let start = self.frog.pos;
            let velocity = self.frog.velocity;
            let end = arc(start, velocity, dt);
            let landing = first_landing(start, velocity, dt, &self.platforms);
            let travel_time = landing.map_or(dt, |(_, t)| t);
            self.frog.pos = arc(start, velocity, travel_time);
            self.frog.velocity.y -= GRAVITY * dt;
            if let Some((id, _)) = landing {
                let platform = self.platforms.iter().find(|p| p.id == id).unwrap();
                self.frog.pos.y = platform.pos.y + HALF_FROG;
                self.frog.velocity = Point::default();
                self.frog.support = Support::Platform(id);
            } else {
                self.frog.pos = end;
            }
            let finish = Point::new(start.x + velocity.x * travel_time, self.frog.pos.y);
            let mut collected = Vec::new();
            self.pickups.retain(|p| {
                let hit = segment_distance(p.pos, start, finish) <= 10.0;
                if hit {
                    collected.push(p.pos);
                }
                !hit
            });
            self.collected += collected.len() as u32;
            for p in collected {
                self.burst(p, true);
            }
        }
        if let Some(id) = self.frog.blocked_grip {
            let outside = self
                .grips
                .iter()
                .find(|g| g.id == id)
                .is_none_or(|g| distance(g.pos, self.frog.pos) > GRAB_RADIUS + 8.0);
            if outside {
                self.frog.blocked_grip = None;
            }
        }
        self.track_height();
        self.over = self.frog.pos.y < self.camera_y - HEIGHT / 2.0 - 12.0;
        self.extend();
        let bottom = self.camera_y - HEIGHT / 2.0 - 60.0;
        self.platforms.retain(|p| p.pos.y >= bottom);
        self.pickups.retain(|p| p.pos.y >= bottom);
        self.grips.retain(|p| p.pos.y >= bottom);
    }

    pub fn preview(&self, velocity: Point) -> Vec<Point> {
        let mut pos = self.frog.pos;
        let mut vel = velocity;
        let mut points = Vec::new();
        for i in 0..240 {
            if let Some((_, t)) = first_landing(pos, vel, STEP, &self.platforms) {
                points.push(arc(pos, vel, t));
                break;
            }
            pos = arc(pos, vel, STEP);
            vel.y -= GRAVITY * STEP;
            if i % 6 == 0 {
                points.push(pos);
            }
            if pos.y < self.camera_y - HEIGHT / 2.0 - 12.0 {
                break;
            }
        }
        points
    }
}

fn first_landing(
    start: Point,
    velocity: Point,
    dt: f32,
    platforms: &[Platform],
) -> Option<(u64, f32)> {
    platforms
        .iter()
        .filter_map(|p| {
            let rise = p.pos.y + HALF_FROG - start.y;
            let discriminant = velocity.y * velocity.y - 2.0 * GRAVITY * rise;
            if discriminant < 0.0 {
                return None;
            }
            // The positive root is always the descending crossing, including the apex.
            let t = (velocity.y + discriminant.sqrt()) / GRAVITY;
            if t < -0.00001 || t > dt || velocity.y - GRAVITY * t > 0.0 {
                return None;
            }
            let x = start.x + velocity.x * t;
            (wrap(x - p.pos.x).abs() <= p.width / 2.0 + HALF_FROG).then_some((p.id, t.max(0.0)))
        })
        .min_by(|a, b| a.1.total_cmp(&b.1))
}

fn segment_distance(p: Point, a: Point, b: Point) -> f32 {
    let dx = b.x - a.x;
    let dy = b.y - a.y;
    let len_sq = dx * dx + dy * dy;
    [-WIDTH, 0.0, WIDTH]
        .into_iter()
        .map(|offset| {
            let x = p.x + offset;
            let t = if len_sq > 0.0 {
                (((x - a.x) * dx + (p.y - a.y) * dy) / len_sq).clamp(0.0, 1.0)
            } else {
                0.0
            };
            (x - a.x - t * dx).hypot(p.y - a.y - t * dy)
        })
        .fold(f32::INFINITY, f32::min)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn drag_is_opposite_and_capped() {
        let v = launch_velocity(Point::new(200.0, -200.0)).unwrap();
        assert!(v.x < 0.0 && v.y > 0.0);
        assert!((v.length() - MAX_SPEED).abs() < 0.001);
        assert!(launch_velocity(Point::new(1.0, -1.0)).is_none());
        assert!(launch_velocity(Point::new(0.0, 50.0)).is_none());
    }

    #[test]
    fn generated_paths_really_land_for_many_seeds() {
        for seed in 1..=100 {
            let mut generator = World::new(seed);
            for _ in 0..100 {
                let path = generator.generate_next();
                let rise = path.target.pos.y - path.source.pos.y;
                assert!((27.99..=55.01).contains(&rise));
                assert!(path.velocity.length() <= MAX_SPEED + 0.001);
                let mut run = World::new(seed);
                run.platforms = vec![path.source.clone(), path.target.clone()];
                run.pickups.clear();
                run.frog.pos = Point::new(path.source.pos.x, path.source.pos.y + HALF_FROG);
                run.frog.support = Support::Platform(path.source.id);
                run.camera_y = path.source.pos.y + 100.0;
                run.frontier.pos.y = run.camera_y + 1000.0;
                assert!(run.launch(path.velocity));
                for _ in 0..(path.duration / STEP).ceil() as usize + 2 {
                    run.step(STEP);
                    if run.frog.support != Support::Air {
                        break;
                    }
                }
                assert_eq!(
                    run.frog.support,
                    Support::Platform(path.target.id),
                    "seed {seed}"
                );
            }
        }
    }

    #[test]
    fn next_platform_is_reachable_from_both_edges() {
        for seed in 1..=50 {
            let mut generator = World::new(seed);
            for _ in 0..50 {
                let path = generator.generate_next();
                for edge in [-1.0, 1.0] {
                    let start = Point::new(
                        wrap(path.source.pos.x + edge * path.source.width / 2.0),
                        path.source.pos.y + HALF_FROG,
                    );
                    let rise = path.target.pos.y - path.source.pos.y;
                    let dx = wrap(path.target.pos.x - start.x);
                    let dx =
                        dx.signum() * (dx.abs() - path.target.width / 2.0 + HALF_FROG).max(0.0);
                    let reachable = [220.0_f32, 230.0, 240.0, 250.0, 260.0]
                        .into_iter()
                        .any(|vy| {
                            let t = (vy + (vy * vy - 2.0 * GRAVITY * rise).sqrt()) / GRAVITY;
                            let v = Point::new(dx / t, vy);
                            v.length() <= MAX_SPEED
                                && first_landing(
                                    start,
                                    v,
                                    t + 0.001,
                                    std::slice::from_ref(&path.target),
                                )
                                .is_some()
                        });
                    assert!(reachable, "seed {seed}, edge {edge}, rise {rise}, dx {dx}");
                }
            }
        }
    }

    #[test]
    fn full_generated_runs_keep_a_route_without_grips() {
        for seed in 1..=10 {
            let mut w = World::new(seed);
            for _ in 0..100 {
                let start = w.frog.pos;
                let velocity = w
                    .platforms
                    .iter()
                    .filter(|p| p.pos.y + HALF_FROG > start.y + 1.0)
                    .find_map(|p| {
                        let rise = p.pos.y + HALF_FROG - start.y;
                        let dx = wrap(p.pos.x - start.x);
                        let dx = dx.signum() * (dx.abs() - p.width / 2.0 + HALF_FROG).max(0.0);
                        [220.0_f32, 230.0, 240.0, 250.0, 260.0]
                            .into_iter()
                            .find_map(|vy| {
                                let d = vy * vy - 2.0 * GRAVITY * rise;
                                if d < 0.0 {
                                    return None;
                                }
                                let t = (vy + d.sqrt()) / GRAVITY;
                                let v = Point::new(dx / t, vy);
                                (v.length() <= MAX_SPEED).then_some(v)
                            })
                    })
                    .expect("a next platform must be reachable from the actual landing");
                assert!(w.launch(velocity));
                for _ in 0..180 {
                    w.step(STEP);
                    if w.frog.support != Support::Air || w.over {
                        break;
                    }
                }
                assert!(!w.over, "seed {seed}");
                assert!(w.frog.pos.y > start.y);
                assert!(w.platforms.len() < 24, "old platforms must be reclaimed");
            }
        }
    }

    #[test]
    fn wrap_landing_and_collecting_preserve_velocity() {
        let mut w = World::new(2);
        w.platforms = vec![Platform {
            id: 500,
            pos: Point::new(-158.0, 30.0),
            width: 48.0,
            kind: PlatformKind::Solid,
        }];
        w.pickups = vec![Pickup {
            pos: Point::new(-159.0, 37.0),
        }];
        w.frog = Frog {
            pos: Point::new(159.0, 38.0),
            velocity: Point::new(240.0, -100.0),
            support: Support::Air,
            blocked_grip: None,
        };
        w.step(STEP);
        assert!(w.frog.pos.x < -150.0);
        assert_eq!(w.frog.velocity.x, 240.0);
        w.step(STEP);
        w.step(STEP);
        assert_eq!(w.frog.support, Support::Platform(500));
        assert_eq!(w.collected, 1);
        w.step(STEP);
        assert_eq!(w.collected, 1);
    }

    #[test]
    fn fragile_only_breaks_on_launch_and_grips_can_be_reused() {
        let mut w = World::new(5);
        w.platforms[0].kind = PlatformKind::Fragile;
        w.step(STEP);
        assert!(w.platforms.iter().any(|p| p.id == 1));
        assert!(w.launch(Point::new(0.0, 200.0)));
        assert!(!w.platforms.iter().any(|p| p.id == 1));
        assert!(!w.launch(Point::new(0.0, 200.0)));
        w.grips = vec![Grip {
            id: 500,
            pos: Point::new(-159.0, 50.0),
        }];
        w.frog.pos = Point::new(159.0, 48.0);
        assert!(w.grab());
        assert_eq!(w.frog.support, Support::Grip(500));
        assert!(w.launch(Point::new(0.0, 200.0)));
        assert!(!w.grab());
        w.frog.pos.y = 100.0;
        w.step(STEP);
        w.frog.pos = Point::new(-159.0, 48.0);
        assert!(w.grab());
        assert_eq!(w.grips.len(), 1);
    }

    #[test]
    fn preview_stops_at_the_actual_landing() {
        let mut w = World::new(10);
        let v = Point::new(40.0, 250.0);
        let preview = w.preview(v);
        w.launch(v);
        for _ in 0..240 {
            w.step(STEP);
            if w.frog.support != Support::Air {
                break;
            }
        }
        assert!(distance(*preview.last().unwrap(), w.frog.pos) < 0.01);
    }

    #[test]
    fn score_is_height_plus_unique_pickups_and_falling_ends_run() {
        let mut w = World::new(1);
        w.max_height = 123.0;
        w.collected = 3;
        assert_eq!(w.score(), 42);
        w.camera_y = 300.0;
        w.frog.pos.y = 100.0;
        w.step(STEP);
        assert!(w.over);
        let fresh = World::new(2);
        assert_eq!(fresh.score(), 0);
        assert!(!fresh.over);
    }
}
