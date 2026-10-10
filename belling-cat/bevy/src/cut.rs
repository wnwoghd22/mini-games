//! Cuts: polygon panels laid out on the page, and the camera that focuses one of them.
//!
//! A [`Cut`] is a simple polygon in world space. [`Focus`] drives the camera along a short
//! track of keyframes: a slide to a cut's bounding box, or a free camera `path` from the
//! scene file. Text with [`FollowCamera`] stays at a fixed screen offset.

use crate::{
    polygon,
    scene_file::{Ease, KeyframeDef},
};
use bevy::{camera::ScalingMode, prelude::*};

pub const VIEW: Vec2 = Vec2::new(1080.0, 940.0);
/// Fraction of the view height the focused cut's bounding box fills.
const FILL: f32 = 760.0 / 940.0;
pub const SLIDE_SECONDS: f32 = 0.9;

#[derive(Component, Clone, Debug)]
pub struct Cut {
    pub id: String,
    pub polygon: Vec<Vec2>,
    pub bbox: Rect,
    /// World y of the ground the player stands on; `None` means the player cannot enter.
    pub floor_y: Option<f32>,
    /// World x range the player may walk within (defaults to the bounding box).
    pub walk: Option<(f32, f32)>,
}

impl Cut {
    pub fn new(id: impl Into<String>, polygon: Vec<Vec2>, floor_y: Option<f32>, walk: Option<(f32, f32)>) -> Self {
        let bbox = polygon::bbox(&polygon);
        Self {
            id: id.into(),
            polygon,
            bbox,
            floor_y,
            walk,
        }
    }

    pub fn center(&self) -> Vec2 {
        self.bbox.center()
    }

    /// Camera zoom that fits this cut the way the main panel fits the default view.
    pub fn zoom(&self) -> f32 {
        let size = self.bbox.size();
        (size.x / VIEW.x).max(size.y / VIEW.y) / FILL
    }

    pub fn walk_range(&self) -> (f32, f32) {
        self.walk.unwrap_or((self.bbox.min.x, self.bbox.max.x))
    }

    pub fn camera(&self) -> (Vec2, f32) {
        (self.center(), self.zoom())
    }
}

/// Marks every entity a cut spawned (frame, fill, children) with the cut's id, so the cut can
/// be hidden and revealed as a whole.
#[derive(Component, Clone, Debug, PartialEq, Eq)]
pub struct InCut(pub String);

/// On a [`Cut`] entity: not drawn yet. Removed the first time the camera focuses the cut.
#[derive(Component, Clone, Copy, Debug, Default)]
pub struct CutHidden;

pub fn find_cut<'a>(cuts: impl IntoIterator<Item = &'a Cut>, id: &str) -> Option<&'a Cut> {
    cuts.into_iter().find(|c| c.id == id)
}

#[derive(Clone, Copy, Debug)]
struct Key {
    cam: (Vec2, f32),
    t: f32,
    ease: Ease,
}

#[derive(Resource, Debug)]
pub struct Focus {
    /// Id of the cut the camera last slid to (free paths keep the previous id).
    pub current: String,
    track: Vec<Key>,
    elapsed: f32,
}

impl Default for Focus {
    fn default() -> Self {
        Self {
            current: String::new(),
            track: vec![Key {
                cam: (Vec2::ZERO, 1.0),
                t: 0.0,
                ease: Ease::Linear,
            }],
            elapsed: 0.0,
        }
    }
}

impl Focus {
    /// Jump to a cut without sliding.
    pub fn snap(&mut self, cut: &Cut) {
        self.current = cut.id.clone();
        self.track = vec![Key {
            cam: cut.camera(),
            t: 0.0,
            ease: Ease::Linear,
        }];
        self.elapsed = 0.0;
    }

    /// Slide from wherever the camera is now to the cut.
    pub fn go(&mut self, cut: &Cut) {
        if cut.id == self.current && !self.is_sliding() {
            return;
        }
        self.current = cut.id.clone();
        let start = self.camera();
        self.track = vec![
            Key {
                cam: start,
                t: 0.0,
                ease: Ease::Linear,
            },
            Key {
                cam: cut.camera(),
                t: SLIDE_SECONDS,
                ease: Ease::Smooth,
            },
        ];
        self.elapsed = 0.0;
    }

    /// Follow a free camera path starting from the current camera.
    pub fn go_path(&mut self, frames: &[KeyframeDef]) {
        let start = self.camera();
        let mut track = vec![Key {
            cam: start,
            t: 0.0,
            ease: Ease::Linear,
        }];
        let mut last_t = 0.0;
        for f in frames {
            let t = f.t.max(last_t);
            track.push(Key {
                cam: (Vec2::new(f.x, f.y), f.zoom.max(0.01)),
                t,
                ease: f.ease.unwrap_or_default(),
            });
            last_t = t;
        }
        self.track = track;
        self.elapsed = 0.0;
    }

    pub fn is_sliding(&self) -> bool {
        self.elapsed < self.end_time()
    }

    fn end_time(&self) -> f32 {
        self.track.last().map(|k| k.t).unwrap_or(0.0)
    }

    pub fn advance(&mut self, dt: f32) {
        self.elapsed = (self.elapsed + dt).min(self.end_time().max(0.0));
    }

    /// Current camera centre and zoom.
    pub fn camera(&self) -> (Vec2, f32) {
        let mut prev = self.track[0];
        for key in &self.track[1..] {
            if self.elapsed < key.t {
                let span = (key.t - prev.t).max(1e-6);
                let t = ((self.elapsed - prev.t) / span).clamp(0.0, 1.0);
                let e = match key.ease {
                    Ease::Linear => t,
                    Ease::Smooth => t * t * (3.0 - 2.0 * t),
                };
                return (
                    prev.cam.0.lerp(key.cam.0, e),
                    prev.cam.1 + (key.cam.1 - prev.cam.1) * e,
                );
            }
            prev = *key;
        }
        prev.cam
    }
}

#[derive(Component)]
pub struct ComicCamera;

/// Screen-space offset (in default-zoom units) of page furniture such as the title.
#[derive(Component)]
pub struct FollowCamera(pub Vec2);

pub struct CutPlugin;

impl Plugin for CutPlugin {
    fn build(&self, app: &mut App) {
        app.init_resource::<Focus>()
            .add_systems(Startup, spawn_camera)
            .add_systems(Update, slide_camera);
    }
}

fn spawn_camera(mut commands: Commands) {
    commands.spawn((
        Camera2d,
        Projection::Orthographic(OrthographicProjection {
            scaling_mode: ScalingMode::AutoMin {
                min_width: VIEW.x,
                min_height: VIEW.y,
            },
            ..OrthographicProjection::default_2d()
        }),
        ComicCamera,
    ));
}

fn slide_camera(
    time: Res<Time>,
    mut focus: ResMut<Focus>,
    mut camera: Single<(&mut Transform, &mut Projection), With<ComicCamera>>,
    mut furniture: Query<(&FollowCamera, &mut Transform), Without<ComicCamera>>,
) {
    focus.advance(time.delta_secs());
    let (center, zoom) = focus.camera();
    let (transform, projection) = &mut *camera;
    transform.translation.x = center.x;
    transform.translation.y = center.y;
    if let Projection::Orthographic(ortho) = &mut **projection {
        ortho.scale = zoom;
    }
    for (offset, mut transform) in &mut furniture {
        transform.translation.x = center.x + offset.0.x * zoom;
        transform.translation.y = center.y + offset.0.y * zoom;
        transform.scale = Vec3::splat(zoom);
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn rect(id: &str, center: Vec2, size: Vec2) -> Cut {
        let h = size / 2.0;
        Cut::new(
            id,
            vec![
                center + Vec2::new(-h.x, h.y),
                center + Vec2::new(h.x, h.y),
                center + Vec2::new(h.x, -h.y),
                center + Vec2::new(-h.x, -h.y),
            ],
            None,
            None,
        )
    }

    #[test]
    fn slide_eases_between_cuts_and_reports_completion() {
        let a = rect("a", Vec2::ZERO, Vec2::new(570.0, 760.0));
        let b = rect("b", Vec2::new(400.0, 560.0), Vec2::splat(420.0));
        let mut f = Focus::default();
        f.snap(&a);
        assert!(!f.is_sliding());
        assert_eq!(f.camera(), (Vec2::ZERO, 1.0));
        f.go(&b);
        assert!(f.is_sliding());
        f.advance(SLIDE_SECONDS / 2.0);
        let (c, z) = f.camera();
        assert_eq!(c, Vec2::new(200.0, 280.0));
        assert!(z < 1.0 && z > b.zoom());
        f.advance(SLIDE_SECONDS);
        assert!(!f.is_sliding());
        assert_eq!(f.camera().0, b.center());
        assert_eq!(f.current, "b");
    }

    #[test]
    fn free_path_visits_keyframes_in_order() {
        let a = rect("a", Vec2::ZERO, Vec2::new(570.0, 760.0));
        let mut f = Focus::default();
        f.snap(&a);
        f.go_path(&[
            KeyframeDef { x: 100.0, y: 0.0, zoom: 1.0, t: 1.0, ease: Some(Ease::Linear) },
            KeyframeDef { x: 100.0, y: 200.0, zoom: 0.5, t: 3.0, ease: Some(Ease::Linear) },
        ]);
        f.advance(0.5);
        assert_eq!(f.camera().0, Vec2::new(50.0, 0.0));
        f.advance(1.5);
        let (c, z) = f.camera();
        assert_eq!(c, Vec2::new(100.0, 100.0));
        assert!((z - 0.75).abs() < 1e-6);
        f.advance(5.0);
        assert!(!f.is_sliding());
        assert_eq!(f.camera(), (Vec2::new(100.0, 200.0), 0.5));
    }

    #[test]
    fn wide_panel_zooms_by_width() {
        let wide = rect("w", Vec2::ZERO, Vec2::new(1400.0, 400.0));
        assert!((wide.zoom() - 1400.0 / VIEW.x / FILL).abs() < 1e-6);
    }
}
