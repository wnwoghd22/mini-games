//! Simple-polygon helpers mirrored by `editor/media/polygon.ts`: ear clipping, point test,
//! bounding box and a 2D mesh for the cut background.

use bevy::{
    asset::RenderAssetUsages,
    mesh::{Indices, PrimitiveTopology},
    prelude::*,
};

/// Twice the signed area; positive when counter-clockwise (y up).
pub fn signed_area2(points: &[Vec2]) -> f32 {
    let n = points.len();
    (0..n)
        .map(|i| {
            let a = points[i];
            let b = points[(i + 1) % n];
            a.x * b.y - b.x * a.y
        })
        .sum()
}

fn cross(o: Vec2, a: Vec2, b: Vec2) -> f32 {
    (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x)
}

fn point_in_triangle(p: Vec2, a: Vec2, b: Vec2, c: Vec2) -> bool {
    let d1 = cross(a, b, p);
    let d2 = cross(b, c, p);
    let d3 = cross(c, a, p);
    let neg = d1 < 0.0 || d2 < 0.0 || d3 < 0.0;
    let pos = d1 > 0.0 || d2 > 0.0 || d3 > 0.0;
    !(neg && pos)
}

/// Ear-clipping triangulation of a simple polygon in either winding.
/// Returns index triples into `points` (counter-clockwise).
pub fn triangulate(points: &[Vec2]) -> Vec<[u32; 3]> {
    let n = points.len();
    if n < 3 {
        return Vec::new();
    }
    let mut idx: Vec<usize> = (0..n).collect();
    if signed_area2(points) < 0.0 {
        idx.reverse();
    }
    let mut out = Vec::with_capacity(n - 2);
    let mut guard = 0;
    while idx.len() > 3 && guard < n * n {
        guard += 1;
        let mut clipped = false;
        for i in 0..idx.len() {
            let ia = idx[(i + idx.len() - 1) % idx.len()];
            let ib = idx[i];
            let ic = idx[(i + 1) % idx.len()];
            let (a, b, c) = (points[ia], points[ib], points[ic]);
            if cross(a, b, c) <= 1e-6 {
                continue;
            }
            if idx
                .iter()
                .any(|&j| j != ia && j != ib && j != ic && point_in_triangle(points[j], a, b, c))
            {
                continue;
            }
            out.push([ia as u32, ib as u32, ic as u32]);
            idx.remove(i);
            clipped = true;
            break;
        }
        if !clipped {
            break;
        }
    }
    if idx.len() == 3 {
        out.push([idx[0] as u32, idx[1] as u32, idx[2] as u32]);
    }
    out
}

/// Even-odd point-in-polygon test.
pub fn contains(points: &[Vec2], p: Vec2) -> bool {
    let mut inside = false;
    let n = points.len();
    let mut j = n.wrapping_sub(1);
    for i in 0..n {
        let (pi, pj) = (points[i], points[j]);
        if (pi.y > p.y) != (pj.y > p.y) && p.x < (pj.x - pi.x) * (p.y - pi.y) / (pj.y - pi.y) + pi.x {
            inside = !inside;
        }
        j = i;
    }
    inside
}

/// Parameter `t` along `a->b` where it crosses segment `c->d`, if they cross.
fn segment_cross(a: Vec2, b: Vec2, c: Vec2, d: Vec2) -> Option<f32> {
    let r = b - a;
    let s = d - c;
    let denom = r.perp_dot(s);
    if denom.abs() < 1e-9 {
        return None;
    }
    let qp = c - a;
    let t = qp.perp_dot(s) / denom;
    let u = qp.perp_dot(r) / denom;
    ((0.0..=1.0).contains(&t) && (0.0..=1.0).contains(&u)).then_some(t)
}

/// The parts of an open polyline that lie inside `polygon`, as separate runs. Used to clip
/// gizmo ink (balloon outlines) the same way the shader clips fills.
pub fn clip_polyline(line: &[Vec2], polygon: &[Vec2]) -> Vec<Vec<Vec2>> {
    let mut runs: Vec<Vec<Vec2>> = Vec::new();
    let mut run: Vec<Vec2> = Vec::new();
    let n = polygon.len();
    for w in line.windows(2) {
        let (a, b) = (w[0], w[1]);
        let mut ts = vec![0.0];
        for i in 0..n {
            if let Some(t) = segment_cross(a, b, polygon[i], polygon[(i + 1) % n]) {
                ts.push(t);
            }
        }
        ts.push(1.0);
        ts.sort_by(|x, y| x.total_cmp(y));
        for pair in ts.windows(2) {
            let (t0, t1) = (pair[0], pair[1]);
            if t1 - t0 < 1e-6 {
                continue;
            }
            let p0 = a.lerp(b, t0);
            let p1 = a.lerp(b, t1);
            if contains(polygon, a.lerp(b, (t0 + t1) / 2.0)) {
                if run.is_empty() {
                    run.push(p0);
                }
                run.push(p1);
            } else if run.len() >= 2 {
                runs.push(std::mem::take(&mut run));
            } else {
                run.clear();
            }
        }
    }
    if run.len() >= 2 {
        runs.push(run);
    }
    runs
}

pub fn bbox(points: &[Vec2]) -> Rect {
    let mut r = Rect::from_corners(points[0], points[0]);
    for &p in points {
        r = r.union_point(p);
    }
    r
}

/// A flat mesh covering the polygon, with UVs mapped over its bounding box.
pub fn polygon_mesh(points: &[Vec2]) -> Mesh {
    let b = bbox(points);
    let size = b.size().max(Vec2::splat(1e-3));
    let positions: Vec<[f32; 3]> = points.iter().map(|p| [p.x, p.y, 0.0]).collect();
    let uvs: Vec<[f32; 2]> = points
        .iter()
        .map(|p| [(p.x - b.min.x) / size.x, 1.0 - (p.y - b.min.y) / size.y])
        .collect();
    let normals = vec![[0.0, 0.0, 1.0]; points.len()];
    let indices: Vec<u32> = triangulate(points).into_iter().flatten().collect();
    Mesh::new(
        PrimitiveTopology::TriangleList,
        RenderAssetUsages::RENDER_WORLD | RenderAssetUsages::MAIN_WORLD,
    )
    .with_inserted_attribute(Mesh::ATTRIBUTE_POSITION, positions)
    .with_inserted_attribute(Mesh::ATTRIBUTE_UV_0, uvs)
    .with_inserted_attribute(Mesh::ATTRIBUTE_NORMAL, normals)
    .with_inserted_indices(Indices::U32(indices))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn v(pts: &[(f32, f32)]) -> Vec<Vec2> {
        pts.iter().map(|&(x, y)| Vec2::new(x, y)).collect()
    }

    #[test]
    fn triangulates_convex_and_concave_in_either_winding() {
        let square = v(&[(0.0, 0.0), (10.0, 0.0), (10.0, 10.0), (0.0, 10.0)]);
        assert_eq!(triangulate(&square).len(), 2);
        let mut cw = square.clone();
        cw.reverse();
        assert_eq!(triangulate(&cw).len(), 2);
        let l = v(&[(0.0, 0.0), (0.0, 10.0), (4.0, 10.0), (4.0, 4.0), (10.0, 4.0), (10.0, 0.0)]);
        let tris = triangulate(&l);
        assert_eq!(tris.len(), 4);
        for t in &tris {
            let c = (l[t[0] as usize] + l[t[1] as usize] + l[t[2] as usize]) / 3.0;
            assert!(contains(&l, c), "centroid {c:?} outside");
        }
    }

    #[test]
    fn contains_and_bbox() {
        let l = v(&[(0.0, 0.0), (0.0, 10.0), (4.0, 10.0), (4.0, 4.0), (10.0, 4.0), (10.0, 0.0)]);
        assert!(contains(&l, Vec2::new(2.0, 8.0)));
        assert!(!contains(&l, Vec2::new(8.0, 8.0)));
        assert_eq!(bbox(&l), Rect::new(0.0, 0.0, 10.0, 10.0));
    }

    #[test]
    fn clip_polyline_keeps_the_inside_runs() {
        let square = [Vec2::new(0.0, 0.0), Vec2::new(10.0, 0.0), Vec2::new(10.0, 10.0), Vec2::new(0.0, 10.0)];
        // A line crossing the square left to right: one run from x=0 to x=10.
        let runs = clip_polyline(&[Vec2::new(-5.0, 5.0), Vec2::new(15.0, 5.0)], &square);
        assert_eq!(runs.len(), 1);
        assert!((runs[0][0] - Vec2::new(0.0, 5.0)).length() < 1e-4);
        assert!((runs[0].last().unwrap() - Vec2::new(10.0, 5.0)).length() < 1e-4);
        // A polyline that dips out and back in gives two runs.
        let zig = [Vec2::new(2.0, 2.0), Vec2::new(2.0, 15.0), Vec2::new(8.0, 15.0), Vec2::new(8.0, 2.0)];
        assert_eq!(clip_polyline(&zig, &square).len(), 2);
        // Entirely outside: nothing.
        assert!(clip_polyline(&[Vec2::new(20.0, 20.0), Vec2::new(30.0, 30.0)], &square).is_empty());
    }
}
