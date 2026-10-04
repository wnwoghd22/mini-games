# Belling the Cat — comic prototype

A Bevy 0.19 prototype of a game told across pencil-drawn comic panels. One playable kitchen panel and one interaction close-up are on the same world-space page. All in-game text is English, in Anime Ace BB (the downloaded package identifies itself as **Anime Ace 2.0 BB**).

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
| Left / Right or A / D | Walk within the kitchen panel |
| Space or Up | Jump |
| Z near the loose bell, while grounded | Inspect and slide to the sleeping-cat panel |
| Z while a line is appearing | Reveal the rest of the line |
| Z after a line is complete | Next line; after the last line, return |
| R | Restart the prototype |

Movement and jump are locked during the camera slide and dialogue. The balloon appears after arrival. The same camera slides back, preserving the player's exact position and facing. Z uses `just_pressed`, so holding it does not skip through the conversation. Inspection is repeatable.

## Pencil motion

Position and physics are updated independently from pose changes. Four transparent poses are arranged in a 2×2 atlas: idle, walk A, walk B, jump. Walking alternates two drawings at **5 poses/second**. Each replacement fades the outgoing drawing out and the incoming drawing in over **100 ms**, with a smooth opacity curve and no interpolated drawing or skeletal animation. The current blend finishes before accepting a newly requested pose or facing, preventing visible opacity pops on rapid input changes.

Adjust `POSE_SECONDS` and `FADE_SECONDS` in `src/animation.rs`. `SLIDE_SECONDS` in `src/story.rs` controls the 900 ms camera slide. Player position, dialogue state, and camera targets are separate from the artwork. This scope has a flat floor and bounds; environmental collisions, additional playable panels, and action/combat poses are future work.

## Browser preview

With `wasm32-unknown-unknown` and Trunk installed:

```powershell
rustup target add wasm32-unknown-unknown
trunk serve --address 127.0.0.1 --port 8138
```

Open `http://127.0.0.1:8138`. Click the canvas to focus the keyboard if necessary. `trunk build --release` creates a local browser build in `dist/`. Assets use relative URLs, so a subdirectory works. This prototype supports desktop keyboards; touch controls are not implemented.

```powershell
cargo test --lib --no-default-features
cargo clippy --all-targets -- -D warnings
```

Tests cover interaction range/grounding, movement lock and return position, dialogue advancement, jumping/landing, and pose blending under direction changes and different update rates. The story and animation model has no engine dependency, so these tests run without compiling or opening Bevy.

## Artwork and font

Generated artwork is saved in `assets/art/panels.png` and `assets/art/mouse-poses.png`. The backgrounds preserve each panel's original 3:4 ratio. Texture rectangles select the atlas cells at runtime without altering the generated images. `ART_DIRECTION.md` records the built-in image generation prompts.

Anime Ace BB is by Nate Piekos / Blambot. The original `assets/fonts/font info.txt` is preserved. Font files, archives, extracted packages, and local preview builds are excluded from Git. This is a local prototype, not a published font bundle. [Blambot's license page](https://blambot.com/pages/licenses) distinguishes comic usage from game embedding; obtain the appropriate rights before distributing a build that includes the font. The repository's game-code license does not apply to the font software.
