// Types mirroring schema/scene.schema.json (see FORMAT.md).

export type Vec2 = [number, number];

export interface ChildBase {
  type: "sprite" | "balloon" | "text" | "shape";
  id: string;
  pos: Vec2;
  z?: number;
  clip?: boolean;
}
export interface SpriteChild extends ChildBase {
  type: "sprite";
  size: Vec2;
  frames: string[];
  mode?: "cycle" | "hold";
  flip?: boolean;
  tint?: string;
}
export interface BalloonChild extends ChildBase {
  type: "balloon";
  size: Vec2;
  tail?: Vec2;
  kind?: "speech" | "shout" | "thought";
  line: string;
  font?: number;
  initially?: "hidden" | "shown";
}
export interface TextChild extends ChildBase {
  type: "text";
  text: string;
  size?: number;
  color?: string;
  box?: Vec2;
}
export interface ShapeChild extends ChildBase {
  type: "shape";
  shape: "ellipse" | "rect";
  size: Vec2;
  color?: string;
  alpha?: number;
}
export type Child = SpriteChild | BalloonChild | TextChild | ShapeChild;

export interface Cut {
  id: string;
  label?: string;
  polygon: Vec2[];
  fill?: string;
  floor_y?: number;
  walk?: Vec2;
  /** "hidden": not drawn until a flow step first focuses the cut. */
  initially?: "hidden" | "shown";
  children?: Child[];
}

export interface Player {
  cut: string;
  x: number;
  size?: Vec2;
  frames: { idle: string; walk: string[]; jump: string };
  clip?: boolean;
}

export interface Keyframe {
  x: number;
  y: number;
  zoom: number;
  t: number;
  ease?: "smooth" | "linear";
}

export type Step =
  | { focus: string }
  | { say: string }
  | { path: Keyframe[] }
  | { wait: number }
  | { player: { cut: string; x: number } }
  | { return: true };

export type TriggerKind = "z" | "near" | "right_edge" | "left_edge" | "enter";

export interface Trigger {
  on: TriggerKind;
  target?: string;
  range?: number;
  when?: "always" | "flow_done";
  once?: boolean;
  steps: Step[];
}

export interface Scene {
  $schema?: string;
  version: 1;
  dialogue?: string;
  cuts: Cut[];
  player: Player;
  flow: Trigger[];
}

export const VIEW: Vec2 = [1080, 940];
/// Fraction of the view height a focused cut fills (same as the runtime).
export const FILL = 760 / 940;
export const SLIDE_SECONDS = 0.9;

export function stepKind(step: Step): keyof Step & string {
  return Object.keys(step)[0] as keyof Step & string;
}

export function emptyScene(): Scene {
  return {
    $schema: "../../../schema/scene.schema.json",
    version: 1,
    cuts: [],
    player: { cut: "", x: 0, frames: { idle: "mouse:0", walk: ["walk:0", "walk:1"], jump: "mouse:3" } },
    flow: [],
  };
}
