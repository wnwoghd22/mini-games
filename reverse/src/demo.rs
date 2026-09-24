//! 개발용 자동 플레이: `REVERSE_SCRIPT` 환경변수가 가리키는 스크립트를 시간에 맞춰 실행한다.
//!
//! 스크립트 형식(한 줄에 하나, 시각은 초):
//! `1.0 hold ArrowUp KeyZ` / `2.5 release ArrowUp` / `3.0 tap ShiftLeft` / `4.0 shot out.png` / `9.0 quit`

use bevy::app::AppExit;
use bevy::input::InputSystems;
use bevy::prelude::*;
use bevy::render::view::screenshot::{save_to_disk, Screenshot};

pub struct DemoPlugin;

impl Plugin for DemoPlugin {
    fn build(&self, app: &mut App) {
        let Ok(path) = std::env::var("REVERSE_SCRIPT") else {
            return;
        };
        let text = std::fs::read_to_string(&path).expect("demo script");
        let mut steps: Vec<(f32, Vec<String>)> = text
            .lines()
            .filter(|l| !l.trim().is_empty() && !l.trim_start().starts_with('#'))
            .map(|l| {
                let mut it = l.split_whitespace();
                let t: f32 = it.next().unwrap().parse().expect("time");
                (t, it.map(String::from).collect())
            })
            .collect();
        steps.sort_by(|a, b| a.0.total_cmp(&b.0));
        app.insert_resource(Script {
            steps,
            next: 0,
            t: 0.0,
            pending_release: Vec::new(),
            god: false,
        })
        .add_systems(PreUpdate, run.after(InputSystems));
    }
}

#[derive(Resource)]
struct Script {
    steps: Vec<(f32, Vec<String>)>,
    next: usize,
    t: f32,
    pending_release: Vec<KeyCode>,
    god: bool,
}

fn key(name: &str) -> KeyCode {
    match name {
        "ArrowUp" => KeyCode::ArrowUp,
        "ArrowDown" => KeyCode::ArrowDown,
        "ArrowLeft" => KeyCode::ArrowLeft,
        "ArrowRight" => KeyCode::ArrowRight,
        "KeyZ" => KeyCode::KeyZ,
        "KeyR" => KeyCode::KeyR,
        "Space" => KeyCode::Space,
        "ShiftLeft" => KeyCode::ShiftLeft,
        "Enter" => KeyCode::Enter,
        other => panic!("unknown key {other}"),
    }
}

fn run(
    mut commands: Commands,
    time: Res<Time>,
    mut script: ResMut<Script>,
    mut keys: ResMut<ButtonInput<KeyCode>>,
    mut exit: MessageWriter<AppExit>,
    mut virt: ResMut<Time<Virtual>>,
    mut players: Query<&mut crate::player::Player>,
    enemies: Query<Entity, With<crate::enemy::Enemy>>,
) {
    if script.god {
        for mut p in &mut players {
            p.invuln = p.invuln.max(0.5);
        }
    }
    // 이전 프레임의 tap 해제
    for k in script.pending_release.drain(..) {
        keys.release(k);
    }
    script.t += time.delta_secs();
    while script.next < script.steps.len() && script.steps[script.next].0 <= script.t {
        let args = script.steps[script.next].1.clone();
        script.next += 1;
        let Some(cmd) = args.first() else { continue };
        match cmd.as_str() {
            "hold" => {
                for k in &args[1..] {
                    let kc = key(k);
                    script.pending_release.retain(|p| *p != kc);
                    keys.press(kc);
                }
            }
            "release" => args[1..].iter().for_each(|k| keys.release(key(k))),
            "tap" => {
                for k in &args[1..] {
                    keys.press(key(k));
                    script.pending_release.push(key(k));
                }
            }
            "shot" => {
                let path = args[1].clone();
                info!("screenshot -> {path}");
                commands
                    .spawn(Screenshot::primary_window())
                    .observe(save_to_disk(path));
            }
            "god" => script.god = !script.god,
            "nuke" => {
                for e in &enemies {
                    commands.entity(e).despawn();
                }
            }
            "fast" => {
                let f: f32 = args[1].parse().unwrap_or(1.0);
                virt.set_relative_speed(f);
            }
            "quit" => {
                exit.write(AppExit::Success);
            }
            other => warn!("unknown demo command {other}"),
        }
    }
}
