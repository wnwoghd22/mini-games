# Belling the Cat — comic prototype

A Bevy 0.19 prototype of a game told across pencil-drawn comic panels ("cuts"). The first scene is a dark council room: a candle on a table, two council mice beside it and the player on the left. All in-game text is English, in Anime Ace BB (the downloaded package identifies itself as **Anime Ace 2.0 BB**).

From the repository root:

```powershell
cd belling-cat/bevy
cargo run
```

The Anime Ace BB font is already installed locally at `assets/fonts/AnimeAceBB.ttf`. A fresh clone needs its own copy of the regular TTF at that path. Obtain it from [the author's Anime Ace BB listing](https://www.dafont.com/anime-ace-bb.font); use the regular `animeace2_reg.ttf` from that package, renamed to `AnimeAceBB.ttf`. The game exits with a useful message if the native font file is missing.

The original JavaScript version remains at `belling-cat/index.html` while this new concept is evaluated.

## Play

| Key | Action |
| --- | --- |
| Left / Right or A / D | Walk within the current cut |
| Space or Up | Jump |
| Z in the council room | Listen: the camera slides to the elder's close-up |
| Z while a line is appearing | Reveal the rest of the line |
| Z after a line is complete | Next line / next cut; the last line returns to the room |
| Walk off the right edge after the meeting | Slide to the door cut |
| R | Restart the scene |
| F12 (native only) | Save a screenshot to `verification/` |

Movement is locked while the camera slides and while a balloon is active. Balloons stay on the page once shown, so returning to a close-up shows what was said there.

## Modules (`src/`)

| Module | Role |
| --- | --- |
| `art` | Asset handles, loading, atlas cell rectangles, code-generated placeholder textures (candle, table) |
| `dissolve` | `CrossDissolveTick` resource + `FixedUpdate` `cross_dissolve` system + `CrossDissolvable` component |
| `cut` | `Cut` panels on the page, `Focus` camera slide/zoom, `FollowCamera` page text |
| `balloon` | `SpeechBalloon` spawn, typewriter, hand-inked outline |
| `player` | Input, side-view walking/jumping, pose selection |
| `script` | Engine-free scene progression (`Beat`s → `Command`s), unit-tested |
| `ink` | Gizmo outlines for cuts and balloons, title and footer hints |
| `scenes` | Script driver, restart, and `scenes::meeting_room` (the first scene) |

## Pencil motion

Every animated drawing — the candle flame, the council mice, the player — is a `CrossDissolvable` owning two sprite layers. One global `CrossDissolveTick` beats every 360 ms in `FixedUpdate`; on each beat every drawing swaps to its next frame, and right after the beat the old drawing fades out while the new one fades in over 180 ms. A pair showing the same drawing at the same place does not blend, so an idle pose holds steady. Because there is one tick, everything on the page changes on the same cadence. `Cycle` drawings loop their frames (candle, NPCs); the player uses `Hold` so its pose (idle / two walk strides / jump) is chosen by `player.rs`, and its `SampledMotion` marker keeps the drawings at the positions sampled on the last two beats while the physics underneath stays continuous.

Timing constants live in `src/dissolve.rs`; `SLIDE_SECONDS` in `src/cut.rs` controls the 900 ms camera slide.

## Browser preview

With `wasm32-unknown-unknown` and Trunk installed:

```powershell
rustup target add wasm32-unknown-unknown
trunk serve --address 127.0.0.1 --port 8138
```

Open `http://127.0.0.1:8138`. Click the canvas to focus the keyboard if necessary. `trunk build --release` creates a local browser build in `dist/`. Assets use relative URLs, so a subdirectory works. This prototype supports desktop keyboards; touch controls are not implemented.

```powershell
cargo test
cargo clippy --all-targets -- -D warnings
```

`tools/shot.ps1` posts key presses to the running window (without stealing focus) and captures it, e.g. `powershell -File tools/shot.ps1 -keys "z,z,f12" -waitMs 2000 -out x.png`; F12 inside the game writes a real frame to `verification/`.

Tests cover the cross-fade curve, frame cycling, camera slide easing, typewriter reveal, walking/jumping bounds, and the script's beat progression (slide locks, read delay, persistent balloons, leaving only after the meeting).

## Artwork and font

Generated artwork is saved in `assets/art/mouse-poses.png` and `assets/art/mouse-walk-poses.png` (`panels.png` belongs to the earlier kitchen prototype and is no longer used). The candle and table are rasterised in code until drawings exist; `ART_DIRECTION.md` records the prompts and the file layouts expected for `candle.png`, `table.png` and `meeting-room.png`. Point the `*_ART` constants in `src/art.rs` at the files to use them.

Anime Ace BB is by Nate Piekos / Blambot. The original `assets/fonts/font info.txt` is preserved. Font files, archives, extracted packages, and local preview builds are excluded from Git. This is a local prototype, not a published font bundle. [Blambot's license page](https://blambot.com/pages/licenses) distinguishes comic usage from game embedding; obtain the appropriate rights before distributing a build that includes the font. The repository's game-code license does not apply to the font software.
