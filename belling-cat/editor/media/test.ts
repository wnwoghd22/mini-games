import { test } from "node:test";
import assert from "node:assert/strict";
import { triangulate, contains, bbox, signedArea2 } from "./polygon";
import { formatScene } from "./format";
import type { Vec2 } from "./model";

test("triangulates convex and concave polygons in either winding", () => {
  const square: Vec2[] = [[0, 0], [10, 0], [10, 10], [0, 10]];
  assert.equal(triangulate(square).length, 2);
  assert.equal(triangulate([...square].reverse()).length, 2);
  // L shape (concave), clockwise.
  const l: Vec2[] = [[0, 0], [0, 10], [4, 10], [4, 4], [10, 4], [10, 0]];
  const tris = triangulate(l);
  assert.equal(tris.length, 4);
  // Every triangle centroid must be inside the polygon.
  for (const [a, b, c] of tris) {
    const cx = (l[a][0] + l[b][0] + l[c][0]) / 3;
    const cy = (l[a][1] + l[b][1] + l[c][1]) / 3;
    assert.ok(contains(l, [cx, cy]), `centroid ${cx},${cy} outside`);
  }
});

test("contains and bbox", () => {
  const l: Vec2[] = [[0, 0], [0, 10], [4, 10], [4, 4], [10, 4], [10, 0]];
  assert.ok(contains(l, [2, 8]));
  assert.ok(!contains(l, [8, 8]));
  assert.deepEqual(bbox(l), { min: [0, 0], max: [10, 10] });
  assert.ok(signedArea2([[0, 0], [10, 0], [10, 10]]) > 0);
});

test("formatScene keeps vertices on one line each", () => {
  const out = formatScene({ version: 1, cuts: [{ id: "a", polygon: [[1, 2], [3, 4], [5, 6]], children: [] }], flow: [{ on: "z", steps: [{ focus: "a" }] }] });
  assert.match(out, /\[1, 2\],\n\s+\[3, 4\]/);
  assert.match(out, /\{ "focus": "a" \}/);
  assert.deepEqual(JSON.parse(out).cuts[0].polygon, [[1, 2], [3, 4], [5, 6]]);
});

import { parseDialogue, writeDialogue } from "./dialogue";

test("dialogue parser reads headers, bodies, comments and duplicates", () => {
  const src = "# c\n[elder.1] elder\nThe council has spoken.\nThe old bell is failing.\n\n[me.1]\nhm\n\n[me.1] me\nagain\n";
  const d = parseDialogue(src);
  assert.equal(d.lines.get("elder.1")?.text, "The council has spoken.\nThe old bell is failing.");
  assert.equal(d.lines.get("elder.1")?.speaker, "elder");
  assert.equal(d.lines.get("me.1")?.text, "again");
  assert.equal(d.warnings.length, 1);
  const round = parseDialogue(writeDialogue(d.lines));
  assert.deepEqual([...round.lines], [...d.lines]);
});

import { balloonOutline, tailTip, thoughtBubbles } from "./balloon";

test("balloon outlines differ by kind and tails are capped", () => {
  const size: Vec2 = [300, 140];
  const oval = balloonOutline("speech", size);
  const shout = balloonOutline("shout", size);
  const cloud = balloonOutline("thought", size);
  const maxR = (pts: Vec2[]) => Math.max(...pts.map(([x, y]) => Math.hypot(x / 150, y / 70)));
  const minR = (pts: Vec2[]) => Math.min(...pts.map(([x, y]) => Math.hypot(x / 150, y / 70)));
  assert.ok(Math.abs(maxR(oval) - 1) < 1e-6 && Math.abs(minR(oval) - 1) < 1e-6);
  assert.ok(minR(shout) < 0.8 && maxR(shout) > 0.99);
  assert.ok(minR(cloud) < 0.95 && maxR(cloud) > 0.99 && minR(cloud) > 0.85);
  const tip = tailTip(size, [0, -500]);
  assert.ok(tip[1] < -70 && tip[1] >= -70 - 90 - 1e-6);
  assert.equal(thoughtBubbles(size, [0, -300]).length, 3);
});

import { snapAxis, snapPoint, snapBox, constrainAxis } from "./snap";

test("alignment snapping picks the nearest candidate within the threshold", () => {
  assert.deepEqual(snapAxis(103, [50, 100, 110], 8), { value: 100, snapped: 100 });
  assert.deepEqual(snapAxis(120, [50, 100, 110], 8), { value: 120, snapped: null });
  const p = snapPoint([103, -4], [100], [0], 8);
  assert.deepEqual(p.point, [100, 0]);
  assert.equal(p.guideX, 100);
  // A 100-wide box whose left edge is 3 away from x=0 snaps its edge, moving the centre to 50.
  const b = snapBox([53, 0], [100, 40], [0], [], 8);
  assert.deepEqual(b.point, [50, 0]);
  assert.deepEqual(constrainAxis([0, 0], [30, 10]), [30, 0]);
  assert.deepEqual(constrainAxis([0, 0], [5, -10]), [0, -10]);
});

import { layoutFlow, insertStep, moveStep, triggerAnchor } from "./flow";
import type { Scene } from "./model";

function flowScene(): Scene {
  return {
    version: 1,
    cuts: [
      { id: "a", polygon: [[-100, 100], [100, 100], [100, -100], [-100, -100]], floor_y: -80, walk: [-80, 80],
        children: [{ type: "sprite", id: "lamp", pos: [50, 0], size: [20, 20], frames: ["mouse:0"] }, { type: "balloon", id: "b1", pos: [0, 60], size: [80, 40], line: "x" }] },
      { id: "b", polygon: [[200, 100], [400, 100], [400, -100], [200, -100]], children: [] },
    ],
    player: { cut: "a", x: -50, frames: { idle: "mouse:0", walk: ["walk:0"], jump: "mouse:3" } },
    flow: [{ on: "z", target: "lamp", steps: [{ focus: "b" }, { wait: 0.5 }, { say: "b1" }, { return: true }] }],
  };
}

test("flow layout anchors nodes to their targets and floats wait between neighbours", () => {
  const scene = flowScene();
  const nodes = layoutFlow(scene, scene.flow[0]);
  assert.deepEqual(nodes[0].pos, [50, 0]); // entry at the lamp
  assert.deepEqual(nodes[1].pos, [300, 0]); // focus b → cut centre
  assert.ok(nodes[2].floating && nodes[2].index === 2); // wait placed between focus and say
  assert.deepEqual(nodes[3].pos, [0, 60]); // say → balloon
  assert.deepEqual(nodes[4].pos, [0, 0]); // return → home cut centre
  assert.deepEqual(triggerAnchor(scene, { on: "right_edge", steps: [] }), [80, -40]);
});

test("insertStep and moveStep keep 1-based node indices consistent", () => {
  const t = flowScene().flow[0];
  assert.equal(insertStep(t, { wait: 1 }, 0), 1);
  assert.deepEqual(t.steps[0], { wait: 1 });
  // Move node 1 (wait 1) to sit before node 4 (say).
  const idx = moveStep(t, 1, 4);
  assert.equal(idx, 3);
  assert.deepEqual(t.steps.map((s) => Object.keys(s)[0]), ["focus", "wait", "wait", "say", "return"]);
  assert.deepEqual(t.steps[2], { wait: 1 });
  // Move the last node to the front.
  assert.equal(moveStep(t, 5, 1), 1);
  assert.deepEqual(Object.keys(t.steps[0]), ["return"]);
});


import { updateDialogueBlock } from "./dialogue";
import { fitFont, textBox, wrapLines } from "./balloon";

test("updateDialogueBlock edits one block in place and appends new ids", () => {
  const src = "# c\n[elder.1] elder\nOld line.\nSecond.\n\n[me.1] me\nhm\n";
  const edited = updateDialogueBlock(src, "elder.1", "New line.");
  assert.equal(edited, "# c\n[elder.1] elder\nNew line.\n\n[me.1] me\nhm\n");
  const appended = updateDialogueBlock(edited, "scout.3", "Hello\nthere");
  assert.match(appended, /\n\[scout\.3\] scout\nHello\nthere\n$/);
  assert.equal(parseDialogue(appended).lines.get("scout.3")?.text, "Hello\nthere");
  assert.equal(parseDialogue(appended).lines.get("elder.1")?.text, "New line.");
});

test("balloon text shrinks to fit and wraps by words", () => {
  const box = textBox([300, 140]);
  assert.equal(fitFont("Short.", 13, box), 13);
  // Seven paragraphs need 7 × 13 × 1.3 = 118 px of height, more than the 98 available.
  const long = "one\ntwo\nthree\nfour\nfive\nsix\nseven";
  const f = fitFont(long, 13, box);
  assert.ok(f < 13 && f >= 8, `got ${f}`);
  assert.ok(7 * f * 1.3 <= box[1]);
  assert.ok(wrapLines(long, f, box).every((l) => l.length * f * 0.62 <= box[0] + 1e-6));
});
