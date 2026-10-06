//! Cuts: panels laid out on the page, and the camera that focuses one of them.
//!
//! A [`Cut`] is a rectangle in world space. [`Focus`] names the cut the player should be
//! looking at; the camera slides to its centre and zooms so the panel fills the view the way
//! the main panel does. Text with [`FollowCamera`] stays at a fixed screen offset.

use bevy::{camera::ScalingMode, prelude::*};

pub const VIEW: Vec2 = Vec2::new(1080.0, 940.0);
/// Fraction of the view height the focused cut fills.
const FILL: f32 = 760.0 / 940.0;
pub const SLIDE_SECONDS: f32 = 0.9;

#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash)]
pub struct CutId(pub &'static str);

#[derive(Component, Clone, Debug)]
pub struct Cut {
    pub id: CutId,
    pub center: Vec2,
    pub size: Vec2,
    /// World y of the ground the player stands on inside this cut.
    pub floor_y: f32,
    /// World x range the player may walk within.
    pub walk_min: f32,
    pub walk_max: f32,
}

impl Cut {
    pub fn new(id: CutId, center: Vec2, size: Vec2) -> Self {
        Self {
            id,
            center,
            size,
            floor_y: center.y - size.y * 0.34,
            walk_min: center.x - size.x * 0.37,
            walk_max: center.x + size.x * 0.37,
        }
    }

    /// Camera zoom that fits this cut the way the main panel fits the default view.
    pub fn zoom(&self) -> f32 {
        (self.size.x / VIEW.x).max(self.size.y / VIEW.y) / FILL
    }

    pub fn left(&self) -> f32 {
        self.center.x - self.size.x / 2.0
    }
    pub fn bottom(&self) -> f32 {
        self.center.y - self.size.y / 2.0
    }
}

pub fn find_cut<'a>(cuts: impl IntoIterator<Item = &'a Cut>, id: CutId) -> Option<&'a Cut> {
    cuts.into_iter().find(|c| c.id == id)
}

#[derive(Resource, Debug)]
pub struct Focus {
    pub current: CutId,
    from: (Vec2, f32),
    to: (Vec2, f32),
    elapsed: f32,
}

impl Default for Focus {
    fn default() -> Self {
        Self {
            current: CutId(""),
            from: (Vec2::ZERO, 1.0),
            to: (Vec2::ZERO, 1.0),
            elapsed: SLIDE_SECONDS,
        }
    }
}

impl Focus {
    /// Jump to a cut without sliding.
    pub fn snap(&mut self, cut: &Cut) {
        self.current = cut.id;
        self.to = (cut.center, cut.zoom());
        self.from = self.to;
        self.elapsed = SLIDE_SECONDS;
    }

    /// Start a slide from wherever the camera is now.
    pub fn go(&mut self, cut: &Cut) {
        if cut.id == self.current && !self.is_sliding() {
            return;
        }
        self.from = self.camera();
        self.to = (cut.center, cut.zoom());
        self.current = cut.id;
        self.elapsed = 0.0;
    }

    pub fn is_sliding(&self) -> bool {
        self.elapsed < SLIDE_SECONDS
    }

    pub fn advance(&mut self, dt: f32) {
        self.elapsed = (self.elapsed + dt).min(SLIDE_SECONDS);
    }

    /// Current camera centre and zoom.
    pub fn camera(&self) -> (Vec2, f32) {
        let t = (self.elapsed / SLIDE_SECONDS).clamp(0.0, 1.0);
        let eased = t * t * (3.0 - 2.0 * t);
        (
            self.from.0.lerp(self.to.0, eased),
            self.from.1 + (self.to.1 - self.from.1) * eased,
        )
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

    #[test]
    fn slide_eases_between_cuts_and_reports_completion() {
        let a = Cut::new(CutId("a"), Vec2::ZERO, Vec2::new(570.0, 760.0));
        let b = Cut::new(CutId("b"), Vec2::new(400.0, 560.0), Vec2::splat(420.0));
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
        assert_eq!(f.camera().0, b.center);
        assert_eq!(f.current, CutId("b"));
    }

    #[test]
    fn main_panel_has_unit_zoom() {
        let a = Cut::new(CutId("a"), Vec2::ZERO, Vec2::new(570.0, 760.0));
        assert!((a.zoom() - 1.0).abs() < 1e-6);
    }
}
