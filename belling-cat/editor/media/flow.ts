// Flow graph helpers: where each node sits on the page, and list edits used by the canvas.
// Pure functions so they can be unit-tested without a DOM.

import type { Scene, Cut, Child, Step, Trigger, Vec2 } from "./model";
import { bbox, boxCenter } from "./polygon";

export interface FlowNode {
  /** 0 = the trigger (entry), n = steps[n-1]. */
  index: number;
  /** For path steps: one node per keyframe, in order. */
  keyframe?: number;
  pos: Vec2;
  label: string;
  /** True when the node has no natural position and was placed between its neighbours. */
  floating: boolean;
}

function findChild(scene: Scene, id: string): { cut: Cut; child: Child } | undefined {
  for (const cut of scene.cuts) for (const child of cut.children ?? []) if (child.id === id) return { cut, child };
  return undefined;
}

function cutById(scene: Scene, id: string): Cut | undefined {
  return scene.cuts.find((c) => c.id === id);
}

function playerHome(scene: Scene): Vec2 {
  const cut = cutById(scene, scene.player.cut);
  if (!cut) return [0, 0];
  const h = (scene.player.size ?? [142, 142])[1];
  return [scene.player.x, (cut.floor_y ?? boxCenter(bbox(cut.polygon))[1]) + h / 2];
}

/** Where the entry node of a trigger sits. */
export function triggerAnchor(scene: Scene, trigger: Trigger): Vec2 {
  if (trigger.target) {
    const hit = findChild(scene, trigger.target);
    if (hit) return [...hit.child.pos] as Vec2;
    const cut = cutById(scene, trigger.target);
    if (cut) return boxCenter(bbox(cut.polygon));
  }
  if (trigger.on === "right_edge" || trigger.on === "left_edge") {
    const cut = cutById(scene, scene.player.cut);
    if (cut) {
      const b = bbox(cut.polygon);
      const [x0, x1] = cut.walk ?? [b.min[0], b.max[0]];
      const y = cut.floor_y ?? boxCenter(b)[1];
      return [trigger.on === "right_edge" ? x1 : x0, y + 40];
    }
  }
  return playerHome(scene);
}

export function triggerLabel(trigger: Trigger): string {
  return trigger.target ? `${trigger.on}@${trigger.target}` : trigger.on;
}

/** Natural anchor(s) of a step; empty for steps with no place of their own (wait). */
function stepAnchors(scene: Scene, step: Step, homeCut: string): Vec2[] {
  if ("focus" in step) {
    const cut = cutById(scene, step.focus);
    return cut ? [boxCenter(bbox(cut.polygon))] : [];
  }
  if ("say" in step) {
    const hit = findChild(scene, step.say);
    return hit ? [[...hit.child.pos] as Vec2] : [];
  }
  if ("path" in step) return step.path.map((k) => [k.x, k.y] as Vec2);
  if ("player" in step) {
    const cut = cutById(scene, step.player.cut);
    if (!cut) return [];
    const h = (scene.player.size ?? [142, 142])[1];
    return [[step.player.x, (cut.floor_y ?? boxCenter(bbox(cut.polygon))[1]) + h / 2]];
  }
  if ("return" in step) {
    const cut = cutById(scene, homeCut);
    return cut ? [boxCenter(bbox(cut.polygon))] : [];
  }
  return [];
}

export function stepLabel(step: Step): string {
  if ("focus" in step) return `focus ${step.focus}`;
  if ("say" in step) return `say ${step.say}`;
  if ("path" in step) return `path (${step.path.length})`;
  if ("wait" in step) return `wait ${step.wait}s`;
  if ("player" in step) return `player → ${step.player.cut}`;
  return "return";
}

/**
 * Lays out the nodes of a trigger. Floating nodes are placed between their neighbours;
 * consecutive nodes sharing an anchor are nudged apart so every node stays clickable.
 */
export function layoutFlow(scene: Scene, trigger: Trigger): FlowNode[] {
  const nodes: FlowNode[] = [{ index: 0, pos: triggerAnchor(scene, trigger), label: triggerLabel(trigger), floating: false }];
  let homeCut = scene.player.cut;
  const pending: FlowNode[] = [];
  const place = (node: FlowNode) => {
    // Resolve floating nodes queued before this one: spread them between the last placed and this.
    if (pending.length) {
      const prev = nodes[nodes.length - 1].pos;
      pending.forEach((f, i) => {
        const t = (i + 1) / (pending.length + 1);
        f.pos = [prev[0] + (node.pos[0] - prev[0]) * t, prev[1] + (node.pos[1] - prev[1]) * t + 70];
        nodes.push(f);
      });
      pending.length = 0;
    }
    nodes.push(node);
  };
  trigger.steps.forEach((step, i) => {
    const index = i + 1;
    if ("player" in step) homeCut = step.player.cut;
    const anchors = stepAnchors(scene, step, homeCut);
    if (!anchors.length) {
      pending.push({ index, pos: [0, 0], label: stepLabel(step), floating: true });
      return;
    }
    anchors.forEach((pos, k) => place({ index, keyframe: "path" in step ? k : undefined, pos, label: k === 0 ? stepLabel(step) : "", floating: false }));
  });
  if (pending.length) {
    const prev = nodes[nodes.length - 1].pos;
    pending.forEach((f, i) => {
      f.pos = [prev[0] + 90 * (i + 1), prev[1]];
      nodes.push(f);
    });
  }
  // Nudge nodes that share a position so each stays visible/clickable.
  const seen = new Map<string, number>();
  for (const n of nodes) {
    const key = `${Math.round(n.pos[0])},${Math.round(n.pos[1])}`;
    const count = seen.get(key) ?? 0;
    if (count > 0) n.pos = [n.pos[0] + 36 * count, n.pos[1] - 36 * count];
    seen.set(key, count + 1);
  }
  return nodes;
}

/** Inserts `step` after node `afterIndex` (0 = right after the entry). Returns the new step index (1-based). */
export function insertStep(trigger: Trigger, step: Step, afterIndex: number): number {
  const at = Math.max(0, Math.min(trigger.steps.length, afterIndex));
  trigger.steps.splice(at, 0, step);
  return at + 1;
}

/** Moves step node `from` so that it sits before node `before` (both 1-based; before may be steps.length+1). */
export function moveStep(trigger: Trigger, from: number, before: number): number {
  const steps = trigger.steps;
  if (from < 1 || from > steps.length) return from;
  const [step] = steps.splice(from - 1, 1);
  let target = before - 1;
  if (before > from) target -= 1;
  target = Math.max(0, Math.min(steps.length, target));
  steps.splice(target, 0, step);
  return target + 1;
}

export function removeStep(trigger: Trigger, index: number) {
  if (index >= 1 && index <= trigger.steps.length) trigger.steps.splice(index - 1, 1);
}
