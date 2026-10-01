# Frog Climb

A pixel platform game built with Rust, Bevy and Trunk.

```powershell
cd frog-climb
trunk serve --open
```

Click or press Enter to start. Hold the left mouse button anywhere, pull down and
back, then release to jump in the opposite direction. Land before the next jump.
The left and right sides of the pond wrap. While airborne, click anywhere when a
ring lights up to grab it; use a new drag to jump from the ring. Rings are reusable.
Cracked platforms disappear when you jump from them.

P or Escape pauses, the right mouse button cancels aiming, and R restarts.
Falling below the camera ends the run. Every ten pixels of maximum height earns
one point, and each collectible earns ten. The browser saves the best score in
local storage; if storage is unavailable, the best remains for the current session.
Native builds keep the best score for the current session.

```powershell
cargo test
trunk build
```

Deploy the contents of `dist/` beneath `frog-climb/`. Trunk uses relative asset URLs.
The parent collection link expects `../index.html`.

Physics uses a 120 Hz timestep, gravity of 400 px/s², and a maximum launch speed of
260 px/s. Each generated platform has a simulated descending landing from the
previous platform, with a rise of 28–55 pixels. No ring is required for that route.
The logical viewport is 320×240; all artwork is generated from pixel patterns.
