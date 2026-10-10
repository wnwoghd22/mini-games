# Belling the Cat — Cut Editor (VS Code extension)

A 2D editor for `*.scene.json` files (see `../FORMAT.md`). Polygon cuts, the Z-driven flow and camera paths are edited on a canvas; every change is written back to the JSON document through a normal workspace edit, so Undo/Redo and git diffs work as usual.

## Install

```powershell
cd belling-cat/editor
npm install
npm run install-ext
```

This builds the extension, packages it as `belling-cat-cut-editor-<version>.vsix` and installs it into VS Code (`code --install-extension … --force`). Reload VS Code windows that were already open. From then on any `*.scene.json` opens in the Cut Editor. Two cases still show the plain text editor: a tab that was restored from a previous session, and a file passed on the command line at startup before extensions have loaded. In both cases run **Belling the Cat: Open Cut Editor** from the command palette (or right-click the file → *Open With… → Cut Editor*); VS Code remembers the choice afterwards. `belling-cat/.vscode/settings.json` also pins `*.scene.json` to the Cut Editor for this workspace.

Right-click a file → *Open With…* switches between the editor and the text view; right-click a file → *Open With…* to switch between the editor and the text view, and the **JSON** button opens the text beside the canvas. Re-run `npm run install-ext` after changing the editor's code.

For editor development without reinstalling: open the `editor` folder itself in VS Code and press **F5** ("Run Cut Editor"); a second window appears with the `belling-cat` folder and the development build.

Without VS Code: `npm run dev` serves the same webview at `http://127.0.0.1:8139/` against the files in `bevy/assets/scenes/` (edits are written straight to disk). `/?run=<scenario>` replays a scripted interaction from `dev/scenarios.js`; this is what the headless checks use.

`npm test` runs the triangulation, formatter and dialogue-parser tests. `npm run package` builds a `.vsix` to install permanently.

## Editing

| Action | How |
| --- | --- |
| Pan / zoom | Drag empty space or middle-drag; mouse wheel |
| Draw a cut | `P` (or **Draw cut**), click vertices, Enter / double-click / click the first vertex to close; Esc cancels, Backspace removes the last point |
| Select a cut | Click inside it, or in the **Cuts** list |
| Move a cut | Drag inside it (children, floor and walk range move with it) |
| Move a vertex | Drag its handle; Delete removes it (a cut keeps at least 3) |
| Snapping | While drawing or dragging, vertices snap to the other vertices of the polygon and of every other cut (so edges become exactly vertical/horizontal), children snap by centre and edges to the cut's bbox, floor, walk range, siblings and the player, and a whole cut snaps to other cuts. Cyan guide lines show the match. Hold **Alt** to disable, **Shift** to constrain the drag to one axis |
| Insert a vertex | Click on an edge of the selected cut |
| Floor / walk range | Tick **floor** in the Cut panel, then drag the green centre handle (floor height) or end handles (walk range) |
| Flow mode | **Flow** button or `F`. Each trigger is drawn on the scene as a graph: node 0 is the entry (a diamond at its target object, the player start, or the walk edge), nodes 1…n are the steps at the places they act on (balloon, cut centre, keyframe, player destination), joined by arrows. Click a node to select it; new steps are inserted right after the selected node (or at the end) |
| Flow: add steps | Click a balloon → `say`; click inside a cut → `focus`; **Shift+click** → camera `path` keyframe (appends to the selected path step, or starts a new one); **Alt+click** on a cut with a floor → `player` move; the bar above the canvas adds `wait` / `return` |
| Flow: edit | Drag a node onto another node to move it before that node (◀ ▶ in the bar also shift it); **Delete** removes the node (the whole trigger when the entry node is selected); drag the entry diamond onto an object to attach the trigger to it (`z`/`near` + `target`, `range` in the bar); **+ entry** then click an object (or empty space) to start a new trigger |
| Flow list | The list on the right stays in sync and edits the details: step kind, wait seconds, keyframe `t`/`zoom`/`ease`, trigger `when` |
| Camera path | Select a `path` step (in either mode): its keyframes appear as numbered camera rectangles. Drag the centre to move, the bottom-right corner to change zoom, **+ kf** to append, Delete to remove the selected keyframe; `t`, `zoom`, `ease` are edited inline |
| Select a child | Click it on the canvas (topmost z first) or in the Cut panel's children list; Esc goes back to the cut |
| Move / resize a child | Drag it; drag a corner handle to resize (text uses its optional `box`); arrow keys nudge by 1, Shift+arrows by 10 |
| Add / remove children | **add: sprite / balloon / text / shape** buttons in the Cut panel; **Delete** (or the Delete key) removes, **Ctrl+D** duplicates. Deleting a balloon also drops the `say` steps that used it |
| Sprite frames | Pick the atlas, then click cells in the thumbnail strip to add/remove frames (the order is the beat order); `flip`, `tint`, `mode` below |
| Balloon | `kind` chooses speech (oval), shout (jagged) or thought (cloud with trailing bubbles); `line` picks a dialogue id and shows its text; tick **tail** and drag the orange handle to aim it (or type the vector) |
| Preview | ▶ on a trigger (or **Play** for the selected one). The yellow rectangle is the camera; `say` steps show the balloon text and wait for **Space** (the Z key in game). ■ or Esc stops |

Coordinates are integers in page space (y up). Sprites whose atlas has a PNG (see `media/atlases.ts`, mirrored from `bevy/src/art.rs`) are drawn with their first frame; code-generated atlases show as boxes. Editing balloon text in place (writing back to the dialogue file) is the next step.
